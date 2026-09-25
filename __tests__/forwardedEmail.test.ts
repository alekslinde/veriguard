import { describe, it, expect } from "vitest";
import { unwrapForwarded } from "@/lib/forwardedEmail";
import { parseEmailHeaders } from "@veriguard/engine/emailHeaders";

// The victim's own forward wrapper — every fixture is wrapped in headers that
// look like THIS, and the whole point is that we must NOT report these.
const FORWARDER = "victim@gmail.com";

// ── Apple Mail "Forward as Attachment" → message/rfc822 part ──
const APPLE_ATTACHMENT = [
  `From: ${FORWARDER}`,
  "To: check@veriguard.app",
  "Subject: Fwd: Your account",
  'Content-Type: multipart/mixed; boundary="APPLE-BOUND"',
  "",
  "--APPLE-BOUND",
  "Content-Type: text/plain",
  "",
  "Sending this on, looks dodgy.",
  "",
  "--APPLE-BOUND",
  "Content-Type: message/rfc822",
  "",
  "From: myGov <noreply@scam-evil.tk>",
  "Reply-To: collect@elsewhere.ru",
  "Subject: Your payment is pending",
  "Authentication-Results: mx.google.com; spf=fail; dmarc=fail",
  "",
  "Click here to verify.",
  "--APPLE-BOUND--",
].join("\n");

// ── Gmail inline forward ──
const GMAIL_INLINE = [
  `From: ${FORWARDER}`,
  "To: check@veriguard.app",
  "Subject: Fwd: Refund waiting",
  "",
  "Is this real??",
  "",
  "---------- Forwarded message ---------",
  "From: ATO <refunds@ato-refund.xyz>",
  "Date: Mon, 1 Jan 2026 at 09:00",
  "Subject: Refund waiting",
  "Reply-To: get@payme.cc",
  "To: <victim@gmail.com>",
  "",
  "You are owed $450. Confirm details.",
].join("\n");

// ── Outlook inline forward (>-quoted) ──
const OUTLOOK_INLINE = [
  `From: ${FORWARDER}`,
  "Subject: FW: Parcel held",
  "",
  "see below",
  "",
  "> -----Original Message-----",
  "> From: AusPost <delivery@aus-post.top>",
  "> Sent: Monday, 1 January 2026",
  "> Reply-To: pay@parcel-fee.info",
  "> Subject: Parcel held",
  ">",
  "> Pay the fee to release your parcel.",
].join("\n");

describe("unwrapForwarded", () => {
  it("recovers the original from an Apple message/rfc822 attachment", () => {
    const { raw, source } = unwrapForwarded(APPLE_ATTACHMENT);
    expect(source).toBe("attachment");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("noreply@scam-evil.tk");
    expect(h.replyTo).toBe("collect@elsewhere.ru");
    // Attachment fidelity: authentication verdicts survive too.
    expect(h.spf).toBe("fail");
    expect(h.dmarc).toBe("fail");
    expect(h.fromAddress).not.toBe(FORWARDER);
  });

  it("recovers the original from a Gmail inline forward", () => {
    const { raw, source } = unwrapForwarded(GMAIL_INLINE);
    expect(source).toBe("inline");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("refunds@ato-refund.xyz");
    expect(h.replyTo).toBe("get@payme.cc");
    expect(h.fromAddress).not.toBe(FORWARDER);
    // The quoted body must be preserved (not just the headers) so tracking
    // analysis can run on inline forwards.
    expect(raw).toContain("You are owed $450");
  });

  it("recovers the original from an Outlook quoted forward", () => {
    const { raw, source } = unwrapForwarded(OUTLOOK_INLINE);
    expect(source).toBe("inline");
    const h = parseEmailHeaders(raw);
    expect(h.fromAddress).toBe("delivery@aus-post.top");
    expect(h.replyTo).toBe("pay@parcel-fee.info");
  });

  it("treats a bare exported .eml (no forward wrapper) as the original", () => {
    const raw = [
      "From: scammer@bad.tk",
      "Reply-To: scammer@bad.tk",
      "Subject: hi",
      "",
      "body",
    ].join("\n");
    const out = unwrapForwarded(raw);
    expect(out.source).toBe("toplevel");
    expect(parseEmailHeaders(out.raw).fromAddress).toBe("scammer@bad.tk");
  });

  it("preserves quoted headers and body so tracking fires on inline forwards", () => {
    const forward = [
      `From: ${FORWARDER}`,
      "Subject: Fwd: alert",
      "",
      "look at this",
      "",
      "---------- Forwarded message ---------",
      "From: Bank <noreply@bank-evil.tk>",
      "Reply-To: collect@bank-evil.tk",
      "Disposition-Notification-To: spy@bank-evil.tk",
      "Subject: alert",
      "",
      '<img src="https://trk.bank-evil.tk/pixel/1" width="1" height="1">',
    ].join("\n");
    const { raw, source } = unwrapForwarded(forward);
    expect(source).toBe("inline");
    // Read-receipt header from the quote survives.
    expect(raw).toMatch(/Disposition-Notification-To:/i);
    // Body (pixel) survives.
    expect(raw).toContain("trk.bank-evil.tk/pixel/1");
  });

  it("does not crash on empty or junk input", () => {
    expect(unwrapForwarded("").source).toBe("toplevel");
    expect(unwrapForwarded("just some text\nno headers").source).toBe("toplevel");
  });
});

// ── Content above the forward marker must not be discarded ────────────────────
//
// unwrapForwarded took everything AFTER the earliest forward marker as the
// original. Appending a marker plus an innocuous block to a scam therefore hid
// the real content above it — free for an attacker, since they control the
// whole body:
//
//   <the actual scam>
//   ---------- Forwarded message ---------
//   From: noreply@ato.gov.au
//   Thanks for your payment.
//
// Measured at the time: 100/likely_scam with the URL flagged → 10, with the
// malicious link gone from the analysis entirely. Found by an adversarial probe
// of the path the live forward-to-us feature runs on.

describe("unwrapForwarded — text before the marker is kept", () => {
  const SCAM = "Verify now at https://mygov-verify.tk/unlock";

  it("keeps a scam that sits above an appended forward marker", () => {
    const raw = [
      "From: a@evil.tk",
      "Subject: Urgent",
      "",
      SCAM,
      "",
      "---------- Forwarded message ---------",
      "From: noreply@ato.gov.au",
      "",
      "Thanks for your payment.",
    ].join("\n");
    expect(unwrapForwarded(raw).raw).toContain("mygov-verify.tk");
  });

  it("still reports the source as inline", () => {
    const raw = `From: a@evil.tk\n\n${SCAM}\n\n---------- Forwarded message ---------\nFrom: b@ok.com\n\nHello.`;
    expect(unwrapForwarded(raw).source).toBe("inline");
  });

  it("leads with the quoted original, so header parsing sees it first", () => {
    // parseEmailHeaders reads the FIRST header block; the original's headers
    // must win over the forwarder's lead-in prose.
    const raw = [
      "From: me@gmail.com",
      "Subject: Fwd: check this",
      "",
      "Is this real?",
      "",
      "---------- Forwarded message ---------",
      "From: scammer@evil.tk",
      "Subject: Urgent",
      "",
      SCAM,
    ].join("\n");
    const { raw: unwrapped } = unwrapForwarded(raw);
    expect(unwrapped.indexOf("scammer@evil.tk")).toBeLessThan(unwrapped.indexOf("Is this real?"));
  });

  it("does not change an ordinary forward with nothing before the marker", () => {
    const raw = `From: me@gmail.com\n\n---------- Forwarded message ---------\nFrom: a@evil.tk\n\n${SCAM}`;
    const { raw: unwrapped } = unwrapForwarded(raw);
    expect(unwrapped).toContain("a@evil.tk");
    expect(unwrapped).toContain("mygov-verify.tk");
  });
});

// ── Encoded bodies ────────────────────────────────────────────────────────────
//
// Mail clients send the forward's text part base64 or quoted-printable as a
// matter of course (base64 is the usual choice for non-ASCII text). The marker
// search used to run on the encoded form, found nothing, and fell back to
// treating the forwarder's own message as the original — so the reply scored
// the person asking, "Sender victim@gmail.com — Looks OK", and never saw the
// scam.

const QUOTE = [
  "---------- Forwarded message ---------",
  "From: Australia Post <noreply@auspost-redelivery.top>",
  "Subject: Your parcel is on hold",
  `To: <${FORWARDER}>`,
  "",
  "Pay the $2.99 redelivery fee at https://auspost-redelivery.top/pay/" + "a".repeat(80),
].join("\r\n");

const WRAPPER = [
  `From: Victim Name <${FORWARDER}>`,
  "To: check@veriguard.app",
  "Subject: Fwd: Your parcel is on hold",
  "Authentication-Results: mx.example; dkim=pass header.d=gmail.com; dmarc=pass",
  "MIME-Version: 1.0",
];

const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/.{76}/g, "$&\r\n");
// Quoted-printable with a soft break every 75 chars, as clients emit it.
const qp = (s: string) =>
  s.split("\r\n").map((l) => l.replace(/=/g, "=3D").replace(/.{75}/g, "$&=\r\n")).join("\r\n");

function singlePart(encoding: string, body: string, type = "text/plain"): string {
  return [
    ...WRAPPER,
    `Content-Type: ${type}; charset="UTF-8"`,
    `Content-Transfer-Encoding: ${encoding}`,
    "",
    body,
  ].join("\r\n");
}

describe("unwrapForwarded — encoded forwards", () => {
  it("finds the original in a base64 text part", () => {
    const { raw, source } = unwrapForwarded(singlePart("base64", b64(`Is this real?\r\n\r\n${QUOTE}`)));
    expect(source).toBe("inline");
    expect(parseEmailHeaders(raw).fromAddress).toBe("noreply@auspost-redelivery.top");
  });

  it("finds the original in a quoted-printable part, with soft-wrapped links rejoined", () => {
    const { raw, source } = unwrapForwarded(singlePart("quoted-printable", qp(QUOTE)));
    expect(source).toBe("inline");
    expect(parseEmailHeaders(raw).fromAddress).toBe("noreply@auspost-redelivery.top");
    expect(raw).toContain("https://auspost-redelivery.top/pay/" + "a".repeat(80));
  });

  it("finds the original in an HTML-only forward and keeps its link targets", () => {
    const html =
      '<div>---------- Forwarded message ---------<br>From: Australia Post &lt;noreply@auspost-redelivery.top&gt;<br>' +
      'Subject: Parcel<br><br>Pay the fee <a href="https://auspost-redelivery.top/pay">here</a></div>';
    const { raw, source } = unwrapForwarded(singlePart("base64", b64(html), "text/html"));
    expect(source).toBe("inline");
    expect(parseEmailHeaders(raw).fromAddress).toBe("noreply@auspost-redelivery.top");
    expect(raw).toContain("https://auspost-redelivery.top/pay");
  });

  it("carries the quoted HTML for tracking, from the marker on", () => {
    const raw = [
      ...WRAPPER,
      'Content-Type: multipart/alternative; boundary="b1"',
      "",
      "--b1",
      "Content-Type: text/plain",
      "Content-Transfer-Encoding: base64",
      "",
      b64(QUOTE),
      "--b1",
      "Content-Type: text/html",
      "Content-Transfer-Encoding: base64",
      "",
      b64(
        '<img src="https://forwarder-signature.example/logo.png">' +
          "<div>---------- Forwarded message ---------<br>" +
          '<img src="https://trk.auspost-redelivery.top/o.gif" width="1" height="1"></div>',
      ),
      "--b1--",
    ].join("\r\n");
    const out = unwrapForwarded(raw, { forwarded: true });
    expect(out.markup).toContain("trk.auspost-redelivery.top/o.gif");
    expect(out.markup).not.toContain("forwarder-signature.example");
    // Markup is for tracking only: `raw` is also distilled into readable text.
    expect(out.raw).not.toContain("<img");
  });
});

// ── Known forwards: nothing about the forwarder is analysed ───────────────────
//
// On the forward-to-check inbox the outer message is always the person asking.
// Their headers, note and signature are outside the scam, and scoring them put
// the forwarder's own address and phone number into the verdict.

describe("unwrapForwarded — { forwarded: true }", () => {
  const SIGNED = [
    ...WRAPPER,
    "",
    "Is this real?",
    "",
    "Victim Name | 0412 345 678",
    "",
    QUOTE,
  ].join("\r\n");

  it("drops the forwarder's note and signature above the marker", () => {
    const { raw } = unwrapForwarded(SIGNED, { forwarded: true });
    expect(raw).toContain("auspost-redelivery.top");
    expect(raw).not.toContain("0412 345 678");
    expect(raw).not.toContain("Is this real?");
  });

  it("keeps them when the input is not a known forward (pasted-source evasion guard)", () => {
    expect(unwrapForwarded(SIGNED).raw).toContain("0412 345 678");
  });

  it("analyses the body alone, never the forwarder's headers, when there is no marker", () => {
    const raw = singlePart("base64", b64("Got this text today:\r\nPay now at https://auspost-redelivery.top/pay"));
    const out = unwrapForwarded(raw, { forwarded: true });
    expect(out.source).toBe("body");
    expect(out.raw).toContain("https://auspost-redelivery.top/pay");
    expect(out.raw).not.toContain(FORWARDER);
    expect(parseEmailHeaders(out.raw).fromAddress).toBe("");
  });

  it("treats a redirect (Resent-From) as the original, since its headers are the scam's", () => {
    const raw = [
      `Resent-From: ${FORWARDER}`,
      "From: Australia Post <noreply@auspost-redelivery.top>",
      "Subject: Parcel",
      "",
      "Pay now at https://auspost-redelivery.top/pay",
    ].join("\r\n");
    const out = unwrapForwarded(raw, { forwarded: true });
    expect(out.source).toBe("toplevel");
    expect(parseEmailHeaders(out.raw).fromAddress).toBe("noreply@auspost-redelivery.top");
  });
});

// ── Markup reaches tracking, and only tracking ────────────────────────────────

import { analyseEmailSource } from "@/lib/emailSource";
import { distillEmailContent } from "@/lib/emailDistiller";
import { htmlToText } from "@/lib/mime";

const PIXEL = '<img src="https://trk.auspost-redelivery.top/o.gif" width="1" height="1">';

function htmlOnly(html: string): string {
  return [...WRAPPER, 'Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: base64", "", b64(html)].join("\r\n");
}

function alternative(plain: string, html: string): string {
  return [
    ...WRAPPER,
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain",
    "Content-Transfer-Encoding: base64",
    "",
    b64(plain),
    "--b1",
    "Content-Type: text/html",
    "Content-Transfer-Encoding: base64",
    "",
    b64(html),
    "--b1--",
  ].join("\r\n");
}

const pixelFound = (raw: string) =>
  analyseEmailSource(raw, { forwarded: true }).tracking.findings.some((f) => f.kind === "pixel");

describe("tracking on forwards whose HTML carries no text marker", () => {
  it("finds the pixel in an HTML-only Gmail forward", () => {
    const html =
      '<div>Is this real?</div><div class="gmail_quote"><div>---------- Forwarded message ---------<br>' +
      "From: Australia Post &lt;noreply@auspost-redelivery.top&gt;<br><br>" +
      `Pay the fee.${PIXEL}</div></div>`;
    expect(pixelFound(htmlOnly(html))).toBe(true);
  });

  it("finds the pixel in an Outlook forward, whose From and Sent sit on separate lines", () => {
    const plain = [
      "Is this real?",
      "",
      "________________________________",
      "From: Australia Post <noreply@auspost-redelivery.top>",
      "Sent: Thursday, 24 September 2026 9:12 AM",
      `To: ${FORWARDER}`,
      "Subject: Your parcel is on hold",
      "",
      "Pay the fee at https://auspost-redelivery.top/pay",
    ].join("\r\n");
    const html =
      '<p>Is this real?<img src="https://forwarder-signature.example/logo.png"></p>' +
      '<div id="divRplyFwdMsg"><b>From:</b> Australia Post &lt;noreply@auspost-redelivery.top&gt;<br>' +
      `<b>Sent:</b> Thursday</div><div>Pay the fee.${PIXEL}</div>`;
    const out = unwrapForwarded(alternative(plain, html), { forwarded: true });
    expect(out.source).toBe("inline");
    expect(parseEmailHeaders(out.raw).fromAddress).toBe("noreply@auspost-redelivery.top");
    expect(out.markup).toContain("trk.auspost-redelivery.top");
    expect(out.markup).not.toContain("forwarder-signature.example");
    expect(pixelFound(alternative(plain, html))).toBe(true);
  });

  it("falls back to the quoted sender's address when the HTML has no known wrapper", () => {
    const plain = `---------- Forwarded message ---------\r\nFrom: noreply@auspost-redelivery.top\r\n\r\nPay the fee.`;
    const html =
      '<p><img src="https://forwarder-signature.example/logo.png"></p>' +
      `<p>From: noreply@auspost-redelivery.top</p><p>Pay the fee.${PIXEL}</p>`;
    const out = unwrapForwarded(alternative(plain, html), { forwarded: true });
    expect(out.markup).toContain("trk.auspost-redelivery.top");
    expect(out.markup).not.toContain("forwarder-signature.example");
  });
});

describe("distilled report content carries no markup", () => {
  it("shows the forward's text, not its HTML part", () => {
    const plain = `---------- Forwarded message ---------\r\nFrom: noreply@auspost-redelivery.top\r\n\r\nPay the fee.`;
    const html = `<div>---------- Forwarded message ---------<br>From: noreply@auspost-redelivery.top<br><p>Pay the fee.</p>${PIXEL}</div>`;
    const distilled = distillEmailContent(alternative(plain, html));
    expect(distilled).toContain("Pay the fee.");
    expect(distilled).not.toMatch(/<(img|p|div|br)\b/i);
  });
});

// ── Hostile markup stays linear ───────────────────────────────────────────────
//
// htmlToText and the marker search run on mail anyone can send, up to 1MB.
// Measured before the rewrite: 40KB of unclosed `<a href=` took 83s in the
// anchor regex. Each shape below restarted a full scan from every opening it
// failed to close.

describe("hostile input stays linear", () => {
  const shapes: Record<string, string> = {
    "unclosed anchors": "<a href=x ".repeat(50_000),
    "anchors with no </a>": "<a href=x>t ".repeat(50_000),
    "unclosed style blocks": "<style ".repeat(50_000),
    "unclosed comments": "<!-- ".repeat(50_000),
    "tags with no >": "<b ".repeat(100_000),
    "br with no >": "<br x ".repeat(50_000),
    "spaces with no newline": " ".repeat(300_000) + "x",
    "dash runs": "-".repeat(300_000),
  };
  for (const [name, input] of Object.entries(shapes)) {
    it(`${name}: htmlToText and unwrapForwarded`, () => {
      const start = performance.now();
      htmlToText(input, "keep");
      htmlToText(input, "redact");
      unwrapForwarded(htmlOnly(input), { forwarded: true });
      unwrapForwarded(`From: a@b.c\n\n${input}`);
      expect(performance.now() - start).toBeLessThan(1000);
    });
  }
});

describe("htmlToText entity decoding", () => {
  it("decodes each entity once, so an escaped entity stays escaped", () => {
    expect(htmlToText("&amp;lt;b&amp;gt; &lt;i&gt; &nbsp;&#39;&quot;", "keep")).toBe(`&lt;b&gt; <i>  '"`);
  });
});
