import { describe, it, expect } from "vitest";
import { inferTargetRegion } from "@/lib/targetRegion";

describe("inferTargetRegion — the ladder", () => {
  it("reads an international calling code as the strongest signal", () => {
    expect(inferTargetRegion("Call +44 20 7946 0000 about your refund")).toEqual({
      region: "GB",
      confidence: "phone",
    });
    expect(inferTargetRegion("Ring +61 412 345 678 about your ATO debt")).toEqual({
      region: "AU",
      confidence: "phone",
    });
  });

  it("reads a national TLD on a corroborated host", () => {
    // Three labels, so the host is not a sentence with a missing space.
    expect(inferTargetRegion("Claim at hmrc-refund.co.uk now")).toEqual({
      region: "GB",
      confidence: "tld",
    });
  });

  it("reads a national agency name", () => {
    const result = inferTargetRegion("Your HMRC refund is ready");
    expect(result.region).toBe("GB");
    expect(result.confidence).toBe("authority");
  });

  it("prefers the stronger rung when several fire", () => {
    // A GB phone number alongside an AU TLD. The calling code wins because it
    // is allocated rather than inferred.
    const result = inferTargetRegion("Call +44 20 7946 0000 or visit scam.com.au");
    expect(result).toEqual({ region: "GB", confidence: "phone" });
  });
});

describe("inferTargetRegion — hostnames, not prose", () => {
  // A missing space after a full stop produces something structurally
  // identical to a two-label domain. Shape alone cannot separate them, so a
  // bare two-label token needs corroboration that a host was meant.
  it("ignores a bare two-label token in running text", () => {
    expect(inferTargetRegion("Hi, please confirm your details.ca").region).toBe("");
    expect(inferTargetRegion("See attachment.ie file").region).toBe("");
    expect(inferTargetRegion("Package 3.us delivery").region).toBe("");
  });

  it("accepts a host corroborated by a scheme", () => {
    expect(inferTargetRegion("Visit https://my-gov.com.au")).toEqual({
      region: "AU",
      confidence: "tld",
    });
  });

  it("accepts a host corroborated by a path", () => {
    expect(inferTargetRegion("Go to details.ca/verify-now")).toEqual({
      region: "CA",
      confidence: "tld",
    });
  });

  it("accepts a host corroborated by a www. prefix", () => {
    expect(inferTargetRegion("Go to www.revenue.ie")).toEqual({
      region: "IE",
      confidence: "tld",
    });
  });

  it("accepts a host corroborated by a third label", () => {
    expect(inferTargetRegion("Verify at hmrc.gov.uk")).toEqual({
      region: "GB",
      confidence: "tld",
    });
  });
});

describe("inferTargetRegion — name matching semantics", () => {
  it("prefers the longest matching agency name across regions", () => {
    // NZ lists "inland revenue"; SG lists "inland revenue authority". With
    // insertion-order iteration and a bare substring test, NZ won and an IRAS
    // notice was attributed to New Zealand.
    expect(inferTargetRegion("IRAS: Inland Revenue Authority of Singapore tax notice").region)
      .toBe("SG");
  });

  it("attributes a compound agency name to the region that owns it", () => {
    // Asserts the OUTCOME, not the mechanism. Both of these are decided by word
    // boundaries and the uniqueness filter rather than by longest-first
    // ordering: removing the sort leaves them green.
    //
    // Said plainly because the alternative is worse — an earlier version of
    // this test claimed to exercise the sort and did not, which is precisely
    // the "green test that never reaches the code" failure this file has hit
    // before. See the note on reachability in compileNamePatterns.
    expect(inferTargetRegion("Verify your MyGovID account").region).toBe("IE");
    expect(inferTargetRegion("Centers for Medicare notice").region).toBe("US");
  });

  it("matches names on word boundaries, not as substrings", () => {
    // US brand "chase" inside "purchase"; GB brand "nationwide" inside prose.
    expect(inferTargetRegion("purchase confirmation for your order").region).toBe("");

    // IE's agency "INIS" sits inside the ordinary word "ministry", so an
    // unbounded match attributes any "Ministry of Health" notice to Ireland.
    expect(inferTargetRegion("Notice from the Ministry of Health").region).toBe("");
  });

  it("ignores brand names that are ordinary English words", () => {
    // Word boundaries cannot help when the brand IS a word someone might write.
    expect(inferTargetRegion("Your bank is nationwide, contact us").region).toBe("");
    expect(inferTargetRegion("chase the invoice please").region).toBe("");
    expect(inferTargetRegion("the countdown is on").region).toBe("");
  });

  it("keeps distinctive brand names that happen to be lowercase words", () => {
    // Excluding every alphabetic brand would cost real signal for nothing.
    expect(inferTargetRegion("Your tesco clubcard is expiring").region).toBe("GB");
    expect(inferTargetRegion("barclays login required").region).toBe("GB");
  });

  it("ignores agency names that describe a kind of institution", () => {
    // Every country has these. Uniqueness of claim is necessary, not sufficient.
    for (const text of [
      "the sheriff called",
      "your council tax is overdue",
      "revenue figures are up",
      "the reserve bank said",
      "postal service update",
    ]) {
      expect(inferTargetRegion(text).region, text).toBe("");
    }
  });

  it("keeps specifically-named agencies", () => {
    expect(inferTargetRegion("HMRC: your tax refund is pending").region).toBe("GB");
    expect(inferTargetRegion("Centrelink payment suspended").region).toBe("AU");
  });
});

describe("inferTargetRegion — abstaining", () => {
  it("returns none when no national signal is present", () => {
    expect(inferTargetRegion("Your parcel is held. Pay $2.99 at track-now.tk")).toEqual({
      region: "",
      confidence: "none",
    });
  });

  it("returns none for ordinary family text", () => {
    expect(inferTargetRegion("Hi mum, my phone broke, this is my new number")).toEqual({
      region: "",
      confidence: "none",
    });
  });

  it("ignores a national-format number with no country code", () => {
    // "0412 345 678" is only Australian if you already know where it was
    // written. Assuming the connection region would make the inference agree
    // with the reporter by construction, which destroys its only value.
    expect(inferTargetRegion("Call 0412 345 678").region).toBe("");
  });

  it("ignores an invalid international number", () => {
    // Ofcom's reserved drama range — correctly parsed as GB-shaped but invalid.
    expect(inferTargetRegion("Call +44 7700 900123").region).toBe("");
  });
});

describe("inferTargetRegion — cross-border, which is the point", () => {
  it("infers a target that differs from where it would be reported", () => {
    // An HMRC impersonation forwarded by someone in Sydney. The report would be
    // tagged AU; the campaign is GB. Nothing else in the system records this.
    const result = inferTargetRegion(
      "HMRC: your tax refund of £245 is pending. Confirm at hmrc-gov.co.uk",
    );
    expect(result.region).toBe("GB");
  });
});

describe("inferTargetRegion — shared signals must not be attributed", () => {
  it("does not attribute a generic TLD to any one region", () => {
    // Every pack lists .com among its brand suffixes, so a naive read would
    // attribute every .com to whichever pack happened to be enumerated first.
    expect(inferTargetRegion("Visit secure-login.com to verify").region).toBe("");
  });

  it("does not attribute a multinational brand to any one region", () => {
    // PayPal and Netflix are impersonated worldwide and are listed by several
    // packs, so neither carries national information.
    expect(inferTargetRegion("Your paypal account is locked").region).toBe("");
    expect(inferTargetRegion("Your netflix payment failed").region).toBe("");
  });

  it("does not match a national TLD inside a longer label", () => {
    expect(inferTargetRegion("Read more at news.co.ukraine-today.info").region).toBe("");
  });

  it("does not attribute generic gTLDs to the region that lists them", () => {
    // The US pack lists co, io and me because American brands register there.
    // They are sold worldwide and carry no national meaning, so a unique claim
    // is necessary but not sufficient. ".co" firing inside an unrelated
    // hostname is what surfaced this.
    expect(inferTargetRegion("Sign in at my-startup.io").region).toBe("");
    expect(inferTargetRegion("Read it at blog.me").region).toBe("");
    expect(inferTargetRegion("Visit shop.co today").region).toBe("");
  });

  it("still resolves the dotted national forms that contain them", () => {
    // Excluding bare "gov" must not cost us gov.uk / gov.au, which are the
    // strongest TLD markers there are.
    expect(inferTargetRegion("Verify at hmrc.gov.uk")).toEqual({
      region: "GB",
      confidence: "tld",
    });
    expect(inferTargetRegion("Verify at my.gov.au")).toEqual({
      region: "AU",
      confidence: "tld",
    });
  });
});

describe("inferTargetRegion — privacy properties", () => {
  it("returns a country code and a rung, and nothing else", () => {
    // The return shape is the privacy boundary: a caller cannot persist a
    // fragment of user content as "why we inferred this", because the function
    // never hands one back.
    const result = inferTargetRegion("HMRC refund at hmrc-refund.co.uk");
    expect(Object.keys(result).sort()).toEqual(["confidence", "region"]);
    expect(result.region).toMatch(/^[A-Z]{2}$/);
  });

  it("is pure — the same input always yields the same answer", () => {
    const text = "Call +44 20 7946 0000";
    expect(inferTargetRegion(text)).toEqual(inferTargetRegion(text));
  });

  it("never returns content from the input", () => {
    const secret = "my-very-private-account-12345";
    const result = inferTargetRegion(`HMRC refund for ${secret} at gov.uk`);
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});

describe("inferTargetRegion — cost on the response path", () => {
  it("stays fast on a large input", () => {
    // This runs synchronously on a public endpoint with no content-length cap,
    // so the matchers are compiled at module scope rather than per call. An
    // earlier version built a RegExp per suffix per check (~44 per request) and
    // took ~5.6ms on this input.
    const big = "Lorem ipsum dolor sit amet consectetur adipiscing elit. ".repeat(1000);
    expect(big.length).toBeGreaterThan(50_000);

    inferTargetRegion(big); // warm
    const start = performance.now();
    for (let i = 0; i < 10; i++) inferTargetRegion(big);
    const perCall = (performance.now() - start) / 10;

    // Generous relative to the ~0.9ms measured, so this catches a regression in
    // ORDER of magnitude — a per-call compile — without failing on a slow CI box.
    expect(perCall).toBeLessThan(15);
  });
});
