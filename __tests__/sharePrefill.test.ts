// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { buildShareContent, parseSharePayload } from "@/lib/sharePrefill";

describe("buildShareContent", () => {
  it("uses the shared text as-is", () => {
    expect(buildShareContent({ text: "Your parcel is held: evil.tk/pay" }).content).toBe(
      "Your parcel is held: evil.tk/pay",
    );
  });

  it("appends a url that the text does not already contain", () => {
    // Chrome shares a page as {title, url}; some apps add a note in `text`.
    expect(buildShareContent({ text: "is this real?", url: "https://evil.tk" }).content).toBe(
      "is this real?\n\nhttps://evil.tk",
    );
  });

  it("does not repeat a url already present in the text", () => {
    // Messaging apps commonly share the selection with the link inside it.
    // Duplicating it would hand the detector the same identifier twice.
    const text = "Your parcel is held: https://evil.tk/pay";
    expect(buildShareContent({ text, url: "https://evil.tk/pay" }).content).toBe(text);
  });

  it("uses the url alone when there is no text", () => {
    expect(buildShareContent({ url: "https://evil.tk", title: "Track parcel" }).content).toBe(
      "https://evil.tk",
    );
  });

  it("drops the title when real content is present", () => {
    // The title is the page/conversation name, not the suspicious content —
    // mixing it in adds words the scoring would weigh as the sender's.
    const out = buildShareContent({ title: "AusPost Tracking", text: "click here" }).content;
    expect(out).toBe("click here");
    expect(out).not.toContain("AusPost");
  });

  it("falls back to the title when it is the only thing shared", () => {
    expect(buildShareContent({ title: "AusPost Tracking" }).content).toBe("AusPost Tracking");
  });

  it("returns an empty string when nothing usable was shared", () => {
    expect(buildShareContent({}).content).toBe("");
    expect(buildShareContent({ text: "   ", url: "" }).content).toBe("");
  });

  it("trims surrounding whitespace from each field", () => {
    expect(buildShareContent({ text: "  scam text  " }).content).toBe("scam text");
  });

  it("bounds the length of a hostile payload", () => {
    const huge = "a".repeat(20_000);
    expect(buildShareContent({ text: huge }).content).toHaveLength(5000);
  });

  it("reports truncation rather than silently half-checking", () => {
    // A silently trimmed message reads to the user as "we checked all of this".
    expect(buildShareContent({ text: "a".repeat(20_000) }).truncated).toBe(true);
    expect(buildShareContent({ text: "short" }).truncated).toBe(false);
  });

  it("keeps a url that only prefix-matches a longer link in the text", () => {
    // includes() would treat the shorter url as already present and drop it,
    // so the link the user actually shared would never be analysed.
    const out = buildShareContent({
      text: "see https://evil.tk/pay-now",
      url: "https://evil.tk/pay",
    }).content;
    expect(out).toBe("see https://evil.tk/pay-now\n\nhttps://evil.tk/pay");
  });

  it("still de-duplicates a url that appears as a complete link", () => {
    const text = "Your parcel: https://evil.tk/pay and then pay";
    expect(buildShareContent({ text, url: "https://evil.tk/pay" }).content).toBe(text);
  });

  it("de-duplicates a url followed by punctuation", () => {
    const text = "Pay at https://evil.tk/pay.";
    expect(buildShareContent({ text, url: "https://evil.tk/pay" }).content).toBe(text);
  });

  it("never clips the appended url, even under a maximal body", () => {
    // The url is the highest-signal field; a half-clipped one is worse than
    // absent because it can parse as a different host.
    const out = buildShareContent({
      text: "a".repeat(20_000),
      url: "https://evil.tk/pay",
    });
    expect(out.content.endsWith("\n\nhttps://evil.tk/pay")).toBe(true);
    expect(out.content.length).toBeLessThanOrEqual(5000);
    expect(out.truncated).toBe(true);
  });

  it("treats a continuing path segment as a different link, not a match", () => {
    const out = buildShareContent({
      text: "go https://evil.tk/a/b",
      url: "https://evil.tk/a",
    }).content;
    expect(out).toContain("\n\nhttps://evil.tk/a");
  });

  it("de-duplicates a url containing a query string or a dotted path", () => {
    const qs = "Pay at https://evil.tk/p?a=1&b=2 now";
    expect(buildShareContent({ text: qs, url: "https://evil.tk/p?a=1&b=2" }).content).toBe(qs);
    const dotted = "see https://evil.tk/file.php here";
    expect(buildShareContent({ text: dotted, url: "https://evil.tk/file.php" }).content).toBe(dotted);
  });

  it("drops an absurdly long url rather than letting it eat the body", () => {
    const out = buildShareContent({
      text: "check this",
      url: "https://evil.tk/" + "a".repeat(5000),
    });
    expect(out.content).toBe("check this");
  });

  it("preserves newlines inside a shared message body", () => {
    const sms = "AusPost: parcel held.\nPay $2.99: evil.tk";
    expect(buildShareContent({ text: sms }).content).toBe(sms);
  });
});

describe("parseSharePayload", () => {
  it("reads the three spec params from a query string", () => {
    const params = new URLSearchParams("title=T&text=Body&url=https://evil.tk");
    expect(parseSharePayload(params)).toEqual({
      title: "T",
      text: "Body",
      url: "https://evil.tk",
    });
  });

  it("maps absent params to undefined rather than null", () => {
    expect(parseSharePayload(new URLSearchParams(""))).toEqual({
      title: undefined,
      text: undefined,
      url: undefined,
    });
  });

  it("round-trips an encoded share payload into check content", () => {
    const shared = "AusPost: parcel held. Pay at https://evil.tk/p?a=1&b=2";
    const qs = new URLSearchParams({ text: shared }).toString();
    expect(buildShareContent(parseSharePayload(new URLSearchParams(qs))).content).toBe(shared);
  });
});
