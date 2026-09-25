import { describe, it, expect } from "vitest";
import { parseEmailHeaders, analyseEmailIdentities, summariseAuth, domainOf } from "@veriguard/scam-detect/emailHeaders";

describe("domainOf", () => {
  it("returns the lowercased domain after the last @", () => {
    expect(domainOf("User@Evil.TK")).toBe("evil.tk");
    expect(domainOf("a@b@real.com")).toBe("real.com");
  });

  it("returns empty string when there is no @", () => {
    expect(domainOf("not-an-address")).toBe("");
  });

  it("strips trailing punctuation/brackets", () => {
    expect(domainOf("x@evil.tk>")).toBe("evil.tk");
  });
});

describe("parseEmailHeaders", () => {
  const sample = [
    'Delivered-To: victim@gmail.com',
    'From: "myGov" <noreply@evil.tk>',
    'Reply-To: scammer@other-domain.ru',
    'Return-Path: <bounce@evil.tk>',
    'Subject: Your account is suspended',
    '',
    'Body text here, ignored.',
  ].join("\n");

  it("extracts the From display name and address", () => {
    const h = parseEmailHeaders(sample);
    expect(h.fromDisplay).toBe("myGov");
    expect(h.fromAddress).toBe("noreply@evil.tk");
  });

  it("extracts Reply-To and Return-Path", () => {
    const h = parseEmailHeaders(sample);
    expect(h.replyTo).toBe("scammer@other-domain.ru");
    expect(h.returnPath).toBe("bounce@evil.tk");
  });

  it("returns empty fromDisplay for a bare address From", () => {
    const h = parseEmailHeaders("From: plain@sender.com\n\nbody");
    expect(h.fromDisplay).toBe("");
    expect(h.fromAddress).toBe("plain@sender.com");
  });

  it("is case-insensitive on header names", () => {
    const h = parseEmailHeaders("FROM: a@b.com\nREPLY-TO: c@d.com");
    expect(h.fromAddress).toBe("a@b.com");
    expect(h.replyTo).toBe("c@d.com");
  });

  it("unfolds RFC822 continuation lines", () => {
    // A From header value continued on the next (whitespace-led) line.
    const folded = 'From: "Very Long Display Name"\n <real@sender.io>\nSubject: hi';
    const h = parseEmailHeaders(folded);
    expect(h.fromAddress).toBe("real@sender.io");
    expect(h.fromDisplay).toBe("Very Long Display Name");
  });

  it("treats a header-only paste (no blank line) as all headers", () => {
    const h = parseEmailHeaders("From: a@b.com\nReply-To: c@d.com");
    expect(h.fromAddress).toBe("a@b.com");
    expect(h.replyTo).toBe("c@d.com");
  });

  it("returns empty fields when nothing matches", () => {
    const h = parseEmailHeaders("just some random text with no headers");
    expect(h.fromAddress).toBe("");
    expect(h.replyTo).toBe("");
  });
});

describe("parseEmailHeaders — authentication & origin", () => {
  // Trimmed from a real myGov-impersonation phish: a Swedish .se domain on
  // Microsoft 365, authenticated for itself, DMARC=none, DKIM by an onmicrosoft
  // tenant unrelated to the From.
  const phish = [
    "Return-Path: <linus@uppent.se>",
    "Authentication-Results: bimi.icloud.com; bimi=skipped reason=\"insufficient dmarc\"",
    "Authentication-Results: dmarc.icloud.com; dmarc=none header.from=uppent.se",
    "Authentication-Results: dkim-verifier.icloud.com; dkim=pass header.d=markona.onmicrosoft.com header.i=@markona.onmicrosoft.com",
    "Received-SPF: pass (spf.icloud.com: domain of linus@uppent.se designates 52.102.163.63 as permitted sender) client-ip=52.102.163.63; helo=x.outbound.protection.outlook.com; envelope-from=linus@uppent.se",
    "ARC-Authentication-Results: i=1; mx.microsoft.com 1; spf=pass; dmarc=pass action=none header.from=uppent.se; dkim=pass header.d=uppent.se; arc=none",
    "From: myGov <linus@uppent.se>",
    "Subject: myGov Notification",
    "Accept-Language: sv-SE, en-US",
    "",
    "Body.",
  ].join("\n");

  it("extracts SPF, DKIM (with signing domain) and DMARC verdicts", () => {
    const h = parseEmailHeaders(phish);
    expect(h.spf).toBe("pass");
    expect(h.dkim).toBe("pass");
    expect(h.dkimDomain).toBe("markona.onmicrosoft.com");
    expect(h.dmarc).toBe("none");
  });

  it("ignores ARC-Authentication-Results (attacker-controlled)", () => {
    // The ARC line claims dmarc=pass; the recipient-side verdict is dmarc=none.
    const h = parseEmailHeaders(phish);
    expect(h.dmarc).toBe("none");
  });

  it("does not treat 'insufficient dmarc' prose as a dmarc verdict", () => {
    const h = parseEmailHeaders(phish);
    expect(h.dmarc).not.toBe("skipped");
    expect(h.dmarc).toBe("none");
  });

  it("extracts the origin IP, subject and locale", () => {
    const h = parseEmailHeaders(phish);
    expect(h.originIp).toBe("52.102.163.63");
    expect(h.subject).toBe("myGov Notification");
    expect(h.acceptLanguage).toBe("sv-SE");
  });

  it("falls back to the spf= token when there is no Received-SPF header", () => {
    const h = parseEmailHeaders(
      "Authentication-Results: mx.test; spf=fail smtp.mailfrom=a@b.com\n\nbody",
    );
    expect(h.spf).toBe("fail");
  });

  it("leaves auth fields empty when no auth headers are present", () => {
    const h = parseEmailHeaders("From: a@b.com\n\nbody");
    expect(h.spf).toBe("");
    expect(h.dkim).toBe("");
    expect(h.dmarc).toBe("");
    expect(h.originIp).toBe("");
  });
});

describe("analyseEmailIdentities", () => {
  it("flags a From/Reply-To domain mismatch", () => {
    const r = analyseEmailIdentities({
      fromAddress: "noreply@evil.tk",
      replyTo: "scammer@other.ru",
    });
    expect(r.score).toBeGreaterThan(0);
    expect(r.flags.join(" ")).toMatch(/reply-to/i);
  });

  it("does NOT flag when From and Reply-To share a domain", () => {
    const r = analyseEmailIdentities({
      fromAddress: "noreply@bank.com",
      replyTo: "support@bank.com",
    });
    expect(r.flags).toHaveLength(0);
    expect(r.score).toBe(0);
  });

  it("flags display-name brand masking", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/masking|display name/i);
    expect(r.score).toBeGreaterThan(0);
  });

  it("flags display-name masking for a food delivery brand (#66)", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "Uber Eats",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/masking|display name/i);
    expect(r.score).toBeGreaterThan(0);
  });

  it("flags display-name masking for a super fund brand (#64)", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "AustralianSuper",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/masking|display name/i);
    expect(r.score).toBeGreaterThan(0);
  });

  it("does NOT flag a brand display name on its legit domain", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "noreply@my.gov.au",
    });
    expect(r.flags).toHaveLength(0);
  });

  it("flags a display name containing a mismatched email address", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "service@paypal.com",
      fromAddress: "noreply@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/doesn't match/i);
  });

  it("flags a Return-Path domain mismatch", () => {
    const r = analyseEmailIdentities({
      fromAddress: "a@bank.com",
      returnPath: "bounce@evil.tk",
    });
    expect(r.flags.join(" ")).toMatch(/return-path/i);
  });

  it("returns no flags when only one identity is present", () => {
    expect(analyseEmailIdentities({ fromAddress: "a@b.com" }).flags).toHaveLength(0);
    expect(analyseEmailIdentities({}).flags).toHaveLength(0);
  });

  it("flags an SPF failure", () => {
    const r = analyseEmailIdentities({ fromAddress: "a@bank.com", spf: "fail" });
    expect(r.flags.join(" ")).toMatch(/spf failed/i);
    expect(r.score).toBeGreaterThan(0);
  });

  it("flags a DMARC failure", () => {
    const r = analyseEmailIdentities({ fromAddress: "a@bank.com", dmarc: "fail" });
    expect(r.flags.join(" ")).toMatch(/dmarc failed/i);
  });

  it("flags dmarc=none when the display name impersonates a brand", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "linus@uppent.se",
      dmarc: "none",
    });
    expect(r.flags.join(" ")).toMatch(/no dmarc enforcement/i);
  });

  it("does NOT flag dmarc=none without brand impersonation", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "Linus",
      fromAddress: "linus@uppent.se",
      dmarc: "none",
    });
    expect(r.flags.join(" ")).not.toMatch(/dmarc/i);
  });

  it("flags energy retailer display-name impersonation (D3 / #121)", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "origin energy billing",
      fromAddress: "billing@mail-refund-portal.xyz",
      dmarc: "none",
    });
    expect(r.flags.join(" ")).toMatch(/no dmarc enforcement/i);
  });

  it("flags crypto exchange display-name impersonation (D6 / #123)", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "coinspot security",
      fromAddress: "security@account-verify-portal.com",
      dmarc: "none",
    });
    expect(r.flags.join(" ")).toMatch(/no dmarc enforcement/i);
  });

  it("flags DKIM signed by an unrelated domain", () => {
    const r = analyseEmailIdentities({
      fromAddress: "linus@uppent.se",
      dkim: "pass",
      dkimDomain: "markona.onmicrosoft.com",
    });
    expect(r.flags.join(" ")).toMatch(/dkim is signed by/i);
  });

  it("does NOT flag DKIM when the signing domain is aligned", () => {
    const r = analyseEmailIdentities({
      fromAddress: "noreply@bank.com",
      dkim: "pass",
      dkimDomain: "mail.bank.com",
    });
    expect(r.flags.join(" ")).not.toMatch(/dkim/i);
  });

  it("flags a non-English locale on a brand impersonation", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "linus@uppent.se",
      acceptLanguage: "sv-SE",
    });
    expect(r.flags.join(" ")).toMatch(/non-english locale/i);
  });

  it("does NOT flag an English locale", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "linus@uppent.se",
      acceptLanguage: "en-AU",
    });
    expect(r.flags.join(" ")).not.toMatch(/locale/i);
  });

  it("does NOT flag dmarc=none when the sender's own domain carries the brand substring", () => {
    // "Allianz" contains the brand token "anz" but is sent from allianz.de —
    // a legitimate sender, not an impersonator.
    const r = analyseEmailIdentities({
      fromDisplay: "Allianz",
      fromAddress: "noreply@allianz.de",
      dmarc: "none",
    });
    expect(r.flags.join(" ")).not.toMatch(/dmarc|enforcement/i);
  });

  it("does NOT flag a non-English locale when the sender's own domain carries the brand substring", () => {
    // "Snapple" contains "apple" but is sent from snapple.com.
    const r = analyseEmailIdentities({
      fromDisplay: "Snapple",
      fromAddress: "news@snapple.com",
      acceptLanguage: "fr-FR",
    });
    expect(r.flags.join(" ")).not.toMatch(/locale/i);
  });

  it("stacks the auth signals for the full phishing sample", () => {
    const r = analyseEmailIdentities({
      fromDisplay: "myGov",
      fromAddress: "linus@uppent.se",
      dmarc: "none",
      dkim: "pass",
      dkimDomain: "markona.onmicrosoft.com",
      acceptLanguage: "sv-SE",
    });
    // display masking + dmarc=none + unrelated DKIM + non-English locale
    expect(r.flags.length).toBeGreaterThanOrEqual(4);
    expect(r.score).toBeGreaterThan(80);
  });
});

describe("summariseAuth", () => {
  it("composes a compact SPF · DKIM · DMARC line with a defanged signing domain", () => {
    expect(
      summariseAuth({ spf: "pass", dkim: "pass", dkimDomain: "markona.onmicrosoft.com", dmarc: "none" }),
    ).toBe("SPF pass · DKIM pass (markona[.]onmicrosoft[.]com) · DMARC none");
  });

  it("omits mechanisms with no verdict", () => {
    expect(summariseAuth({ spf: "pass" })).toBe("SPF pass");
    expect(summariseAuth({ dmarc: "fail" })).toBe("DMARC fail");
  });

  it("drops unknown/injected verdict tokens", () => {
    expect(summariseAuth({ spf: "<script>", dkim: "pass", dmarc: "garbage" })).toBe("DKIM pass");
  });

  it("strips unexpected characters from the signing domain", () => {
    expect(summariseAuth({ dkim: "pass", dkimDomain: "evil.com<script>" })).toBe(
      "DKIM pass (evil[.]comscript)",
    );
  });

  it("returns empty string when there are no usable verdicts", () => {
    expect(summariseAuth({})).toBe("");
    expect(summariseAuth({ spf: "", dkim: "", dmarc: "" })).toBe("");
  });

  it("renders DKIM without parens when the signing domain is absent", () => {
    expect(summariseAuth({ dkim: "pass" })).toBe("DKIM pass");
  });
});

// ── Display-name address masking ──────────────────────────────────────────────
//
// RFC 5322 puts the real address inside angle brackets; anything before them is
// a display name. addressIn() took the FIRST address anywhere in the value, so
// a display name containing an address won:
//
//   From: "noreply@ato.gov.au" <attacker@evil.tk>
//
// A mail client renders that as the attacker's address with a reassuring label,
// but it scored as though it came from ato.gov.au. Measured at the time:
// 37/suspicious → 17/safe. The verdict flipped, and a phishing email was
// reported as safe. Found by an adversarial-input review of the header parser.

describe("parseEmailHeaders — the address is the one in angle brackets", () => {
  it("ignores an address hidden in the display name", () => {
    const h = parseEmailHeaders('From: "noreply@ato.gov.au" <attacker@evil.tk>');
    expect(h.fromAddress).toBe("attacker@evil.tk");
  });

  it("ignores an address in an unquoted display name", () => {
    const h = parseEmailHeaders("From: noreply@ato.gov.au <attacker@evil.tk>");
    expect(h.fromAddress).toBe("attacker@evil.tk");
  });

  it("applies the same rule to Reply-To", () => {
    const h = parseEmailHeaders(
      'From: a@b.com\nReply-To: "support@auspost.com.au" <collect@evil.tk>',
    );
    expect(h.replyTo).toBe("collect@evil.tk");
  });

  it("still reads an ordinary display name and address", () => {
    const h = parseEmailHeaders("From: Australia Post <noreply@auspost.com.au>");
    expect(h.fromAddress).toBe("noreply@auspost.com.au");
    expect(h.fromDisplay).toBe("Australia Post");
  });

  it("still reads a bare address with no brackets", () => {
    const h = parseEmailHeaders("From: noreply@auspost.com.au");
    expect(h.fromAddress).toBe("noreply@auspost.com.au");
  });

  it("falls back to a bare address when the brackets hold nothing usable", () => {
    // Malformed rather than hostile — don't lose the address entirely.
    const h = parseEmailHeaders("From: noreply@auspost.com.au <>");
    expect(h.fromAddress).toBe("noreply@auspost.com.au");
  });
});
