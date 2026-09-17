// Zip a built extension target for store submission.
//
// Exists because zipping the build by hand on macOS produces an archive both
// Chrome and AMO reject, in two separate ways:
//
//  1. Finder's "Compress" and `/usr/bin/zip` both write AppleDouble sidecars
//     (`__MACOSX/._name`) carrying extended attributes from the machine that
//     built it. AMO flags every one as a hidden file that "can contain
//     sensitive information about the system that generated the add-on".
//  2. Compressing the *directory* nests everything under `firefox/`, so the
//     manifest is not at the archive root. AMO's error for this ("No
//     manifest.json was found at the root of the extension") names the cause
//     but is easy to read as a build problem rather than a packaging one.
//
// So the archive is built explicitly from a known file list, entered from
// inside the target directory, with `-X` to drop extra file attributes. The
// contents are verified afterwards, because a submission rejected on packaging
// costs a review cycle and the check is nearly free.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = fileURLToPath(new URL("../extension", import.meta.url));

const TARGETS = ["chrome", "firefox"];

/** Anything matching these is a packaging artifact, never a shipped file. */
const EXCLUDED = [
  /^\./, // dotfiles, incl. AppleDouble `._*` and `.DS_Store`
  /^__MACOSX$/,
];

/**
 * Files present in the build but not part of a store package, by exact path.
 *
 * `Icon.png` is the Safari wrapper's app icon. No manifest references it —
 * `build-safari.mjs` reads it out of `dist/chrome/` as a directory, never from
 * an archive — so in a Chrome or AMO upload it is an unexplained image a
 * reviewer has to account for and a user never sees.
 *
 * Note this is NOT true of `icons/icon-{16,48,128}.png`, which look similar and
 * are not: `manifest.json` names all three, so omitting them fails upload
 * validation against a manifest pointing at files the package does not contain.
 * The store-listing icon and screenshots are a third thing again, entered in
 * each dashboard by hand and never read from the package at all.
 */
const NOT_SHIPPED = new Set(["Icon.png"]);

/**
 * Every file under `dir`, as paths relative to it, depth first.
 *
 * Built explicitly rather than handed to `zip -r` so that the exclusions are a
 * property of the list itself: a file that is not in the list cannot end up in
 * the archive by way of a glob the shell expanded differently than expected.
 */
function collect(dir, prefix = "") {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (EXCLUDED.some((re) => re.test(name))) continue;
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(abs).isDirectory()) out.push(...collect(abs, rel));
    else if (!NOT_SHIPPED.has(rel)) out.push(rel);
  }
  return out;
}

function pack(target) {
  const srcDir = path.join(extensionDir, "dist", target);
  if (!existsSync(srcDir)) {
    throw new Error(
      `extension/dist/${target} does not exist — run \`npm run ext\` first.`,
    );
  }

  const files = collect(srcDir);
  if (!files.includes("manifest.json")) {
    throw new Error(
      `extension/dist/${target}/manifest.json is missing. The store requires it at ` +
        `the archive root; a build that did not emit it cannot be packaged.`,
    );
  }

  const zipPath = path.join(extensionDir, "dist", `${target}.zip`);
  // Removed rather than updated: `zip` adds to an existing archive, so a file
  // dropped from the build would survive in every later package.
  rmSync(zipPath, { force: true });

  // `cwd` is the target directory, so entries are stored relative to it and the
  // manifest lands at the archive root. `-X` omits extra file attributes, which
  // is what suppresses the AppleDouble entries.
  execFileSync("zip", ["-q", "-X", zipPath, ...files], { cwd: srcDir });

  verify(zipPath, target, files);
}

/**
 * Re-read the finished archive and assert the two properties the stores check.
 *
 * Reading the archive back rather than trusting the arguments we passed: the
 * point is to catch a `zip` that behaved differently than expected, which is
 * exactly the case an argument-level check would miss.
 */
function verify(zipPath, target, expected) {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const entries = listing.split("\n").filter(Boolean);

  const hidden = entries.filter((e) =>
    e.split("/").some((segment) => segment.startsWith(".") || segment === "__MACOSX"),
  );
  if (hidden.length > 0) {
    throw new Error(
      `${target}.zip contains hidden files, which stores reject:\n` +
        hidden.map((e) => `  ${e}`).join("\n"),
    );
  }

  if (!entries.includes("manifest.json")) {
    throw new Error(
      `${target}.zip has no manifest.json at its root — found:\n` +
        entries.map((e) => `  ${e}`).join("\n"),
    );
  }

  const missing = expected.filter((f) => !entries.includes(f));
  if (missing.length > 0) {
    throw new Error(
      `${target}.zip is missing built files:\n` + missing.map((f) => `  ${f}`).join("\n"),
    );
  }

  // Every path the manifest names must exist in the archive. A manifest
  // referencing a file the package does not contain fails upload validation, and
  // the store's error names the missing file rather than the reason it went
  // missing — so the check belongs here, next to the exclusion lists that are
  // the only way it can happen.
  const manifest = JSON.parse(
    execFileSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" }),
  );
  const referenced = [
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    manifest.background?.scripts,
  ]
    .flat()
    .filter((v) => typeof v === "string");

  const dangling = referenced.filter((f) => !entries.includes(f));
  if (dangling.length > 0) {
    throw new Error(
      `${target}.zip: manifest.json references files the package does not contain:\n` +
        dangling.map((f) => `  ${f}`).join("\n") +
        `\nEither the build did not emit them, or they are being excluded by ` +
        `NOT_SHIPPED / EXCLUDED in this script.`,
    );
  }

  const size = statSync(zipPath).size;
  console.log(
    `[extension] ${path.relative(process.cwd(), zipPath)} — ` +
      `${entries.length} files, ${(size / 1024).toFixed(0)} KB`,
  );
}

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TARGETS;
for (const target of targets) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown target "${target}" — expected one of ${TARGETS.join(", ")}.`);
  }
  pack(target);
}
