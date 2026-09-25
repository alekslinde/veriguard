import { describe, it, expect } from "vitest";
import { buildReportQuery, parseReportPrefill } from "@/lib/reportPrefill";

// The prefill link is emailed to someone who forwarded a scam, so it crosses a
// trust boundary in both directions: we must not leak the forwarded email into
// the URL, and we must not trust what comes back out of it.

describe("buildReportQuery", () => {
  it("carries the identifiers and type", () => {
    const q = new URLSearchParams(
      buildReportQuery({
        type: "email",
        scamEmail: "scammer@evil.tk",
        scamReplyTo: "reply@other.tk",
        scamUrl: "https://evil.tk/login",
        scamPhone: "+61412345678",
      }),
    );
    expect(q.get("type")).toBe("email");
    expect(q.get("scamEmail")).toBe("scammer@evil.tk");
    expect(q.get("scamReplyTo")).toBe("reply@other.tk");
    expect(q.get("scamUrl")).toBe("https://evil.tk/login");
    expect(q.get("scamPhone")).toBe("+61412345678");
  });

  it("returns an empty string when there is nothing to carry", () => {
    expect(buildReportQuery({})).toBe("");
  });

  it("drops blank and over-long values rather than emitting them", () => {
    const q = new URLSearchParams(
      buildReportQuery({ scamEmail: "   ", scamUrl: `https://evil.tk/${"a".repeat(400)}` }),
    );
    expect(q.get("scamEmail")).toBeNull();
    expect(q.get("scamUrl")).toBeNull();
  });

  it("has no field for the message body — the email is never carried in the link", () => {
    // Guards the privacy promise the same reply email makes: we analysed the
    // forward and kept no copy, so no part of it may travel in the CTA URL.
    const q = buildReportQuery({
      type: "email",
      scamEmail: "scammer@evil.tk",
    } as never);
    expect(q).not.toMatch(/content|body|message|raw/i);
  });
});

describe("parseReportPrefill", () => {
  it("round-trips what buildReportQuery produced", () => {
    const prefill = { type: "url" as const, scamUrl: "https://evil.tk/login" };
    expect(parseReportPrefill(new URLSearchParams(buildReportQuery(prefill)))).toEqual(prefill);
  });

  it("drops an unknown type instead of trusting it", () => {
    const parsed = parseReportPrefill(new URLSearchParams("type=<script>&scamUrl=https://evil.tk"));
    expect(parsed.type).toBeUndefined();
    expect(parsed.scamUrl).toBe("https://evil.tk");
  });

  it("ignores an over-long value from a crafted link", () => {
    const parsed = parseReportPrefill(new URLSearchParams(`scamEmail=${"a".repeat(400)}@evil.tk`));
    expect(parsed.scamEmail).toBeUndefined();
  });

  it("accepts a plain record as well as URLSearchParams", () => {
    expect(parseReportPrefill({ type: "phone", scamPhone: "+61412345678" })).toEqual({
      type: "phone",
      scamPhone: "+61412345678",
    });
  });

  it("takes the first value when a param is repeated", () => {
    expect(parseReportPrefill({ scamUrl: ["https://a.tk", "https://b.tk"] }).scamUrl).toBe("https://a.tk");
  });

  describe("source", () => {
    it("round-trips a known surface", () => {
      const query = buildReportQuery({ type: "url", scamUrl: "https://evil.tk", source: "ext-firefox" });
      expect(parseReportPrefill(new URLSearchParams(query)).source).toBe("ext-firefox");
    });

    it("drops an unknown source rather than bucketing it", () => {
      // The param arrives from a link anyone can edit. A catch-all bucket would
      // fill with whatever strangers typed and read as if it meant something.
      expect(parseReportPrefill({ source: "twitter-campaign-42" }).source).toBeUndefined();
      expect(parseReportPrefill({ source: "unknown" }).source).toBeUndefined();
    });

    it("refuses to emit an unallowlisted source", () => {
      // Allowlisted on the way out too, so a bad value cannot be reflected into
      // a link we publish in an email or a popup.
      const query = buildReportQuery({ source: "not-a-surface" as never });
      expect(query).toBe("");
    });

    it("carries no source when none was given", () => {
      expect(parseReportPrefill({ type: "url" }).source).toBeUndefined();
      expect(buildReportQuery({ type: "url" })).not.toContain("source");
    });

    it("cannot carry an identifier", () => {
      // The closed list is what makes this a surface label rather than a
      // tracking parameter — there is no value it can hold that identifies a
      // person, a session or a campaign.
      for (const crafted of ["user-1234", "session:abcdef", "ext-chromium&uid=9"]) {
        expect(parseReportPrefill({ source: crafted }).source).toBeUndefined();
      }
    });
  });
});
