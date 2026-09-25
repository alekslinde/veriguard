import { describe, it, expect } from "vitest";
import {
  defang,
  stripTrackingParams,
  normaliseForAnalysis,
  safeDisplayUrl,
  defangText,
  defangEmail,
  defangPhone,
  extractIdentifiers,
} from "@veriguard/engine/urlSanitizer";

describe("defang", () => {
  it("converts https to hxxps", () => {
    expect(defang("https://evil.com")).toBe("hxxps://evil[.]com");
  });

  it("converts http to hxxp", () => {
    expect(defang("http://evil.com")).toBe("hxxp://evil[.]com");
  });

  it("converts ftp to fxp", () => {
    expect(defang("ftp://files.evil.com")).toBe("fxp://files[.]evil[.]com");
  });

  it("replaces all dots in the URL", () => {
    expect(defang("https://sub.evil.co.uk/path")).toBe(
      "hxxps://sub[.]evil[.]co[.]uk/path"
    );
  });

  it("handles uppercase HTTPS, preserving the case of each replaced T", () => {
    expect(defang("HTTPS://Evil.Com")).toBe("HXXPS://Evil[.]Com");
    expect(defang("HtTpS://Evil.Com")).toBe("HxXpS://Evil[.]Com");
  });

  it("does not transform strings that do not start with a known protocol", () => {
    // No protocol match — only dots get replaced
    expect(defang("evil.com/path")).toBe("evil[.]com/path");
  });
});

describe("stripTrackingParams", () => {
  it("strips utm_source", () => {
    const result = stripTrackingParams("https://example.com/?q=hello&utm_source=google");
    expect(result).toContain("q=hello");
    expect(result).not.toContain("utm_source");
  });

  it("strips fbclid", () => {
    const result = stripTrackingParams("https://example.com/?fbclid=abc123&page=2");
    expect(result).not.toContain("fbclid");
    expect(result).toContain("page=2");
  });

  it("strips multiple tracking params in one pass", () => {
    const result = stripTrackingParams(
      "https://example.com/?utm_source=x&utm_medium=y&utm_campaign=z&q=hello"
    );
    expect(result).toContain("q=hello");
    expect(result).not.toMatch(/utm_/);
  });

  it("strips gclid and msclkid", () => {
    const result = stripTrackingParams(
      "https://example.com/?gclid=abc&msclkid=def&id=1"
    );
    expect(result).not.toContain("gclid");
    expect(result).not.toContain("msclkid");
    expect(result).toContain("id=1");
  });

  it("preserves non-tracking params untouched", () => {
    const result = stripTrackingParams("https://example.com/?q=hello&page=2&sort=asc");
    expect(result).toContain("q=hello");
    expect(result).toContain("page=2");
    expect(result).toContain("sort=asc");
  });

  it("returns original string when URL cannot be parsed", () => {
    const invalid = "not a url %%";
    expect(stripTrackingParams(invalid)).toBe(invalid);
  });

  it("prepends https for protocol-less input and strips the prefix back", () => {
    const result = stripTrackingParams("example.com/?utm_source=x&q=1");
    expect(result).toContain("q=1");
    expect(result).not.toContain("utm_source");
    expect(result).not.toMatch(/^https?:\/\//);
  });

  it("preserves a URL with no tracking params unchanged (normalised form)", () => {
    const url = "https://example.com/?q=hello";
    const result = stripTrackingParams(url);
    expect(result).toContain("q=hello");
    expect(result).not.toContain("utm_");
  });
});

describe("normaliseForAnalysis", () => {
  it("lowercases the hostname", () => {
    const result = normaliseForAnalysis("https://EVIL.COM/Path");
    expect(result).toMatch(/^https:\/\/evil\.com/);
  });

  it("decodes percent-encoded hostname characters", () => {
    // %61 = 'a', so %61to.gov.au → ato.gov.au
    const result = normaliseForAnalysis("https://%61to.gov.au");
    expect(result).toContain("ato.gov.au");
  });

  it("collapses repeated slashes in the path", () => {
    const result = normaliseForAnalysis("https://example.com//double//slash");
    // The path should not contain consecutive slashes
    const url = new URL(result);
    expect(url.pathname).not.toMatch(/\/\//);
  });

  it("falls back to lowercased original when URL is unparseable", () => {
    expect(normaliseForAnalysis("NOT A URL")).toBe("not a url");
  });

  it("prepends https when protocol is missing", () => {
    const result = normaliseForAnalysis("evil.com/path");
    expect(result).toContain("evil.com");
  });
});

describe("safeDisplayUrl", () => {
  it("strips tracking params and defangs the protocol", () => {
    const result = safeDisplayUrl("https://evil.com/?utm_source=x");
    expect(result).not.toContain("utm_source");
    expect(result).not.toMatch(/^https?:\/\//);
  });

  it("replaces dots with [.]", () => {
    const result = safeDisplayUrl("https://evil.tk/");
    expect(result).toContain("[.]");
  });

  it("handles URLs with no tracking params", () => {
    const result = safeDisplayUrl("https://evil.com/phish");
    expect(result).toBe("hxxps://evil[.]com/phish");
  });
});

describe("defangText", () => {
  it("defangs URLs embedded in plain text", () => {
    const result = defangText("Click here: https://evil.com/phish");
    expect(result).toContain("hxxps://evil[.]com/phish");
    expect(result).not.toContain("https://evil.com");
  });

  it("defangs multiple URLs in the same string", () => {
    const result = defangText(
      "Link 1: https://evil.com and Link 2: http://bad.tk/x"
    );
    expect(result).not.toContain("https://");
    expect(result).not.toContain("http://");
    expect(result).toContain("hxxps://evil[.]com");
    expect(result).toContain("hxxp://bad[.]tk/x");
  });

  it("leaves text with no URLs unchanged", () => {
    const text = "No links here, just regular text.";
    expect(defangText(text)).toBe(text);
  });

  it("strips tracking params from embedded URLs before defanging", () => {
    const result = defangText("See: https://example.com/?utm_source=x&q=1");
    expect(result).not.toContain("utm_source");
    expect(result).toContain("q=1");
  });
});

describe("defangEmail", () => {
  it("replaces @ with [@]", () => {
    const result = defangEmail("user@evil.com");
    expect(result).toContain("[@]");
    // No bare @ should remain — only the bracketed form [@]
    expect(result).not.toMatch(/(?<!\[)@(?!\])/);
  });

  it("replaces all dots with [.]", () => {
    expect(defangEmail("user@evil.com")).toBe("user[@]evil[.]com");
  });

  it("handles subdomains and multi-part TLDs", () => {
    expect(defangEmail("user.name@sub.evil.co.uk")).toBe("user[.]name[@]sub[.]evil[.]co[.]uk");
  });

  it("only replaces the first @ (preserves shape for malformed addresses)", () => {
    const result = defangEmail("a@b@c.com");
    expect(result).toBe("a[@]b@c[.]com");
  });

  it("handles an empty string without throwing", () => {
    expect(defangEmail("")).toBe("");
  });
});

describe("defangPhone", () => {
  it("inserts invisible breaks between consecutive digits", () => {
    const result = defangPhone("+61412345678");
    // Strip every non-printable / non-ASCII character; visible number must be intact
    const visible = result.replace(/[^\x20-\x7E]/g, "");
    expect(visible).toBe("+61412345678");
  });

  it("makes the result longer than the input when consecutive digits are present", () => {
    const phone = "+61412345678";
    expect(defangPhone(phone).length).toBeGreaterThan(phone.length);
  });

  it("leaves strings with no consecutive digits unchanged", () => {
    expect(defangPhone("+6 1 4")).toBe("+6 1 4");
  });

  it("handles an empty string without throwing", () => {
    expect(defangPhone("")).toBe("");
  });
});

describe("extractIdentifiers", () => {
  it("extracts a bare URL", () => {
    const { scamUrl, scamEmail, scamPhone } = extractIdentifiers("https://ato-refund.xyz/verify");
    expect(scamUrl).toBe("https://ato-refund.xyz/verify");
    expect(scamEmail).toBe("");
    expect(scamPhone).toBe("");
  });

  it("extracts a URL embedded in SMS text", () => {
    const { scamUrl } = extractIdentifiers(
      "Your parcel is ready: https://au-post.fake/track?id=123 — click to confirm."
    );
    expect(scamUrl).toBe("https://au-post.fake/track?id=123");
  });

  it("strips trailing punctuation from an extracted URL", () => {
    const { scamUrl } = extractIdentifiers("Visit https://evil.com/verify.");
    expect(scamUrl).toBe("https://evil.com/verify");
  });

  it("extracts a bare email address", () => {
    const { scamEmail } = extractIdentifiers("scammer@evil.com");
    expect(scamEmail).toBe("scammer@evil.com");
  });

  it("extracts a From: address in email content", () => {
    const { scamEmail } = extractIdentifiers(
      "From: noreply@fake-ato.com\nSubject: Tax refund\nPlease verify your TFN."
    );
    expect(scamEmail).toBe("noreply@fake-ato.com");
  });

  it("starts an address at its first letter, not at punctuation before it", () => {
    expect(extractIdentifiers("reply to ...scammer@evil.com").scamEmail).toBe("scammer@evil.com");
    expect(extractIdentifiers("-_ops@evil.com").scamEmail).toBe("_ops@evil.com");
    expect(extractIdentifiers("x .. @evil.com and real@evil.com").scamEmail).toBe("real@evil.com");
  });

  it("extracts a phone number when the entire content is a phone number", () => {
    const { scamPhone } = extractIdentifiers("+61 412 345 678");
    expect(scamPhone).toBe("+61 412 345 678");
  });

  it("does NOT extract a phone number embedded inside longer text", () => {
    const { scamPhone } = extractIdentifiers(
      "Please call +61412345678 immediately to avoid penalty."
    );
    expect(scamPhone).toBe("");
  });

  it("extracts both URL and email from the same content", () => {
    const { scamUrl, scamEmail } = extractIdentifiers(
      "From: phish@bad.com\nClick: https://bad.com/steal"
    );
    expect(scamUrl).toBe("https://bad.com/steal");
    expect(scamEmail).toBe("phish@bad.com");
  });

  it("returns all empty strings for plain text with no identifiers", () => {
    const ids = extractIdentifiers("Call us urgently about your account.");
    expect(ids).toEqual({ scamUrl: "", scamEmail: "", scamPhone: "" });
  });
});

// ── Trailing-dot FQDN ─────────────────────────────────────────────────────────
//
// "evil.tk." is a valid absolute-form hostname that resolves to the same host
// as "evil.tk", but the dot survives URL parsing into `hostname` and defeats
// every endsWith() comparison downstream. Found during an adversarial-input
// review; it cut both ways, which is what made it worth fixing:
//
//   http://commbank-secure-login.tk./verify   100 → 70   (evaded the TLD check)
//   https://ato.gov.au./mytax                   5 → 0    (missed the allowlist)

describe("normaliseForAnalysis — trailing-dot hostnames", () => {
  it("strips a trailing dot so suffix checks see the real host", () => {
    expect(normaliseForAnalysis("http://evil.tk./x")).toBe("http://evil.tk/x");
  });

  it("strips repeated trailing dots", () => {
    expect(normaliseForAnalysis("http://evil.tk.../x")).toBe("http://evil.tk/x");
  });

  it("leaves dots inside the hostname alone", () => {
    expect(normaliseForAnalysis("https://ato.gov.au/mytax")).toBe("https://ato.gov.au/mytax");
  });

  it("does not touch dots in the path", () => {
    expect(normaliseForAnalysis("https://example.com/file.tar.gz")).toContain("/file.tar.gz");
  });
});
