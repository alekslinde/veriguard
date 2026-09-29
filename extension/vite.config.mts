// Build for both browsers.
//
// `TARGET=chrome|firefox` selects the manifest variant; everything else is
// identical, which is the point — one bundle, reviewed once.
//
// Not minified. AMO reviews source and dislikes opaque minified bundles, and
// this extension's claim is that you can read it and see it makes no network
// call. Minifying to save a few hundred KB on a local-only bundle would trade
// the reviewability for nothing a user experiences.

import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import path from "node:path";
// Written with its extension, unlike the rest of the repo's imports. Vite's
// coming native config loader reads this file as real ESM rather than bundling
// it first, and Node's resolver does not guess extensions — so an extensionless
// specifier here becomes a load failure once that default flips.
//
// `tsc` accepts the extension because `allowImportingTsExtensions` is set,
// which is in turn only legal because the repo type-checks with `noEmit`. That
// is the whole reason this can be spelled correctly for both tools at once; the
// alternative was picking which one to leave warning.
import { buildManifest, type Target } from "./src/manifest.ts";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const TARGET = (process.env.TARGET ?? "chrome") as Target;
if (TARGET !== "chrome" && TARGET !== "firefox") {
  throw new Error(`TARGET must be "chrome" or "firefox", got "${TARGET}"`);
}

const outDir = here(`dist/${TARGET}`);

/**
 * Which entry this pass builds — see the note on `rollupOptions` below for why
 * they are built separately rather than as two inputs to one build.
 *
 * `popup` goes first and owns clearing the output directory and emitting the
 * static assets; `background` follows and must not wipe it.
 */
const ENTRIES = ["popup", "background", "onboarding"] as const;
type Entry = (typeof ENTRIES)[number];

const ENTRY = (process.env.ENTRY ?? "popup") as Entry;
if (!ENTRIES.includes(ENTRY)) {
  throw new Error(`ENTRY must be one of ${ENTRIES.join(", ")}, got "${ENTRY}"`);
}
const IS_FIRST_PASS = ENTRY === "popup";

/**
 * The extension's own version, from `extension/package.json`.
 *
 * **Deliberately not the app's.** A published extension's version is a
 * store-visible, monotonic release counter: every submission needs a number
 * higher than the last, and a number that shipped can never be reused or
 * withdrawn. Tying that to the app's version meant the two constrained each
 * other in both directions — a typo fix on the website would burn an extension
 * version that reviewers might take days to approve, and an extension hotfix
 * would require bumping the whole project to ship. Neither is a decision either
 * release should be making for the other. The engine already versions itself
 * separately for the same reason.
 *
 * `buildVersion` enforces the stores' format, which is narrower than semver —
 * see the note there.
 */
const { version: rawVersion } = JSON.parse(
  readFileSync(here("package.json"), "utf8"),
) as { version: string };

/**
 * The version as the stores will accept it.
 *
 * All three want one to four dot-separated integers and nothing else. Semver
 * pre-release and build metadata (`-beta.1`, `+sha`) are rejected outright by
 * Chrome and AMO rather than tolerated, and the failure arrives at upload time
 * — after a build, at the end of a release, which is the worst moment to
 * discover it. So it is checked here, where the build fails immediately and
 * says what to fix.
 *
 * A pre-release suffix is stripped rather than rejected: `0.2.0-rc.1` is a
 * reasonable thing to have in the file while testing, and it means the same
 * shipped artifact as `0.2.0`. Anything else is an error, because silently
 * reinterpreting a version is how a wrong number reaches a store listing that
 * cannot be taken back.
 */
function buildVersion(raw: string): string {
  const core = raw.split("-")[0].trim();
  if (!/^\d+(\.\d+){0,3}$/.test(core)) {
    throw new Error(
      `extension/package.json version "${raw}" is not a store-acceptable version. ` +
        `Chrome, AMO and Safari all require one to four dot-separated integers ` +
        `(e.g. "0.2.0"); a pre-release suffix is allowed in the file and dropped here.`,
    );
  }
  // Leading zeros are legal semver but Chrome rejects them ("01" is not 1).
  const normalised = core
    .split(".")
    .map((part) => String(Number(part)))
    .join(".");
  return normalised;
}

const version = buildVersion(rawVersion);

/**
 * Firefox add-on id.
 *
 * An id is required to sign, and the same id must be used for every future
 * upload or the add-on becomes a different add-on. Configurable so a fork or a
 * local unsigned build does not have to edit source, with a default that is
 * obviously this project's.
 */
const GECKO_ID = process.env.GECKO_ID ?? "veriguard@veriguard.app";

/**
 * Origin the blocklist is fetched from.
 *
 * Baked in at build time and named in the manifest's `connect-src`, so the
 * bundle and the policy cannot disagree about where it may connect. Overridable
 * for a local build against a dev server; the default is production.
 *
 * Trailing slash stripped, because it is concatenated with a path and
 * `https://host//api/blocklist` is a different URL to some caches and proxies.
 */
const API_BASE = (process.env.API_BASE ?? "https://veriguard.app").replace(/\/+$/, "");

/** Emits the manifest and the static popup assets into the build output. */
function emitStaticAssets() {
  return {
    name: "veriguard-extension-assets",
    closeBundle() {
      // Written once, on the pass that also clears the directory. Emitting from
      // both passes would rewrite identical files for no reason and make the
      // warning below appear twice.
      if (!IS_FIRST_PASS) return;
      mkdirSync(outDir, { recursive: true });

      writeFileSync(
        path.join(outDir, "manifest.json"),
        JSON.stringify(
          buildManifest(TARGET, { version, geckoId: GECKO_ID, apiBase: API_BASE }),
          null,
          2,
        ) + "\n",
      );

      for (const file of [
        "popup.html",
        "popup.css",
        "onboarding.html",
        "onboarding.css",
      ]) {
        copyFileSync(here(`src/${file}`), path.join(outDir, file));
      }

      // Icons are referenced by the manifest, so a build without them installs
      // with a broken toolbar entry. Warn rather than fail: the bundle is still
      // loadable unpacked for development, and failing the build would block
      // work on the popup on a missing PNG. `npm run icons` generates them.
      const iconsSrc = here("icons");
      if (existsSync(iconsSrc)) {
        const iconsOut = path.join(outDir, "icons");
        mkdirSync(iconsOut, { recursive: true });
        for (const size of [16, 48, 128]) {
          const from = path.join(iconsSrc, `icon-${size}.png`);
          if (existsSync(from)) copyFileSync(from, path.join(iconsOut, `icon-${size}.png`));
        }
        // The Safari wrapper's app icon, at the extension root where the
        // converter looks for it. Unlike the three above it is not referenced by
        // the manifest — Chrome and Firefox ignore it, and Safari's generated
        // Xcode project fails to BUILD without it rather than merely rendering a
        // placeholder.
        const appIcon = path.join(iconsSrc, "Icon.png");
        if (existsSync(appIcon)) copyFileSync(appIcon, path.join(outDir, "Icon.png"));
      } else {
        console.warn(
          "[extension] no icons/ directory — run `npm run icons`. " +
            "The manifest references icons that will 404, and the Safari build will fail.",
        );
      }
    },
  };
}

export default defineConfig({
  root: here("."),
  plugins: [emitStaticAssets()],
  // Inlined rather than read from storage or a config file: the value must match
  // the manifest's `connect-src`, and a build-time constant is what makes the
  // two impossible to desynchronise.
  define: {
    __API_BASE__: JSON.stringify(API_BASE),
    // Which build this is, for the `source` param on a report link the USER
    // clicks. Derived from TARGET rather than sniffed at runtime: the browser
    // is known at build time, and reading a user agent to tell Edge from Chrome
    // would buy a distinction the stores do not report anyway (Edge installs
    // the Chromium build from the Chrome Web Store) at the cost of inspecting
    // something identifying. Safari wraps the Chrome build, so it reports as
    // chromium until it ships its own listing.
    __REPORT_SOURCE__: JSON.stringify(TARGET === "firefox" ? "ext-firefox" : "ext-chromium"),
  },
  build: {
    outDir,
    // Only the first pass clears the directory — the second would otherwise
    // delete the first pass's output.
    emptyOutDir: IS_FIRST_PASS,
    minify: false,
    target: "es2022",
    modulePreload: false,
    // One entry per build. `ENTRY` selects which; `npm run ext:*` runs each in
    // turn, with `emptyOutDir` on only for the first so the later passes do not
    // delete its output.
    //
    // Two builds rather than one with two inputs, because the bundler hoists
    // code shared between entries into a chunk each then imports — and a background
    // script carrying a bare `import` is an ES module, which needs
    // `"type": "module"` in the manifest. Safari does not support that key on a
    // background service worker: it drops it with a warning, the worker fails to
    // load its import, and the context menu never registers. Nothing errors
    // visibly, the entry point just is not there.
    //
    // `manualChunks: undefined` does not prevent this — it controls how chunks
    // are grouped, not whether shared code is extracted at all. Building each
    // entry alone, with splitting off, is what makes each output
    // self-contained. `__tests__/extensionBundle.test.ts` asserts the result on
    // the built files, because the failure it prevents is silent.
    rollupOptions: {
      input: { [ENTRY]: here(`src/${ENTRY}.ts`) },
      output: {
        // Flat, predictable names: the manifest references `background.js` by
        // path, and a hashed filename would have to be read back out of the
        // bundle to write the manifest.
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        // Everything this entry needs, in this entry's file — no chunk is ever
        // split out, so neither output carries an import for Safari to choke
        // on. Replaces `inlineDynamicImports: true`, which Vite 8's bundler
        // deprecated in favour of this spelling; same behaviour, and the name
        // now says what the build actually depends on rather than naming one
        // case of it.
        codeSplitting: false,
      },
    },
  },
});
