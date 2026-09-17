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

/**
 * Name patterns that are packaging artifacts rather than shipped files.
 *
 * Applied to files only, never directories — see `collect`. `Thumbs.db` and
 * `desktop.ini` are here alongside the macOS ones because AMO flags them the
 * same way, and a build directory that has been opened over a Windows share or
 * synced through one picks them up.
 */
const EXCLUDED = [
  /^\./, // dotfiles, incl. AppleDouble `._*` and `.DS_Store`
  /^__MACOSX$/,
  /^Thumbs\.db$/i,
  /^desktop\.ini$/i,
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
 * Fail early, and legibly, if the archive tools are not on PATH.
 *
 * Both are present on macOS and on the usual CI images, so the realistic case
 * is a minimal container. Without this the first `execFileSync` throws a bare
 * `spawnSync zip ENOENT`, which says nothing about what to install — and it
 * would surface at release time, packaging a build that is otherwise fine.
 */
function requireTools() {
  for (const tool of ["zip", "unzip"]) {
    try {
      execFileSync(tool, ["-v"], { stdio: "ignore" });
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new Error(
          `\`${tool}\` is not on PATH. Packaging shells out to zip/unzip; ` +
            `install the Info-ZIP tools (macOS ships both; Debian: \`apt-get install zip unzip\`).`,
        );
      }
      throw err;
    }
  }
}

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
    const abs = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;

    // Directories are tested only for hiddenness, and never against
    // `NOT_SHIPPED` / the artifact-name patterns, which describe files. A
    // hidden directory is skipped, but loudly: dropping one silently is how a
    // whole subtree of real build output could go missing without any later
    // check noticing, since everything downstream compares against this list.
    if (statSync(abs).isDirectory()) {
      if (name.startsWith(".") || name === "__MACOSX") {
        console.warn(`[extension] skipping hidden directory ${rel}/ — not packaged.`);
        continue;
      }
      out.push(...collect(abs, rel));
      continue;
    }

    if (EXCLUDED.some((re) => re.test(name))) continue;
    if (NOT_SHIPPED.has(rel)) continue;
    out.push(rel);
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
 * Re-read the finished archive and assert the properties the stores check:
 * no hidden entries, a manifest at the root, contents matching the file list in
 * both directions, and no manifest reference dangling.
 *
 * Reading the archive back rather than trusting the arguments we passed: `zip`
 * warns but still exits 0 on a file it could not add, so its exit status is not
 * evidence the archive contains what we asked for.
 */
function verify(zipPath, target, expected) {
  const listing = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const entries = listing.split("\n").filter(Boolean);

  // Matches the same shapes `EXCLUDED` filters during `collect`, on every path
  // segment rather than just the basename — the sidecars that caused the
  // original rejection appeared as `__MACOSX/firefox/._icons`, where only an
  // inner segment gives it away.
  const hidden = entries.filter((e) =>
    e
      .split("/")
      .some(
        (segment) =>
          segment.startsWith(".") ||
          segment === "__MACOSX" ||
          /^(thumbs\.db|desktop\.ini)$/i.test(segment),
      ),
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

  // Compared in both directions, because the two failures are different and
  // neither is caught by `zip`'s exit status — it warns and still exits 0 on a
  // file it could not add.
  //
  //   missing: a file we asked for is not in the archive (silently dropped).
  //   extra:   the archive holds something we never listed — a directory record,
  //            a sidecar, anything a future flag change starts emitting. This is
  //            the direction that matters for the hidden-file rejection, since
  //            an entry nothing put in the list is exactly what slipped through
  //            before.
  const expectedSet = new Set(expected);
  const missing = expected.filter((f) => !entries.includes(f));
  const extra = entries.filter((e) => !expectedSet.has(e));

  if (missing.length > 0 || extra.length > 0) {
    const parts = [`${target}.zip does not match the file list it was built from.`];
    if (missing.length > 0) {
      parts.push(`Missing (asked for, not in archive):\n` + missing.map((f) => `  ${f}`).join("\n"));
    }
    if (extra.length > 0) {
      parts.push(`Unexpected (in archive, never listed):\n` + extra.map((f) => `  ${f}`).join("\n"));
    }
    throw new Error(parts.join("\n"));
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
    manifest.background?.page,
    manifest.options_page,
    manifest.options_ui?.page,
    manifest.sandbox?.pages,
    manifest.chrome_url_overrides
      ? Object.values(manifest.chrome_url_overrides)
      : [],
    // Array-of-objects sections: each entry carries its own file lists.
    ...(manifest.content_scripts ?? []).map((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
    ...(manifest.web_accessible_resources ?? []).map((war) =>
      // MV3 spells this as objects with `resources`; MV2 as a bare string array.
      typeof war === "string" ? war : (war.resources ?? []),
    ),
  ]
    .flat()
    .filter((v) => typeof v === "string")
    // Globs are legal in `web_accessible_resources` and cannot be compared to a
    // literal entry. Skipped rather than half-matched: a wrong answer here would
    // fail a package that is actually fine.
    .filter((v) => !v.includes("*"));

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

requireTools();

const requested = process.argv.slice(2);
const targets = requested.length > 0 ? requested : TARGETS;
for (const target of targets) {
  if (!TARGETS.includes(target)) {
    throw new Error(`Unknown target "${target}" — expected one of ${TARGETS.join(", ")}.`);
  }
  pack(target);
}
