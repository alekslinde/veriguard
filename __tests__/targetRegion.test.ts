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

  it("reads a national TLD", () => {
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
