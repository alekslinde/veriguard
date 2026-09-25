import { describe, it, expect, vi, beforeEach } from "vitest";

// A forward over the inbound size cap used to be dropped, and the forwarder
// heard nothing. It now arrives cut off, flagged `truncated`, and the reply
// gives a verdict on the part that arrived with a plain list of what was and
// was not checked. These cover each layer of that.

vi.mock("@/lib/urlhausBlocklist", () => ({ getUrlhausBlocklist: async () => new Set<string>() }));
vi.mock("@/lib/reportStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/reportStore")>()),
  incrementCheckCount: async () => {},
  recordCheckEvent: async () => {},
  recordTargetRegion: async () => {},
}));

import { mimeManifest, decodeBody } from "@/lib/mime";
import { describePartialCheck, trimToLastLine, formatBytes } from "@/lib/partialCheck";
import { formatVerdictEmail } from "@/lib/verdictSummary";
import { POST } from "@/app/api/inbound/route";
import { NextRequest } from "next/server";

const SECRET = "partial-secret";
beforeEach(() => {
  process.env.INBOUND_SECRET = SECRET;
});

const b64 = (s: string) => Buffer.from(s).toString("base64").replace(/.{76}/g, "$&\r\n");

// A Gmail-style inline forward of a scam, with a large PDF after the text.
function forwardWithPdf(pdfBytes: number, text = "Pay the fee at https://auspost-redelivery.top/pay"): string {
  return [
    "From: Victim <victim@gmail.com>",
    "Subject: Fwd: parcel",
    'Content-Type: multipart/mixed; boundary="outer"',
    "",
    "--outer",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "---------- Forwarded message ---------",
    "From: Australia Post <noreply@auspost-redelivery.top>",
    "Subject: Your parcel is on hold",
    "",
    text,
    "",
    "--outer",
    'Content-Type: application/pdf; name="invoice.pdf"',
    'Content-Disposition: attachment; filename="invoice.pdf"',
    "Content-Transfer-Encoding: base64",
    "",
    b64("%PDF".padEnd(pdfBytes, "x")),
    "--outer--",
    "",
  ].join("\r\n");
}

describe("mimeManifest", () => {
  it("marks every part whole when the closing delimiter arrived", () => {
    const parts = mimeManifest(forwardWithPdf(200), true);
    expect(parts.map((p) => [p.type, p.filename, p.complete])).toEqual([
      ["text/plain", "", true],
      ["application/pdf", "invoice.pdf", true],
    ]);
  });

  it("marks the part the cut went through as incomplete", () => {
    const full = forwardWithPdf(20_000);
    const parts = mimeManifest(full.slice(0, full.indexOf("%PDF") + 3000), true);
    expect(parts.find((p) => p.filename === "invoice.pdf")?.complete).toBe(false);
    expect(parts.find((p) => p.type === "text/plain")?.complete).toBe(true);
  });

  it("descends into an attached original", () => {
    const raw = [
      'Content-Type: multipart/mixed; boundary="o"',
      "",
      "--o",
      "Content-Type: message/rfc822",
      "",
      'Content-Type: multipart/mixed; boundary="i"',
      "",
      "--i",
      "Content-Type: text/plain",
      "",
      "hi",
      "--i",
      'Content-Type: image/png; name="qr.png"',
      "",
      "iVBORw0",
    ].join("\r\n");
    const parts = mimeManifest(raw, true);
    expect(parts.find((p) => p.filename === "qr.png")?.complete).toBe(false);
  });
});

describe("decodeBody on a cut-off base64 part", () => {
  it("decodes the whole groups that arrived instead of giving up", () => {
    const encoded = Buffer.from("Pay now at https://evil.test/pay and more text").toString("base64");
    expect(decodeBody(encoded.slice(0, 38), "base64")).toMatch(/^Pay now at https:\/\/evil/);
  });
});

describe("trimToLastLine / formatBytes", () => {
  it("drops the half line a cut leaves behind", () => {
    expect(trimToLastLine("a\r\nb\r\nhttps://evil.te")).toBe("a\r\nb\r\n");
  });
  it("formats sizes as mail clients show them", () => {
    expect(formatBytes(7_400_000)).toBe("7.4 MB");
    expect(formatBytes(820_000)).toBe("820 KB");
  });
});

describe("describePartialCheck", () => {
  it("lists what was checked and what was not", () => {
    const full = forwardWithPdf(20_000);
    const raw = full.slice(0, full.indexOf("%PDF") + 3000);
    const out = describePartialCheck({
      raw,
      receivedBytes: 1_000_000,
      totalBytes: 7_400_000,
      hasSender: true,
      results: [{ kind: "url", value: "https://x.test" } as never],
    });
    expect(out.checked).toEqual(["who it claims to be from", "the message text", "1 link"]);
    expect(out.notChecked).toEqual(["invoice.pdf (cut off)", "everything after the first 1.0 MB"]);
  });
});

describe("formatVerdictEmail with a partial check", () => {
  const partial = {
    receivedBytes: 1_000_000,
    totalBytes: 7_400_000,
    checked: ["the message text"],
    notChecked: ["invoice.pdf (cut off)"],
  };
  const clean = [
    { kind: "url", value: "https://example.com", result: { verdict: "safe", score: 0, flags: [], signals: [] } },
  ] as never;

  it("never reports a clean partial check as safe", () => {
    const reply = formatVerdictEmail({ results: clean, emailFlags: [], pixelReport: null, partial });
    expect(reply.text).toContain("We couldn't confirm this either way");
    expect(reply.text).not.toContain("We didn't find scam signals");
    expect(reply.text).toContain("Partial check: this email was 7.4 MB, and we checked the first 1.0 MB.");
    expect(reply.text).toContain("Not checked: invoice.pdf (cut off)");
    expect(reply.text).toContain("'not fully checked', not 'safe'");
    expect(reply.html).toContain("Partial check");
  });

  it("keeps a scam verdict found in the part that arrived", () => {
    const scam = [
      { kind: "url", value: "https://evil.top", result: { verdict: "likely_scam", score: 90, flags: ["x"], signals: [] } },
    ] as never;
    const reply = formatVerdictEmail({ results: scam, emailFlags: [], pixelReport: null, partial });
    expect(reply.text).toContain("This looks like a scam.");
    expect(reply.text).not.toContain("'not fully checked'");
  });

  it("is unchanged without a partial check", () => {
    const reply = formatVerdictEmail({ results: clean, emailFlags: [], pixelReport: null });
    expect(reply.text).not.toContain("Partial check");
  });
});

describe("POST /api/inbound with a truncated forward", () => {
  function inbound(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/inbound", {
      method: "POST",
      headers: { "content-type": "application/json", "x-inbound-secret": SECRET },
      body: JSON.stringify(body),
    });
  }

  it("answers with a partial verdict instead of dropping it", async () => {
    const full = forwardWithPdf(20_000);
    const raw = full.slice(0, full.indexOf("%PDF") + 3001);
    const data = await (
      await POST(inbound({ raw, from: "partial-1@x.test", truncated: true, receivedBytes: 1_000_000, totalBytes: 7_400_000 }))
    ).json();
    expect(data.partial).toBe(true);
    expect(data.reply.text).toContain("Partial check: this email was 7.4 MB");
    expect(data.reply.text).toContain("invoice.pdf (cut off)");
    // The scam in the part that arrived is still judged.
    expect(data.reply.text).toContain("auspost-redelivery[.]top");
    expect(data.reply.text).not.toMatch(/victim@gmail/);
  });

  it("never claims a smaller total than what arrived", async () => {
    const raw = forwardWithPdf(200);
    const data = await (await POST(inbound({ raw, from: "partial-2@x.test", truncated: true }))).json();
    expect(data.reply.text).toMatch(/Partial check: this email was (\d+ KB), and we checked the first \1\./);
  });
});
