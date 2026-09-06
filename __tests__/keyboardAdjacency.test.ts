import { describe, it, expect } from "vitest";
import { isKeyboardTypo, findKeyboardTypo } from "@veriguard/engine/keyboardAdjacency";
import { checkUrl } from "@veriguard/engine/scamDetector";
import { resolveRegionPack, supportedRegions } from "@veriguard/engine/regions";

describe("isKeyboardTypo — the three squat shapes", () => {
  it("catches an adjacent-key substitution", () => {
    expect(isKeyboardTypo("oaypal", "paypal")).toBe(true); // p → o
    expect(isKeyboardTypo("netflox", "netflix")).toBe(true); // i → o
    expect(isKeyboardTypo("wsstpac", "westpac")).toBe(true); // e → s
  });

  it("catches a doubled key", () => {
    expect(isKeyboardTypo("payppal", "paypal")).toBe(true);
    expect(isKeyboardTypo("netfllix", "netflix")).toBe(true);
  });

  it("catches a transposition", () => {
    expect(isKeyboardTypo("paypla", "paypal")).toBe(true);
    expect(isKeyboardTypo("amaozn", "amazon")).toBe(true);
  });

  it("does not fire on the brand itself", () => {
    expect(isKeyboardTypo("paypal", "paypal")).toBe(false);
  });
});

describe("isKeyboardTypo — what it deliberately refuses", () => {
  it("refuses a substitution that is not an adjacent key", () => {
    // z is nowhere near p. A squatter typing this is not simulating a slip,
    // and treating every single-character difference as a typo is what turns
    // this rule into a false-positive engine.
    expect(isKeyboardTypo("zaypal", "paypal")).toBe(false);
  });

  it("refuses brands shorter than the length floor", () => {
    // "anz" is one adjacent substitution from a great many real labels.
    expect(isKeyboardTypo("abz", "anz")).toBe(false);
    expect(isKeyboardTypo("snz", "anz")).toBe(false);
  });

  it("refuses omission and insertion", () => {
    // Both collide far too readily with ordinary words; only doubling of an
    // existing character counts as an insertion.
    expect(isKeyboardTypo("paypl", "paypal")).toBe(false);
    expect(isKeyboardTypo("paypalx", "paypal")).toBe(false);
  });

  it("refuses two separate differences", () => {
    expect(isKeyboardTypo("oatpal", "paypal")).toBe(false);
  });

  it("does not treat a doubled identical pair as a transposition", () => {
    // Swapping the two l's in "netfllix" yields the same string; that is not a
    // typo, and counting it would double-score the doubling case.
    expect(isKeyboardTypo("netflix", "netflix")).toBe(false);
  });
});

describe("findKeyboardTypo", () => {
  it("names the brand that was mistyped", () => {
    expect(findKeyboardTypo("payppal", ["netflix", "paypal"])).toBe("paypal");
  });

  it("returns null for an unrelated label", () => {
    expect(findKeyboardTypo("bakery", ["paypal", "netflix"])).toBe(null);
  });

  it("ignores a label carrying hyphens or digits", () => {
    // Deliberate constructions, owned by the substring and homoglyph rules. A
    // finger slip does not insert a hyphen.
    expect(findKeyboardTypo("payppal-secure", ["paypal"])).toBe(null);
    expect(findKeyboardTypo("payppa1", ["paypal"])).toBe(null);

    // The two above are rejected on LENGTH before the character check is
    // reached, so on their own they do not exercise this guard at all — an
    // injection run removing the regex left them both green.
    //
    // Substitution is self-guarding (a non-letter is in no key's neighbour
    // list), but doubling and transposition never consult the keyboard, so a
    // non-alphabetic character reaches them intact. This is the shape that
    // actually depends on the regex: a brand carrying a hyphen, doubled.
    expect(isKeyboardTypo("pay--pal", "pay-pal")).toBe(true);
    expect(findKeyboardTypo("pay--pal", ["pay-pal"])).toBe(null);
  });

  it("is case-insensitive on the label", () => {
    expect(findKeyboardTypo("PAYPPAL", ["paypal"])).toBe("paypal");
  });
});

describe("checkUrl — the signal in place", () => {
  it("flags a mistyped brand domain that contains no brand string", () => {
    const result = checkUrl("https://payppal.com/login", undefined, "AU");
    expect(result.flags.some((f) => f.includes("one mistyped letter away"))).toBe(true);
    expect(result.flags.some((f) => f.includes('"paypal"'))).toBe(true);
  });

  it("reaches suspicious on its own but not likely_scam", () => {
    // The right failure direction for a rule that is inference rather than an
    // observed brand string: enough to warn, not enough to convict alone.
    const result = checkUrl("https://payppal.com", undefined, "AU");
    expect(result.verdict).toBe("suspicious");
  });

  it("does not fire on the real brand's own site", () => {
    const result = checkUrl("https://paypal.com/signin", undefined, "AU");
    expect(result.flags.some((f) => f.includes("one mistyped letter away"))).toBe(false);
  });

  it("does not double-score a domain that contains the brand verbatim", () => {
    // The substring rule owns this shape. Both firing would score one tell
    // twice and print two flags describing the same thing.
    const result = checkUrl("https://paypal-secure-verify.tk", undefined, "AU");
    const typoFlags = result.flags.filter((f) => f.includes("one mistyped letter away"));
    expect(typoFlags).toHaveLength(0);
  });

  it("covers a brand listed only in the word list", () => {
    // "startrack" appears only in TYPOSQUAT_WORD_BRANDS. An earlier cut passed
    // just the substring list, so every word-only brand had no typo coverage
    // at all and this scored nothing.
    const result = checkUrl("https://startrackk.com/track", undefined, "AU");
    expect(result.flags.some((f) => f.includes('"startrack"'))).toBe(true);
  });

  it("still does not fire on the real word-list brand's site", () => {
    const result = checkUrl("https://startrack.com", undefined, "AU");
    expect(result.flags.some((f) => f.includes("one mistyped letter away"))).toBe(false);
  });

  it("suppresses the typo flag only when a brand rule actually scored", () => {
    // A trailing doubling leaves the brand intact as a substring, so
    // "netflixx.com" contains "netflix". The substring rule scores it 45 and
    // the typo flag correctly stays silent — one tell, one flag.
    const substringCase = checkUrl("https://netflixx.com", undefined, "AU");
    expect(substringCase.flags.some((f) => f.includes("Impersonates"))).toBe(true);
    expect(substringCase.flags.some((f) => f.includes("one mistyped letter away"))).toBe(false);

    // The same shape on a WORD brand is the case that was silently lost: the
    // substring rule never considers "startrack", so nothing scored it, and a
    // raw containment test suppressed a flag with nothing to defer to.
    const wordCase = checkUrl("https://startrackk.com", undefined, "AU");
    expect(wordCase.flags.some((f) => f.includes("Impersonates"))).toBe(false);
    expect(wordCase.flags.some((f) => f.includes("one mistyped letter away"))).toBe(true);
  });

  it("works under ZZ with no brands authored, without erroring", () => {
    // The structural half is region-independent; the brand list is not. A pack
    // with no brands must yield no hits rather than a wrong one.
    const result = checkUrl("https://payppal.com", undefined, "ZZ");
    expect(result.flags.some((f) => f.includes("one mistyped letter away"))).toBe(false);
  });
});

describe("false-positive sweep across every pack's own brands", () => {
  // The lesson from the brand-owns-the-label defect: a rule that fires on real
  // brand sites is worse than one that misses squats. Every brand each pack
  // authors, on its own .com, must stay clean — including against the OTHER
  // brands in the same list, which is where a near-collision would show up.
  it("flags none of the packs' real brand domains", () => {
    // Both lists, because both now feed the rule. This is the assertion that
    // gates admitting the word list: the split guards against SUBSTRING
    // collision, which a within-one-character rule cannot have, but that
    // argument is only sound while no brand is a keyboard-typo of another.
    const offenders: string[] = [];
    for (const code of supportedRegions()) {
      const pack = resolveRegionPack(code);
      const all = [
        ...pack.typosquatBrands.substring,
        ...pack.typosquatBrands.word,
      ];
      for (const brand of all) {
        if (!/^[a-z]+$/.test(brand)) continue;
        const hit = findKeyboardTypo(brand, all);
        if (hit) offenders.push(`${code}: ${brand} matched ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not flag the real businesses that got \"velocity\" demoted", () => {
    // velocityglobal.com, velocitypartners.com and velocitybank.com are
    // unrelated real businesses that a bare substring match on "velocity"
    // called likely_scam. They are the reason the word list exists, so they
    // are the regression to hold when the word list feeds a fuzzy rule.
    // All are rejected on length long before adjacency is consulted.
    const brands = ["velocity", "startrack", "aupost", "nsandi"];
    for (const label of ["velocityglobal", "velocitypartners", "velocitybank"]) {
      expect(findKeyboardTypo(label, brands), `${label} was flagged`).toBe(null);
    }
  });

  it("flags none of a sweep of ordinary non-brand labels", () => {
    const ordinary = [
      "bakery", "council", "hospital", "plumbing", "school", "library",
      "gardens", "cricket", "weather", "recipes", "furniture", "insurance",
      "removals", "veterinary", "brewery", "cleaning", "roofing", "catering",
    ];
    const brands = supportedRegions().flatMap(
      (c) => resolveRegionPack(c).typosquatBrands.substring,
    );
    for (const label of ordinary) {
      expect(findKeyboardTypo(label, brands), `${label} was flagged`).toBe(null);
    }
  });
});
