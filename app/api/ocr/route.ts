import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import path from "path";
import { checkAndRecordRateLimit } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";
import { isSameOriginRead } from "@/lib/readGuard";

// Tesseract OCR can take 30–60 s on a cold start.
// Default Vercel function timeout (10 s) is too short.
export const maxDuration = 60;

/**
 * Per-IP budget over RATE_WINDOW_MS (ten minutes), for the app's single most
 * expensive endpoint: a 20 MB upload, a native sharp decode and a 60-second
 * OCR run, all unauthenticated.
 *
 * Every other route was throttled and this one was not, which made it the
 * cheapest way to burn the function budget — post large images in a loop and
 * the bill (or the quota) goes with it. Client-side OCR handles the common case
 * on-device (lib/clientOcr.ts), so this route is only the fallback for browsers
 * that cannot run the WASM core; 12 images per ten minutes is well clear of
 * what one person checking screenshots does in a sitting, and nowhere near
 * enough to sustain an attack.
 */
const OCR_RATE_LIMIT = 12;

// Language data is committed to public/tessdata/ and served from there.
// process.cwd() resolves to the project root in both dev and production.
const LANG_PATH = path.join(process.cwd(), "public", "tessdata");

// Singleton worker — created on first request, reused after that.
// Using global so Next.js hot-reload doesn't create duplicate workers in dev.
declare global {
  var _ocrWorker: ReturnType<typeof createWorker> | undefined;
}

function getWorker() {
  if (!global._ocrWorker) {
    global._ocrWorker = createWorker("eng", 1, {
      langPath: LANG_PATH,
      // Suppress tesseract's internal progress/debug logging, but DO surface
      // errors — a swallowed errorHandler turns a worker-init failure (e.g. a
      // missing WASM core file) into a silent hang instead of a fast failure.
      logger: () => {},
      errorHandler: (err) => console.error("OCR worker error:", err),
    });
  }
  return global._ocrWorker;
}

export async function POST(req: NextRequest) {
  // Cost controls first — before reading the body, let alone decoding it.
  // Same two layers, and the same order, as /api/reports: reject before doing
  // the expensive work.
  //
  // 1. Same-origin only. This serves the image-check flow on this site
  //    (components/CheckFlow.tsx), which fetches it same-origin. Forgeable by
  //    design — see isSameOriginRead — so it is a filter, not a lock; the rate
  //    limit below is what actually bounds a determined caller.
  if (!isSameOriginRead(req.headers)) {
    return NextResponse.json(
      { error: "This endpoint serves the image check on this site.", code: "forbidden_origin" },
      { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } },
    );
  }

  // 2. Per-IP rate limit, namespaced so OCR shares the limiter without starving
  //    the submission and check budgets.
  //
  //    Only applied when the caller can be identified: clientIpFromHeaders
  //    returns "unknown" for a missing or malformed x-forwarded-for, and keying
  //    on that would put every such visitor in one bucket and take the fallback
  //    down for all of them at once — the same reasoning /api/reports documents.
  const ip = clientIpFromHeaders(req.headers);
  if (ip !== "unknown" && !checkAndRecordRateLimit(`ocr:${ip}`, OCR_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many images — give it a few minutes and try again.", code: "rate_limited" },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Guard: only accept multipart uploads — direct API callers without a
  // proper Content-Type won't have a valid image and can be dropped early.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse upload" }, { status: 400 });
  }

  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No image field in upload" }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large — max 20 MB" }, { status: 413 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // ── Format normalisation with sharp ───────────────────────────────────────
  // sharp handles HEIC, HEIF, JPEG, PNG, WebP, TIFF, AVIF, and more.
  // We convert everything to JPEG before passing to Tesseract so the OCR
  // engine always gets a known format regardless of what the client sent.
  // The rotate() call corrects EXIF orientation (common in phone photos).
  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await sharp(rawBuffer)
      .rotate()                                            // fix EXIF rotation
      .resize({ width: 1800, withoutEnlargement: true })  // cap for OCR speed
      .flatten({ background: "#ffffff" })                 // merge alpha onto white
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that image. Any photo or screenshot format should work — try a different file." },
      { status: 422 },
    );
  }

  // ── OCR ───────────────────────────────────────────────────────────────────
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(jpegBuffer);

    // Clean up common OCR noise: multiple blank lines, leading/trailing space
    const text = data.text
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return NextResponse.json({ text });
  } catch (err) {
    // If the singleton worker is in a bad state, clear it so the next
    // request gets a fresh one.
    global._ocrWorker = undefined;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("OCR error:", msg);
    return NextResponse.json(
      { error: "Text extraction failed. Please paste the text manually." },
      { status: 500 },
    );
  }
}
