// Reading a forward's raw message, up to a size cap.
//
// Past the cap the message used to be dropped, and the forwarder heard
// nothing. It now keeps the first `maxBytes` and says it stopped: a forward's
// headers and text come before its attachments, so the part that decides a
// verdict is usually inside what we keep. The API analyses that part and the
// reply says what was left out.

export interface ReadResult {
  text: string;
  // Bytes kept, which is at most maxBytes.
  bytes: number;
  // Whether the stream held more than maxBytes and reading stopped early.
  truncated: boolean;
}

export async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<ReadResult> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - total;
    if (value.length > room) {
      // Keep what fits and stop reading: the rest is never pulled off the wire.
      if (room > 0) chunks.push(value.subarray(0, room));
      total += Math.max(0, room);
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }
  // Not fatal on bad UTF-8: a cut can land inside a multi-byte character, and
  // one replacement character at the end costs nothing.
  return { text: new TextDecoder().decode(merged), bytes: total, truncated };
}
