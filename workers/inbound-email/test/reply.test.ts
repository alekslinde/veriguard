// Unit tests for the reply MIME builder. Uses the built-in node:test runner
// (Node ≥ 22 runs TypeScript natively) so the worker needs no test deps.
// Run with: npm test  (in workers/inbound-email)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReplyMime, buildMinimalReplyMime, truncateReferences } from "../src/reply.ts";

const REPLY = {
  subject: "Scam alert: the email you forwarded",
  text: "🚨 This looks like a scam.\n\n— Veriguard",
  html: '<p style="font-weight:bold">🚨 This looks like a scam.</p>',
};

const OPTS = {
  from: "check@veriguard.app",
  to: "victim@gmail.com",
  messageId: "<orig-123@gmail.com>",
  references: "<thread-1@gmail.com>",
};

test("addresses the reply from the receiving address to the original sender", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  // Addresses are literal; the display name and subject are RFC 2047
  // encoded-words because they carry non-ASCII (mimetext default).
  assert.match(mime, /^From:.*<check@veriguard\.app>/m);
  assert.match(mime, /^To:.*<victim@gmail\.com>/m);
  assert.match(mime, /^Subject: =\?utf-8\?B\?/m);
  // The subject decodes back to the original text.
  const subjectB64 = mime.match(/^Subject: =\?utf-8\?B\?([^?]+)\?=/m)?.[1] ?? "";
  assert.equal(Buffer.from(subjectB64, "base64").toString("utf8"), REPLY.subject);
});

test("threads via In-Reply-To and a preserved+appended References chain", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /^In-Reply-To: <orig-123@gmail\.com>/m);
  // References keeps the prior chain and appends the message being replied to.
  assert.match(mime, /^References: <thread-1@gmail\.com> <orig-123@gmail\.com>/m);
});

test("marks the message as an automated reply (RFC 3834)", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /^Auto-Submitted: auto-replied/m);
});

test("includes both a plain-text and an HTML part", () => {
  const mime = buildReplyMime(REPLY, OPTS);
  assert.match(mime, /Content-Type: text\/plain/);
  assert.match(mime, /Content-Type: text\/html/);
  assert.match(mime, /multipart\/alternative/);
});

test("omits threading headers when there is no Message-ID", () => {
  const mime = buildReplyMime(REPLY, { from: OPTS.from, to: OPTS.to });
  assert.doesNotMatch(mime, /^In-Reply-To:/m);
  assert.doesNotMatch(mime, /^References:/m);
});

test("still produces a valid message body when given empty threading refs", () => {
  const mime = buildReplyMime(REPLY, { from: OPTS.from, to: OPTS.to, messageId: null, references: null });
  assert.match(mime, /^From:.*check@veriguard\.app/m);
  assert.doesNotMatch(mime, /^References:/m);
});

// Each forwarding hop appends one References entry, and a mail platform may
// refuse to reply to a message carrying more than 100 of them. A reply that
// appended without bound would hand the next hop a chain one longer than the
// one it received.

test("a short References chain is passed through unchanged", () => {
  const chain = "<a@x.test> <b@x.test> <c@x.test>";
  assert.equal(truncateReferences(chain), chain);
});

test("a repeated Message-ID appears once", () => {
  // The common shape: a forward whose References is just its own Message-ID.
  // Appending the message being replied to duplicated the entry it already
  // ended with, and every observed refusal carried exactly this.
  assert.equal(truncateReferences("<a@x.test> <a@x.test>"), "<a@x.test>");
  assert.equal(
    truncateReferences("<a@x.test> <b@x.test> <a@x.test>"),
    "<a@x.test> <b@x.test>",
  );
});

test("a reply to a single-entry chain carries that ID exactly once", () => {
  const mime = buildReplyMime(REPLY, { ...OPTS, references: OPTS.messageId });
  const header = mime.match(/^References: (.*)$/m)?.[1] ?? "";
  assert.equal(header.trim(), OPTS.messageId);
});

test("a chain at the keep-everything boundary is not truncated", () => {
  // 21 entries = root + 20 recent, the most that survives intact.
  const ids = Array.from({ length: 21 }, (_, i) => `<id-${i}@x.test>`);
  assert.equal(truncateReferences(ids.join(" ")).split(" ").length, 21);
});

test("a long chain is bounded, keeping the thread root and the recent entries", () => {
  const ids = Array.from({ length: 150 }, (_, i) => `<id-${i}@x.test>`);
  const out = truncateReferences(ids.join(" ")).split(" ");

  assert.equal(out.length, 21, "a bounded chain cannot grow into the refusal");
  // Clients group a thread by its root and nest the reply by the latest entry,
  // so those are the two ends that have to survive; the middle is droppable
  // under RFC 5322 §3.6.4.
  assert.equal(out[0], "<id-0@x.test>", "the thread root must survive");
  assert.equal(out.at(-1), "<id-149@x.test>", "the most recent entry must survive");
});

test("a reply to a deeply forwarded message carries a bounded References header", () => {
  // The end-to-end property: the failing case from production, through the
  // builder rather than the helper alone.
  const longChain = Array.from({ length: 120 }, (_, i) => `<hop-${i}@x.test>`).join(" ");
  const mime = buildReplyMime(REPLY, { ...OPTS, references: longChain });

  const header = mime.match(/^References: (.*)$/m)?.[1] ?? "";
  assert.ok(header.split(/\s+/).length <= 21, "the built reply must stay bounded");
  assert.match(header, /<hop-0@x\.test>/);
  // The message being replied to is still the last entry after truncation.
  assert.match(header, /<orig-123@gmail\.com>$/);
});

// TEMPORARY — covers the minimal-reply probe. Remove with the probe itself.
//
// The probe's value is entirely in what it OMITS: if a reply built this way is
// accepted while the full one is refused, the difference is the diagnosis. A
// header creeping back in would silently make the two builders equivalent and
// the experiment would prove nothing, so the omissions are what is asserted.

test("the minimal probe omits every header the full reply adds", () => {
  const mime = buildMinimalReplyMime(REPLY, { from: OPTS.from, to: OPTS.to });
  assert.doesNotMatch(mime, /^In-Reply-To:/m);
  assert.doesNotMatch(mime, /^References:/m);
  assert.doesNotMatch(mime, /^Auto-Submitted:/m);
  assert.doesNotMatch(mime, /multipart\/alternative/);
  assert.doesNotMatch(mime, /text\/html/);
});

test("the minimal probe still addresses and identifies itself correctly", () => {
  // Recipient and sender domain are platform requirements, not decoration —
  // dropping either would make a refusal uninformative.
  const mime = buildMinimalReplyMime(REPLY, { from: OPTS.from, to: OPTS.to });
  assert.match(mime, /^From:.*check@veriguard\.app/m);
  assert.match(mime, /^To:.*<victim@gmail\.com>/m);
  assert.match(mime, /^Subject: /m);
  assert.match(mime, /Content-Type: text\/plain/);
  assert.match(mime, /This looks like a scam/);
});
