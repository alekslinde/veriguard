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
      // work on the popup on a missing PNG.
      const iconsSrc = here("icons");
      if (existsSync(iconsSrc)) {
        const iconsOut = path.join(outDir, "icons");
        mkdirSync(iconsOut, { recursive: true });
        for (const size of [16, 48, 128]) {
          const from = path.join(iconsSrc, `icon-${size}.png`);
          if (existsSync(from)) copyFileSync(from, path.join(iconsOut, `icon-${size}.png`));
        }
      } else {
        console.warn(`[extension] no icons/ directory — manifest references icons that will 404`);
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
    emptyOutDir: true,
    minify: false,
    target: "es2022",
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: here("src/popup.ts"),
        background: here("src/background.ts"),
      },
      output: {
        // Flat, predictable names: the manifest references `background.js` by
        // path, and a hashed filename would have to be read back out of the
        // bundle to write the manifest.
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
