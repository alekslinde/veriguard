// Copies the tesseract.js browser runtime into public/ so OCR can run on the
// user's device instead of on our server.
//
// Why copy rather than let tesseract fetch its own assets: by default
// tesseract.js pulls the worker script and WASM core from a CDN. Our CSP is
// `default-src 'self'` (next.config.ts) and deliberately allows no external
// origin, so those fetches are blocked. Serving the same files from our own
// origin keeps the CSP intact — no external request is ever made, which is the
// same guarantee the rest of the app already gives.
//
// Copied (not committed): the cores are ~4 MB each and are reproducible from
// node_modules, so they are generated at build time and gitignored. The
// language data (eng.traineddata.gz) IS committed — it does not ship with a
// package we depend on.
//
// WHICH FILES, AND WHY ALL SIX: the browser worker picks its core at runtime by
// feature detection, then loads that one file by name from the directory we
// point it at (`corePath`). It probes relaxed SIMD, then SIMD, then neither,
// and each tier has an LSTM and a non-LSTM build — six names in total, none of
// which it will fall back from. Whichever the visitor's browser asks for has to
// be on disk already, so shipping a subset means shipping a blank page to
// whoever lands on the missing tier. Copying all six costs build output, not
// request size: a visitor downloads exactly one.
//
// The names come from tesseract.js's own resolver rather than a list written
// out here. A hardcoded list is why this broke once already — the v7 core
// package renamed and expanded these builds, the list kept naming files that
// still existed for other reasons, and the copy step went on reporting success
// while the file browsers actually request was never copied at all.
//
// The browser wants the `.wasm.js` build: it embeds the WASM rather than
// fetching a sibling `.wasm`, so one file per variant is the whole story. The
// bare `.wasm` files are for the Node path and are traced into the serverless
// function by next.config.ts, not served from here.
//
// Run: npm run ocr-assets  (also runs automatically via prebuild)
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const OUT = new URL("../public/tesseract/", import.meta.url);

const CORE_DIR = path.dirname(require.resolve("tesseract.js-core/package.json"));
const WORKER = require.resolve("tesseract.js/dist/worker.min.js");

/**
 * Every core the browser worker can ask for, derived the way it derives them.
 *
 * Mirrors the two booleans in tesseract.js's browser getCore — the relaxed-SIMD
 * / SIMD / neither tier, crossed with the lstmOnly flag. Keeping the shape of
 * that function means a future variant shows up as a missing file below (a hard
 * failure) instead of a name nobody remembered to add.
 */
const CORE_VARIANTS = ["relaxedsimd", "simd", ""].flatMap((tier) =>
  [true, false].map((lstmOnly) => {
    const suffix = [tier, lstmOnly ? "lstm" : ""].filter(Boolean).join("-");
    return `tesseract-core${suffix ? `-${suffix}` : ""}.wasm.js`;
  }),
);

const FILES = [
  [WORKER, "worker.min.js"],
  ...CORE_VARIANTS.map((name) => [path.join(CORE_DIR, name), name]),
];

mkdirSync(OUT, { recursive: true });

const missing = [];
let copied = 0;
for (const [src, name] of FILES) {
  if (!existsSync(src)) {
    missing.push(path.basename(src));
    continue;
  }
  copyFileSync(src, new URL(name, OUT));
  copied += 1;
}

// Fail the build rather than warn. These files are only ever read by a browser
// that has already committed to one of them, so a missing core is not a
// degraded build — it is a broken one for some slice of visitors, and it is
// invisible until one of them uploads an image.
if (missing.length > 0) {
  console.error(
    `✗ ${missing.length} tesseract core file(s) not found in ${CORE_DIR}:\n` +
      missing.map((m) => `    ${m}`).join("\n") +
      `\n  The core package's filenames have changed. Check what it ships now ` +
      `and update the variant list in this script to match.`,
  );
  process.exit(1);
}

console.log(`✓ copied ${copied}/${FILES.length} tesseract assets into public/tesseract/`);
