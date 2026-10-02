// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Client-side OCR — runs tesseract.js in the browser so images never leave the
// user's device.
//
// PRIVACY: this is the stronger version of the promise the app already makes.
// Server OCR meant uploading a screenshot of, often, someone's private
// messages; here the image is read in a Web Worker on their own machine and
// nothing is transmitted. /api/ocr remains for browsers that cannot run the
// WASM core (see canRunClientOcr).
//
// COST: server OCR is the app's only expensive function — 60s timeout, high
// memory, native sharp + tesseract. Moving the common case on-device removes
// that spend for everyone whose browser can do the work.
//
// Assets are served from our own origin (public/tesseract/, populated by
// scripts/copy-ocr-assets.mjs) rather than tesseract's default CDN, because the
// CSP in next.config.ts allows no external origin.

const WORKER_PATH = "/tesseract/worker.min.js";
const CORE_PATH = "/tesseract";
const LANG_PATH = "/tessdata";

/** Longest we let a single image run before giving up and offering the server. */
const OCR_TIMEOUT_MS = 60_000;

/** Matches the server's resize cap — bigger costs time and gains no accuracy. */
const MAX_WIDTH = 1800;

/**
 * Whether this browser can run OCR locally.
 *
 * Requires WebAssembly (the OCR core) and createImageBitmap (decoding and EXIF
 * orientation). Both are broadly available, but the app supports iOS 15+ per
 * browserslist, so callers must fall back rather than assume.
 */
export function canRunClientOcr(): boolean {
  return (
    typeof WebAssembly === "object" &&
    typeof createImageBitmap === "function" &&
    typeof document !== "undefined"
  );
}

/**
 * Decode, orient and downscale an image, returning a canvas blob.
 *
 * Replaces the server's sharp pipeline (rotate → resize → flatten → jpeg):
 *   · createImageBitmap({ imageOrientation: "from-image" }) applies EXIF
 *     rotation, which phone photos rely on
 *   · drawImage onto an opaque white canvas flattens any alpha channel, so a
 *     transparent PNG does not OCR as black-on-black
 *   · the width cap matches the server's, keeping accuracy comparable
 *
 * Format support differs from sharp: the browser decodes what it can display,
 * which covers JPEG/PNG/WebP/GIF everywhere and HEIC on Safari. Anything it
 * refuses throws, and the caller falls back to the server, where sharp handles
 * the long tail.
 */
async function preprocess(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });

  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  // Opaque background first — this is the flatten() step.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9),
  );
  if (!blob) throw new Error("Could not encode image");
  return blob;
}

/**
 * Extract text from an image on-device.
 *
 * Throws if OCR is unavailable or fails, so the caller can fall back to the
 * server route. A successful run with no readable text resolves to "" — that is
 * an answer, not a failure, and must not trigger a fallback upload.
 */
export async function recogniseImageText(file: File): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const processed = await preprocess(file);

  const worker = await createWorker("eng", 1, {
    workerPath: WORKER_PATH,
    corePath: CORE_PATH,
    langPath: LANG_PATH,
    // The language file is the committed .gz; without this tesseract looks for
    // an uncompressed eng.traineddata and 404s against our own origin.
    gzip: true,
    logger: () => {},
  });

  try {
    const result = await Promise.race([
      worker.recognize(processed),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Client OCR timed out")), OCR_TIMEOUT_MS),
      ),
    ]);
    // Same noise cleanup the server applies, so both paths return alike.
    return result.data.text.replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    // Always release the worker: it holds a few MB of WASM heap, and leaking one
    // per upload would degrade a long session.
    await worker.terminate().catch(() => {});
  }
}
