// What a verdict on a cut-off email did and did not cover.
//
// A forward larger than the inbound size limit used to be dropped, and the
// person who sent it heard nothing — the worst answer a scam checker can give,
// since silence reads as "probably fine". The receiving side now keeps the
// first part and says it was cut, and this module turns that into two plain
// lists for the reply: what we checked, and what we could not.
//
// A forward's order is on our side: headers first, then the message text,
// then attachments. The part that decides a verdict — who it claims to be
// from, the wording, the links — is usually inside the part that arrived.
//
// Pure string work over the received prefix. No I/O.

import type { AnalyzedIdentifier } from "@veriguard/engine/scamDetector";
import { mimeManifest, ManifestPart } from "@/lib/mime";

export interface PartialCheck {
  receivedBytes: number;
  totalBytes: number;
  // Our own phrases for what the verdict covered.
  checked: string[];
  // Whether the message text itself was cut off partway.
  textCut: boolean;
  // Every attachment, which is never opened whether it arrived whole or not.
  // `name` is the sender's filename when there is one — attacker-controlled
  // text, so the reply formatter defangs it before it is shown.
  attachments: { name: string; complete: boolean }[];
}

// Cut a truncated message back to its last complete line, so no analyser sees
// half a header, half a URL or half a base64 line as though it were whole.
export function trimToLastLine(raw: string): string {
  const end = raw.lastIndexOf("\n");
  return end === -1 ? raw : raw.slice(0, end + 1);
}

// "7.4 MB", "820 KB". Decimal units, as mail clients show attachment sizes.
export function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
}

// A part with no Content-Type is text by default, but only if it arrived whole:
// one the cut went through may have lost its Content-Type line, and is as
// likely the start of an attachment as more text.
const isText = (p: ManifestPart) =>
  p.type === "text/plain" || p.type === "text/html" || (p.type === "" && p.complete);

// A reader-facing name for a part we did not check. A filename is returned as
// the sender wrote it; see PartialCheck.attachments.
function describe(p: ManifestPart): string {
  if (p.filename) return p.filename;
  if (p.type.startsWith("image/")) return "an image";
  if (p.type === "application/pdf") return "a PDF";
  if (p.type.startsWith("audio/")) return "an audio file";
  if (p.type.startsWith("video/")) return "a video";
  if (p.type === "") return "one more part";
  return "an attachment";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export interface PartialCheckInput {
  // The received prefix, as analysed.
  raw: string;
  receivedBytes: number;
  totalBytes: number;
  // Whether a sender was found in the scope we analysed.
  hasSender: boolean;
  results: AnalyzedIdentifier[];
}

export function describePartialCheck(input: PartialCheckInput): PartialCheck {
  const { raw, receivedBytes, totalBytes, hasSender, results } = input;
  const parts = mimeManifest(raw, true);

  const checked: string[] = [];
  if (hasSender) checked.push("who it claims to be from");

  const textParts = parts.filter(isText);
  const textCut = textParts.some((p) => !p.complete);
  if (textParts.length > 0) {
    checked.push(textCut ? "the message text, up to where it was cut off" : "the message text");
  }

  const links = results.filter((r) => r.kind === "url").length;
  const phones = results.filter((r) => r.kind === "phone").length;
  if (links) checked.push(plural(links, "link", "links"));
  if (phones) checked.push(plural(phones, "phone number", "phone numbers"));

  const attachments = parts.filter((x) => !isText(x)).map((p) => ({ name: describe(p), complete: p.complete }));
  return { receivedBytes, totalBytes, checked, textCut, attachments };
}
