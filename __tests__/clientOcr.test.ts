import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { canRunClientOcr } from "@/lib/clientOcr";
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

// Client-side OCR is the privacy and cost win of roadmap Phase 0: the image is
// read on the user's device, so a screenshot of someone's private messages is
// never uploaded, and the app's only expensive server function goes unused for
// browsers that can do the work.
//
// These cover the capability probe that decides between the local path and the
// server fallback. The recognition itself needs a real DOM, canvas and WASM
// runtime, so it is not exercised here — the probe is what decides whether a
// browser attempts it at all, and getting that wrong either uploads images
// unnecessarily or breaks upload entirely.

const REQUIRED = ["WebAssembly", "createImageBitmap", "document"] as const;

function stubEnvironment(present: readonly string[]) {
  for (const name of REQUIRED) {
    if (present.includes(name)) {
      vi.stubGlobal(name, name === "WebAssembly" ? {} : () => {});
    } else {
      vi.stubGlobal(name, undefined);
    }
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("canRunClientOcr — deciding between on-device OCR and the server", () => {
  it("reports true when the browser has everything OCR needs", () => {
    stubEnvironment(REQUIRED);
    expect(canRunClientOcr()).toBe(true);
  });

  it("reports false without WebAssembly, which the OCR core requires", () => {
    stubEnvironment(["createImageBitmap", "document"]);
    expect(canRunClientOcr()).toBe(false);
  });

  it("reports false without createImageBitmap, used to decode and orient", () => {
    // The app supports iOS 15+ per browserslist, so this is a real fallback
    // path rather than a theoretical one.
    stubEnvironment(["WebAssembly", "document"]);
    expect(canRunClientOcr()).toBe(false);
  });

  it("reports false with no document, so it never runs during SSR", () => {
    // CheckFlow is a client component, but the probe must not throw if it is
    // ever reached on the server.
    stubEnvironment(["WebAssembly", "createImageBitmap"]);
    expect(canRunClientOcr()).toBe(false);
  });

  it("does not throw when nothing is available", () => {
    stubEnvironment([]);
    expect(() => canRunClientOcr()).not.toThrow();
    expect(canRunClientOcr()).toBe(false);
  });
});

describe("OCR asset wiring — the paths clientOcr requests must exist", () => {
  // A mismatch between the constants in lib/clientOcr.ts and what
  // scripts/copy-ocr-assets.mjs produces fails only in the browser, at upload
  // time, as a 404 inside a Web Worker. Assert the contract here instead.
  //
  // The assets are generated, not committed (see .gitignore), and CI runs the
  // tests without a build — so run the copy script first rather than assuming
  // someone has built locally. That makes this a test of the script's output,
  // which is the contract that matters, instead of a test of ambient state.
  beforeAll(() => {
    execFileSync("node", ["scripts/copy-ocr-assets.mjs"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
  });

  const source = readFileSync(path.join(process.cwd(), "lib/clientOcr.ts"), "utf8");

  function constant(name: string): string {
    const match = source.match(new RegExp(`const ${name} = "([^"]+)"`));
    if (!match) throw new Error(`${name} not found in lib/clientOcr.ts`);
    return match[1];
  }

  it("serves the worker script from our own origin, not a CDN", () => {
    const workerPath = constant("WORKER_PATH");
    expect(workerPath.startsWith("/")).toBe(true);
    expect(existsSync(path.join(process.cwd(), "public", workerPath))).toBe(true);
  });

  it("serves every core variant the browser can ask for", () => {
    // Not a fixed list of names. The browser worker chooses a core by probing
    // relaxed SIMD, then SIMD, then neither, each with an LSTM and a non-LSTM
    // build, and loads that name with no fallback — so the set it may request
    // is what has to be on disk. Reading the names out of tesseract.js's own
    // resolver keeps this honest: an earlier version of this test asserted two
    // names by hand, they went stale when the core package was upgraded, and
    // the test kept passing because those files still existed for other
    // reasons while the ones browsers actually fetch were never copied.
    const resolver = readFileSync(
      path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/browser/getCore.js"),
      "utf8",
    );
    const wanted = [...resolver.matchAll(/\/(tesseract-core[a-z-]*\.wasm\.js)`/g)].map((m) => m[1]);

    // Guard the extraction itself — a resolver rewrite that matches nothing
    // would otherwise make this assert against an empty list and pass.
    expect(wanted.length).toBe(6);

    const corePath = constant("CORE_PATH");
    expect(corePath.startsWith("/")).toBe(true);
    const dir = path.join(process.cwd(), "public", corePath);
    for (const name of wanted) {
      expect(existsSync(path.join(dir, name)), `${name} missing from public${corePath}`).toBe(true);
    }
  });

  it("points at the committed gzipped language data", () => {
    // The engine is configured with gzip: true; pointing at a plain
    // eng.traineddata would 404 against our origin.
    const langPath = constant("LANG_PATH");
    expect(existsSync(path.join(process.cwd(), "public", langPath, "eng.traineddata.gz"))).toBe(true);
    expect(source).toContain("gzip: true");
  });

  it("requests no external origin, so the CSP cannot block it", () => {
    // next.config.ts sets connect-src 'self'. Any absolute URL here would be
    // blocked at runtime — the failure this whole asset-copying setup avoids.
    expect(source).not.toMatch(/https?:\/\/(?!\S*\bexample\b)/);
  });
});
