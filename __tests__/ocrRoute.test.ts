import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Mutable hooks so individual tests can make sharp / the OCR worker succeed
// or throw without re-declaring the (hoisted) module mocks.
const h = vi.hoisted(() => ({
  toBufferImpl: async (): Promise<Buffer> => Buffer.from("fake-jpeg"),
  recognizeImpl: async (): Promise<{ data: { text: string } }> => ({
    data: { text: "extracted text" },
  }),
}));

// sharp is a chainable builder: sharp(buf).rotate().resize().flatten().jpeg().toBuffer()
vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    flatten: () => chain,
    jpeg: () => chain,
    toBuffer: () => h.toBufferImpl(),
  };
  return { default: () => chain };
});

// tesseract.js: createWorker(...) resolves to a worker with .recognize()/.terminate()
vi.mock("tesseract.js", () => ({
  createWorker: async () => ({
    recognize: () => h.recognizeImpl(),
    terminate: async () => {},
  }),
}));

import { POST } from "@/app/api/ocr/route";
import { NextRequest } from "next/server";

function multipartRequest(file?: Blob): NextRequest {
  const form = new FormData();
  if (file) form.append("image", file, "shot.png");
  // Passing a FormData body makes the runtime set a multipart content-type.
  return new NextRequest("http://localhost/api/ocr", { method: "POST", body: form });
}

const pngBlob = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

beforeEach(() => {
  // Reset the cached singleton worker and default the mocks to success.
  (globalThis as { _ocrWorker?: unknown })._ocrWorker = undefined;
  h.toBufferImpl = async () => Buffer.from("fake-jpeg");
  h.recognizeImpl = async () => ({ data: { text: "extracted text" } });
});

describe("POST /api/ocr — request guards", () => {
  it("rejects a non-multipart content type with 400", async () => {
    const req = new NextRequest("http://localhost/api/ocr", {
      method: "POST",
      body: "plain text",
      headers: { "content-type": "text/plain" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Expected multipart/form-data" });
  });

  it("rejects an upload with no image field with 400", async () => {
    const res = await POST(multipartRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No image field in upload" });
  });

  it("rejects an image over 20 MB with 413", async () => {
    const tooBig = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/png" });
    const res = await POST(multipartRequest(tooBig));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Image too large — max 20 MB" });
  });
});

describe("POST /api/ocr — image processing", () => {
  it("returns 422 when sharp cannot decode the image", async () => {
    h.toBufferImpl = async () => {
      throw new Error("unsupported image format");
    };
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/couldn't read that image/i);
  });

  it("returns the extracted text on success", async () => {
    h.recognizeImpl = async () => ({ data: { text: "  pay your invoice now  " } });
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "pay your invoice now" });
  });

  it("collapses runs of blank lines in the OCR output", async () => {
    h.recognizeImpl = async () => ({ data: { text: "line one\n\n\n\nline two\n" } });
    const res = await POST(multipartRequest(pngBlob()));
    expect(await res.json()).toEqual({ text: "line one\n\nline two" });
  });
});

describe("POST /api/ocr — worker failure", () => {
  it("returns 500 and clears the cached worker so the next request retries fresh", async () => {
    h.recognizeImpl = async () => {
      throw new Error("worker crashed");
    };
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/text extraction failed/i);
    // A bad singleton must be discarded so it doesn't poison later requests.
    expect((globalThis as { _ocrWorker?: unknown })._ocrWorker).toBeUndefined();
  });
});

describe("OCR deployment tracing — the cores the server can resolve must ship", () => {
  // The mocks above replace tesseract.js wholesale, which is right for testing
  // this route's control flow and is also why they can say nothing about which
  // WASM core the real library loads. That gap had teeth: the route ran green
  // here and in local dev while every production request failed at worker
  // startup, because the deployment shipped one core and the runtime resolved
  // another. Local dev cannot catch it either — a full node_modules always has
  // the file. Only the deployment bundle is ever missing one.
  //
  // So assert the contract that actually broke: whatever Node's resolver can
  // choose, next.config.ts has to trace into the function bundle.
  const OEM_LSTM = 1;

  it("traces every core the node resolver can pick for this route's OEM", () => {
    const resolver = readFileSync(
      path.join(process.cwd(), "node_modules/tesseract.js/src/worker-script/node/getCore.js"),
      "utf8",
    );
    // The resolver requires bare module ids; the sibling .wasm each one reads
    // at runtime is what tracing misses, so check for those.
    const all = [...resolver.matchAll(/tesseract\.js-core\/(tesseract-core[a-z-]*)/g)].map(
      (m) => `${m[1]}.wasm`,
    );
    expect(all.length).toBe(6);

    // The route builds its worker with OEM 1, so only the LSTM builds are
    // reachable. Deriving that from the route rather than restating it means
    // changing the OEM widens this assertion instead of silently invalidating
    // it — the non-LSTM cores would become reachable and untraced.
    const route = readFileSync(path.join(process.cwd(), "app/api/ocr/route.ts"), "utf8");
    const oem = Number(route.match(/createWorker\("eng",\s*(\d+)/)?.[1]);
    expect(oem).toBe(OEM_LSTM);
    const reachable = all.filter((n) => n.includes("-lstm."));
    expect(reachable.length).toBe(3);

    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    for (const name of reachable) {
      expect(config, `${name} is resolvable at runtime but not traced in next.config.ts`).toContain(
        name,
      );
    }
  });

  it("does not pin corePath on the node path, where the library ignores it", () => {
    // Passing one is not merely inert: it reads as a guarantee that a single
    // core is in use, which is what justified tracing exactly one file.
    const route = readFileSync(path.join(process.cwd(), "app/api/ocr/route.ts"), "utf8");
    expect(route).not.toMatch(/corePath:/);
  });
});
