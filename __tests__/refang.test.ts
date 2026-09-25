import { describe, it, expect } from "vitest";
import { refang, isDefanged, defang } from "@veriguard/scam-detect/urlSanitizer";
import { analyzeContent } from "@veriguard/scam-detect/scamDetector";

// Defanging is how security-aware people share a suspicious link without making
// it clickable, so "hxxp://evil[.]tk" is ordinary input — not an edge case.
// Every extractor in the engine requires a literal http(s)://, so before this
// those submissions matched nothing, fell through to generic message analysis
// and scored 0. The users most careful with a scam link got the least
// protection, and the app's own defanged output could not be pasted back in.
//
// Refanging is a string transformation for analysis only. Nothing is fetched —
// the privacy invariant in privacyInvariant.test.ts covers that.

describe("refang — restoring defanged URLs for analysis", () => {
  it("restores the standard hxxp / hxxps schemes", () => {
    expect(refang("hxxp://evil[.]tk/a")).toBe("http://evil.tk/a");
    expect(refang("hxxps://evil[.]tk/a")).toBe("https://evil.tk/a");
  });

  it("restores scheme variants seen in the wild", () => {
    // hxtp is what this app itself used to emit; h**p appears in vendor advisories.
    expect(refang("hxtps://evil[.]tk/a")).toBe("https://evil.tk/a");
    expect(refang("h**p://evil[.]tk/a")).toBe("http://evil.tk/a");
    expect(refang("fxp://evil[.]tk/a")).toBe("ftp://evil.tk/a");
  });

  it("restores bracketed and spelled-out dot separators", () => {
    expect(refang("evil[.]tk/a")).toBe("evil.tk/a");
    expect(refang("evil(.)tk/a")).toBe("evil.tk/a");
    expect(refang("evil{.}tk/a")).toBe("evil.tk/a");
    expect(refang("evil[dot]tk/a")).toBe("evil.tk/a");
    expect(refang("evil (dot) tk/a")).toBe("evil.tk/a");
  });

  it("restores neutralised colons and at-signs", () => {
    expect(refang("hxxps://evil[.]tk[:]8080/a")).toBe("https://evil.tk:8080/a");
    expect(refang("user[@]evil[.]tk")).toBe("user@evil.tk");
  });

  it("is case-insensitive about the scheme", () => {
    expect(refang("HXXPS://EVIL[.]TK/a")).toBe("https://EVIL.TK/a");
  });

  it("leaves ordinary input untouched", () => {
    const plain = "Your parcel is ready. Track at https://auspost.com.au/track";
    expect(refang(plain)).toBe(plain);
    expect(refang("just some text with no url")).toBe("just some text with no url");
  });

  it("leaves the unbracketed word 'dot' alone", () => {
    // Handling a bare " dot " would rewrite ordinary English. Bracketed forms
    // are unambiguous; this one is usually just a word.
    expect(refang("I dot my i and cross my t")).toBe("I dot my i and cross my t");
    expect(refang("Score was 4 dot 5 out of 5")).toBe("Score was 4 dot 5 out of 5");
  });

  it("does not mangle ordinary bracketed prose", () => {
    // "[at]" and "[dot]" are the obfuscations; ordinary brackets must survive.
    expect(refang("Call me [urgently] about this")).toBe("Call me [urgently] about this");
    expect(refang("See section 4 (a) below")).toBe("See section 4 (a) below");
  });

  it("isDefanged reports whether refanging would change anything", () => {
    expect(isDefanged("hxxp://evil[.]tk")).toBe(true);
    expect(isDefanged("http://evil.tk")).toBe(false);
    expect(isDefanged("ordinary text")).toBe(false);
  });
});

describe("defang → refang round trip", () => {
  it("uses the standard hxxp convention, not the old hxtp typo", () => {
    expect(defang("https://evil.com/x")).toBe("hxxps://evil[.]com/x");
    expect(defang("http://evil.com/x")).toBe("hxxp://evil[.]com/x");
  });

  it("survives a round trip, so a verdict pasted back in still works", () => {
    // The app defangs URLs for display. Someone copying that verdict back into
    // the checker previously got nothing at all.
    for (const url of [
      "https://commbank-secure-login.tk/auth",
      "http://ato-refund-portal.xyz/claim?id=9",
      "https://sub.evil.co.uk/path",
    ]) {
      expect(refang(defang(url))).toBe(url);
    }
  });
});

describe("analyzeContent — defanged submissions get a real verdict", () => {
  it("scores a defanged scam URL as highly as the live form", async () => {
    const live = await analyzeContent("http://commbank-secure-login.tk/auth");
    const fanged = await analyzeContent("hxxp://commbank-secure-login[.]tk/auth");

    const liveUrl = live.find((c) => c.kind === "url");
    const fangedUrl = fanged.find((c) => c.kind === "url");

    expect(fangedUrl, "defanged input produced no URL card").toBeDefined();
    expect(fangedUrl!.result.score).toBe(liveUrl!.result.score);
  });

  it("gives a defanged URL the same verdict as its live form, not 0", async () => {
    // Parity with the live URL is the property that matters — asserting an
    // absolute score would just pin whatever the rules happen to produce today.
    const live = await analyzeContent("https://ato-refund-portal.xyz/claim");
    const fanged = await analyzeContent("hxxps://ato-refund-portal[.]xyz/claim");

    const liveUrl = live.find((c) => c.kind === "url")!;
    const fangedUrl = fanged.find((c) => c.kind === "url");

    expect(fangedUrl).toBeDefined();
    expect(fangedUrl!.result.score).toBe(liveUrl.result.score);
    expect(fangedUrl!.result.score).toBeGreaterThan(0);
    expect(fangedUrl!.result.verdict).toBe(liveUrl.result.verdict);
  });

  it("handles the app's own defanged output pasted back in", async () => {
    const live = await analyzeContent("https://commbank-secure-login.tk/auth");
    const cards = await analyzeContent(defang("https://commbank-secure-login.tk/auth"));

    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard, "round-tripped verdict produced no URL card").toBeDefined();
    expect(urlCard!.result.score).toBe(live.find((c) => c.kind === "url")!.result.score);
  });

  it("handles a defanged URL embedded in a sentence", async () => {
    // The common shape: someone pastes the message they received, with the link
    // neutralised, and asks whether it is real. An earlier version of refang()
    // anchored the scheme pattern to the start of the string, so this exact
    // case — the most likely one — was left unrefanged and scored 0.
    const cards = await analyzeContent(
      "Someone sent me hxxps://commbank-secure-login[.]tk/auth — is this real?",
    );
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard, "embedded defanged URL produced no url card").toBeDefined();
    expect(urlCard!.result.score).toBeGreaterThan(0);
  });

  it("refangs every defanged URL in a multi-link message", () => {
    expect(refang("first hxxp://a[.]tk/1 then hxxps://b[.]xyz/2 done")).toBe(
      "first http://a.tk/1 then https://b.xyz/2 done",
    );
  });

  it("still scores ordinary live URLs exactly as before", async () => {
    const cards = await analyzeContent("https://auspost.com.au/track");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard).toBeDefined();
    expect(urlCard!.result.verdict).toBe("safe");
  });
});
