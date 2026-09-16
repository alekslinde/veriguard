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
// Extensionless, matching the rest of the repo's imports: `moduleResolution:
// "bundler"` in tsconfig resolves it, and writing "./src/manifest.ts" instead
// trades a Vite config-loader warning for a tsc error across the whole repo.
import { buildManifest, type Target } from "./src/manifest";

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
const ENTRY = (process.env.ENTRY ?? "popup") as "popup" | "background";
if (ENTRY !== "popup" && ENTRY !== "background") {
  throw new Error(`ENTRY must be "popup" or "background", got "${ENTRY}"`);
}
const IS_FIRST_PASS = ENTRY === "popup";

// Version tracks the app's, so a bug report naming a version identifies one
// build of everything rather than one build of the extension.
const { version } = JSON.parse(readFileSync(here("../package.json"), "utf8")) as { version: string };

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

      for (const file of ["popup.html", "popup.css"]) {
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
  },
  build: {
    outDir,
    // Only the first pass clears the directory — the second would otherwise
    // delete the first pass's output.
    emptyOutDir: IS_FIRST_PASS,
    minify: false,
    target: "es2022",
    modulePreload: false,
    // One entry per build. `ENTRY` selects which; `npm run ext:*` runs both in
    // turn, the second with `emptyOutDir` off so it does not delete the first.
    //
    // Two builds rather than one with two inputs, because Rollup hoists code
    // shared between entries into a chunk each then imports — and a background
    // script carrying a bare `import` is an ES module, which needs
    // `"type": "module"` in the manifest. Safari does not support that key on a
    // background service worker: it drops it with a warning, the worker fails to
    // load its import, and the context menu never registers. Nothing errors
    // visibly, the entry point just is not there.
    //
    // `manualChunks: undefined` does not prevent this — it controls how chunks
    // are grouped, not whether shared code is extracted at all. Building each
    // entry alone is what makes each output self-contained.
    rollupOptions: {
      input: { [ENTRY]: here(`src/${ENTRY}.ts`) },
      output: {
        // Flat, predictable names: the manifest references `background.js` by
        // path, and a hashed filename would have to be read back out of the
        // bundle to write the manifest.
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
        // Everything this entry needs, in this entry's file.
        inlineDynamicImports: true,
      },
    },
  },
});
