// Tests for reading a forward up to the size cap. Past the cap the forward is
// kept in part, not dropped, so the API can still give a verdict on it.

import { test } from "node:test";
import assert from "node:assert/strict";

import { readCapped } from "../src/stream.ts";

/** A stream delivering `text` in chunks of `size` bytes, recording a cancel. */
function streamOf(text: string, size: number): { stream: ReadableStream<Uint8Array>; cancelled: () => boolean } {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
}

test("a message under the cap is read whole", async () => {
  const { stream } = streamOf("From: a@b.test\r\n\r\nhello", 4);
  const out = await readCapped(stream, 1000);
  assert.equal(out.text, "From: a@b.test\r\n\r\nhello");
  assert.equal(out.truncated, false);
});

test("a message over the cap keeps exactly the first maxBytes", async () => {
  const { stream, cancelled } = streamOf("x".repeat(95), 10);
  const out = await readCapped(stream, 42);
  assert.equal(out.bytes, 42);
  assert.equal(out.text.length, 42);
  assert.equal(out.truncated, true);
  assert.equal(cancelled(), true, "the rest must not be read off the wire");
});

test("a message of exactly maxBytes is not reported as cut", async () => {
  const { stream } = streamOf("y".repeat(40), 10);
  const out = await readCapped(stream, 40);
  assert.equal(out.truncated, false);
  assert.equal(out.bytes, 40);
});

test("a cut inside a multi-byte character decodes without throwing", async () => {
  const { stream } = streamOf("ab—cd", 1);
  const out = await readCapped(stream, 3); // "ab" + first byte of the em dash
  assert.equal(out.truncated, true);
  assert.ok(out.text.startsWith("ab"));
});
