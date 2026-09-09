import { describe, it, expect } from "vitest";
import { publicSuffix, registrableDomain, registrableLabel, isNationalCommercialSuffix } from "@veriguard/engine/publicSuffix";
import { checkUrl } from "@veriguard/engine/scamDetector";
import { resolveRegionPack, supportedRegions } from "@veriguard/engine/regions";

// The PSL replaced a hand-kept set of two-part suffixes that was explicitly
// "scoped to the ccTLDs the packs actually cover" — a rule with an expiry date.
// SG shipped at `minimal` and was immediately outside it: "barclays.com.sg"
// resolved its registrable label to "com", missed the brand-owns-the-label
// exemption, and scored 55/likely_scam on a real bank's own site.

describe("public suffix lookup", () => {
  it.each([
    ["www.barclays.co.uk", "co.uk", "barclays.co.uk", "barclays"],
    ["barclays-secure.co.uk", "co.uk", "barclays-secure.co.uk", "barclays-secure"],
    ["barclays.com.sg", "com.sg", "barclays.com.sg", "barclays"],
    ["example.com", "com", "example.com", "example"],
    ["login.barclays.com.evil.top", "top", "evil.top", "evil"],
  ])("%s", (host, suffix, domain, label) => {
    expect(publicSuffix(host)).toBe(suffix);
    expect(registrableDomain(host)).toBe(domain);
    expect(registrableLabel(host)).toBe(label);
  });

  it("takes the longest matching rule", () => {
    // qld.gov.au is its own rule; nsw.gov.au is not, so it falls back to gov.au.
    expect(publicSuffix("health.qld.gov.au")).toBe("qld.gov.au");
    expect(publicSuffix("education.nsw.gov.au")).toBe("gov.au");
  });

  it("applies wildcard rules", () => {
    // "*.kawasaki.jp" makes any single label under it a suffix.
    expect(publicSuffix("foo.bar.kawasaki.jp")).toBe("bar.kawasaki.jp");
  });

  it("keeps single-label wildcard rules", () => {
    // The generator's multi-label filter originally ran AFTER stripping "*.",
    // which silently dropped 7 ccTLD wildcards (ck er fk jm mm np pg). "*.np"
    // is single-label in form but multi-label in effect — it makes "com.np" a
    // suffix — so dropping it reintroduced the exact defect the PSL was adopted
    // to fix: "paypal.com.np" resolved its registrable label to "com".
    //
    // The kawasaki case above cannot catch this, because that rule survives the
    // filter. These are the ones that did not.
    expect(publicSuffix("paypal.com.np")).toBe("com.np");
    expect(registrableLabel("paypal.com.np")).toBe("paypal");
    expect(publicSuffix("a.b.jm")).toBe("b.jm");
  });

  it("keeps an exception's wildcard parent", () => {
    // "!www.ck" is meaningless without "*.ck": dropping the parent left the
    // exception orphaned, and "foo.ck" became a registrable domain owned by
    // "foo" — handing any <brand>.ck the ownership exemption.
    expect(publicSuffix("foo.ck")).toBe("foo.ck");
    expect(publicSuffix("www.ck")).toBe("ck");
    expect(registrableDomain("www.ck")).toBe("www.ck");
  });

  it("lets an exception rule override a wildcard", () => {
    // "!city.kawasaki.jp" — city.kawasaki.jp is registrable despite the wildcard.
    expect(publicSuffix("city.kawasaki.jp")).toBe("kawasaki.jp");
    expect(registrableDomain("city.kawasaki.jp")).toBe("city.kawasaki.jp");
  });

  it("falls back to the final label for an unknown TLD", () => {
    expect(publicSuffix("evil.zzzznotarealtld")).toBe("zzzznotarealtld");
  });

  it("has no registrable domain for a bare suffix", () => {
    expect(registrableDomain("co.uk")).toBe("");
    expect(registrableLabel("co.uk")).toBe("");
  });

  it("ignores a trailing dot and case", () => {
    expect(registrableDomain("WWW.Barclays.CO.UK.")).toBe("barclays.co.uk");
  });

  it("excludes the PRIVATE section", () => {
    // github.io is a PSL private-section rule. Treating it as a suffix would
    // make "evil.github.io" its own registrable domain and hand it the
    // brand-owns-the-label exemption — on exactly the free hosting scammers use.
    expect(publicSuffix("evil.github.io")).toBe("io");
    expect(registrableDomain("evil.github.io")).toBe("github.io");
  });
});

describe("brand-owns-the-label exemption", () => {
  // Two questions the old single list conflated: the PSL says where the
  // registration boundary is; brandSuffixes says whether a covered brand would
  // be registering there at all.

  it("does not flag a brand on its own real site", () => {
    expect(checkUrl("https://barclays.co.uk/login", undefined, "GB").flags.join(" "))
      .not.toContain("Impersonates");
  });

  it("does not flag a real site on a suffix outside the checking region", () => {
    // The regression the union guards: brands are not confined to one country.
    // bankofireland.co.uk is genuine, and westpac trades in AU and NZ.
    expect(checkUrl("https://bankofireland.co.uk/", undefined, "GB").flags.join(" "))
      .not.toContain("Impersonates");
    expect(checkUrl("https://westpac.co.nz/", undefined, "AU").flags.join(" "))
      .not.toContain("Impersonates");
  });

  it("does not exempt a brand on a foreign open-registration suffix", () => {
    // gov.co, com.co and co.io are genuine public suffixes, so the PSL makes the
    // brand the registrable label — which would exempt the squat. No covered
    // brand registers there, so the exemption must not apply.
    // Each brand checked under its OWN region — the brand lists are regional,
    // so commbank means nothing to the GB pack.
    for (const [host, region] of [
      ["barclays.gov.co", "GB"],
      ["commbank.com.co", "AU"],
      ["kiwibank.co.io", "NZ"],
    ] as const) {
      expect(
        checkUrl(`http://${host}/login`, undefined, region).flags.join(" "),
        host,
      ).toContain("Impersonates");
    }
  });

  it("does not flag a brand on an ordinary single-label TLD", () => {
    // The regression an allowlist-shaped gate introduced: every TLD outside a
    // 45-entry union lost the exemption, so amazon.de — Amazon's real German
    // site — scored 45 as impersonation. A sweep of US-pack brands across
    // ordinary TLDs flagged 216 of 216. Single-label suffixes are where brands
    // register worldwide, so they are exempt by default.
    for (const host of ["amazon.de", "amazon.fr", "paypal.info", "netflix.tv"]) {
      expect(
        checkUrl(`https://${host}/`, undefined, "GB").flags.join(" "),
        host,
      ).not.toContain("Impersonates");
    }
  });

  it("still flags a squat under a foreign wildcard namespace", () => {
    // com.np exists only via the "*.np" wildcard — the rule class that was
    // being dropped.
    expect(checkUrl("http://paypal.com.np/login", undefined, "US").flags.join(" "))
      .toContain("Impersonates");
  });

  it("still flags a squat on the region's own suffix", () => {
    expect(checkUrl("https://barclays-secure.co.uk/login", undefined, "GB").flags.join(" "))
      .toContain("Impersonates");
  });
});

describe("the generated list is complete", () => {
  it("carries the ccTLD wildcards, not just the deep ones", () => {
    // A count check would be brittle against upstream edits; these specific
    // rules are the ones a stripping-then-filtering generator drops, and each
    // makes a whole ccTLD's second level a suffix.
    for (const tld of ["ck", "er", "fk", "jm", "mm", "np", "pg"]) {
      expect(publicSuffix(`example.anything.${tld}`), tld).toBe(`anything.${tld}`);
    }
  });
});

describe("brandSuffixes as pack data", () => {
  it("every pack declares the field", () => {
    for (const code of supportedRegions()) {
      expect(Array.isArray(resolveRegionPack(code).brandSuffixes), code).toBe(true);
    }
  });

  it("lists real public suffixes, not made-up ones", () => {
    // An entry that is not a public suffix can never match publicSuffix()'s
    // output, so it would silently do nothing.
    for (const code of supportedRegions()) {
      for (const suffix of resolveRegionPack(code).brandSuffixes) {
        expect(publicSuffix(`example.${suffix}`), `${code}: ${suffix}`).toBe(suffix);
      }
    }
  });

  it("never lists the open-registration suffixes the exemption must exclude", () => {
    // Adding one of these to any pack would reopen the squat gap in every pack,
    // since the exemption reads the union.
    for (const code of supportedRegions()) {
      const suffixes = resolveRegionPack(code).brandSuffixes;
      for (const bad of ["gov.co", "com.co", "co.io"]) {
        expect(suffixes, `${code} must not list ${bad}`).not.toContain(bad);
      }
    }
  });
});

describe("isNationalCommercialSuffix", () => {
  // Gates the brand-owns-the-label exemption for the GLOBAL brand floor, where
  // an allowlist of suffixes cannot work: those brands register in every
  // country, and no region pack lists `.com.br` or `.co.jp`. Asserted at the
  // unit level as well as through checkUrl because the rule is three separate
  // disqualifications, and a behavioural test only ever exercises whichever one
  // the chosen hostname happens to hit.

  it.each([
    // The suffixes packs already author — these must not regress.
    "co.uk", "com.au", "co.nz", "com.sg",
    // The ones no pack authors, which is the case the function exists for.
    "com.br", "co.jp", "co.za", "com.tr", "com.mx", "co.kr",
    "com.ar", "co.il", "com.my", "com.ph", "com.hk", "com.tw",
    "gr.jp", "com.pl", "co.id", "co.th", "com.vn",
  ])("treats %s as a national commercial namespace", (suffix) => {
    expect(isNationalCommercialSuffix(suffix)).toBe(true);
  });

  it.each([
    // (1) Non-commercial second level — settled by shape, no country knowledge.
    "gov.co", "gov.io", "gov.uk", "ac.uk", "nhs.uk", "edu.au", "police.uk",
    // (2) Wildcard registry — no enumerated second level to be the real site of.
    "com.np",
    // (3) TLD sold as a generic — the judgement case.
    "com.co", "net.co", "co.io", "com.io",
  ])("refuses %s", (suffix) => {
    expect(isNationalCommercialSuffix(suffix)).toBe(false);
  });

  it("answers only the multi-label question", () => {
    // Single-label suffixes are exempt by DEFAULT at the call site — `.com` and
    // `.de` are where brands register worldwide. This returning false for them
    // is correct and load-bearing: an earlier cut used it as the whole test and
    // flagged paypal.com in every region.
    for (const tld of ["com", "de", "fr", "io", "co"]) {
      expect(isNationalCommercialSuffix(tld)).toBe(false);
    }
  });

  it("fails closed on an unrecognised second level", () => {
    // The commercial second levels are listed positively, so a namespace nobody
    // anticipated withholds the exemption rather than granting it. That is the
    // safe direction: the cost is a missed exemption on an unusual real site,
    // not a global brand squat waved through.
    expect(isNationalCommercialSuffix("weird.br")).toBe(false);
  });
});
