import type { NextConfig } from "next";

// Content Security Policy — prevents the browser from making any outbound
// requests to external origins. This is the hard guarantee that even if
// a bug or future code change tried to fetch a suspicious URL, the browser
// would block it before a single byte left the machine.
//
// connect-src 'self'  → fetch()/XHR can only call our own API routes. This
//                        also covers the OCR WASM core and language data, which
//                        are served from our origin (public/tesseract/,
//                        public/tessdata/) rather than tesseract's default CDN
//                        — the CDN fetch would be blocked, by design.
// img-src 'self' data: blob: → canvas preview, no external pixel trackers
// frame-ancestors 'none' → can't be embedded in an iframe (clickjacking)
// form-action 'self'  → form POSTs can only go to our own origin
// worker-src blob:    → tesseract.js spawns Web Workers from blob: URLs
//                        (client-side OCR, lib/clientOcr.ts)
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires these
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "worker-src blob: 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Keep native-module packages out of the Next.js bundle so they load
  // directly from node_modules at runtime.
  serverExternalPackages: ["sharp", "tesseract.js"],

  // `sharp` is imported by exactly one route (app/api/ocr), but listing it in
  // serverExternalPackages above makes Next's tracer resolve it for every
  // route, putting its native binaries in all 18 function bundles. The libvips
  // binary alone unpacks to ~18 MB, which was the entire baseline size of
  // functions that never call sharp. So it is stripped from everything here
  // and added back for the one route that needs it, under Includes below.
  //
  // Keys are route globs matched with picomatch, which does not cross a "/":
  // "*" matches the "/" route and nothing else, so a rule meant for every
  // route has to be "/**". Excludes are matched against the route path
  // ("/api/ocr"), not the trace filename ("/api/ocr/route").
  //
  // Verify a change here against a production build's own file list, not the
  // .nft.json traces: those resolve the binaries of whatever machine ran the
  // build, so a local trace reports a bundle no deployment will have. The
  // globs stay platform-agnostic for the same reason — naming an architecture
  // pins the wrong one as soon as the build and dev machines differ.
  outputFileTracingExcludes: {
    "/**": ["./node_modules/@img/**", "./node_modules/sharp/**"],
  },

  // Tesseract resolves two runtime assets by string path, neither of which
  // Next.js file tracing can detect statically, so both must be declared here
  // or Vercel omits them from the function bundle:
  //   1. eng.traineddata.gz  — language data (process.cwd()/public/tessdata)
  //   2. the LSTM WASM cores — readFileSync'd by their JS shim at runtime (the
  //      .js shim IS traced, the .wasm binary is not).
  // Without the .wasm file the worker fails to initialise; the failure is
  // otherwise silent and the request hangs until the client aborts.
  //
  // All three LSTM builds ship because the runtime picks one by feature
  // detection — relaxed SIMD, then SIMD, then neither — and that choice belongs
  // to the machine the function lands on, not to us. Listing a single build was
  // what broke this route in production: it resolved a relaxed-SIMD core that
  // the deployment had never included. The non-LSTM halves stay out because the
  // route creates its worker with OEM 1 (LSTM-only), which is what makes this a
  // safe narrowing rather than another guess — change that argument and these
  // three stop being the reachable set. ~8.8 MB, against ~18 MB for all six.
  outputFileTracingIncludes: {
    "/api/ocr": [
      "./public/tessdata/**/*",
      "./node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
      "./node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
      // Added back after the blanket exclude above strips it from every route.
      "./node_modules/sharp/**",
      "./node_modules/@img/**",
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
