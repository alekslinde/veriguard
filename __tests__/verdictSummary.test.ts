import { describe, it, expect } from "vitest";
import {
  composeVerdict,
  overallVerdict,
  isClean,
  defangFlag,
  defangValue,
  formatVerdictEmail,
  pooledSignals,
  composeVerdictWithEvidence,
  VERDICT_RANK,
} from "@/lib/verdictSummary";
import { AnalyzedIdentifier, CheckResult } from "@veriguard/engine/scamDetector";
import { TrackingPixelReport } from "@/lib/trackingPixel";

// Minimal builders — these mirror the shapes the real analysers emit, kept
// local so the tests don't depend on the (heavier) full analysis pipeline.
function ident(
  kind: AnalyzedIdentifier["kind"],
  verdict: CheckResult["verdict"],
  value = "",
  score = 0,
  flags: string[] = [],
  extra: Partial<CheckResult> = {},
): AnalyzedIdentifier {
  return { kind, value, result: { verdict, score, flags, details: "", ...extra } };
}

function pixel(summary = "1 tracking pixel"): TrackingPixelReport {
  return {
    pixels: [{ url: "x", esp: "Mailchimp", notes: ["Sent through Mailchimp"] } as never],
    hasTrackingPixels: true,
    espsUsed: ["Mailchimp"],
    espReports: [],
    embeddedRecipients: [],
    summary,
  };
}

describe("composeVerdict", () => {
  it("returns null when there are no identifiers", () => {
    expect(composeVerdict([], null)).toBeNull();
  });

  it("picks the worst verdict among identifiers", () => {
    const results = [
      ident("url", "safe"),
      ident("email", "likely_scam"),
      ident("phone", "suspicious"),
    ];
    expect(composeVerdict(results, null)).toEqual({ verdict: "likely_scam", score: 0 });
  });

  it("ranks unknown above safe but below suspicious", () => {
    expect(VERDICT_RANK.safe).toBeLessThan(VERDICT_RANK.unknown);
    expect(VERDICT_RANK.unknown).toBeLessThan(VERDICT_RANK.suspicious);
    const results = [ident("url", "safe"), ident("message", "unknown")];
    expect(composeVerdict(results, null)?.verdict).toBe("unknown");
  });

  it("nudges an otherwise-clean result to suspicious when a pixel is present", () => {
    const results = [ident("url", "safe", "", 5)];
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "suspicious", score: 40 });
  });

  it("does not downgrade a worse verdict because of a pixel", () => {
    const results = [ident("email", "likely_scam", "", 90)];
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "likely_scam", score: 90 });
  });

  it("keeps the higher of the pixel floor and the existing score", () => {
    const results = [ident("url", "safe", "", 55)];
    // 55 already exceeds the 40 pixel floor, so it must survive the nudge.
    expect(composeVerdict(results, pixel())).toEqual({ verdict: "suspicious", score: 55 });
  });
});

describe("overallVerdict (no-results fallback)", () => {
  it("defers to composeVerdict when there are scored identifiers", () => {
    expect(overallVerdict([ident("email", "likely_scam")], null)).toEqual({ verdict: "likely_scam", score: 0 });
  });
  it("is suspicious for a header-only email with sender flags", () => {
    expect(overallVerdict([], null, ["Reply-To elsewhere"]).verdict).toBe("suspicious");
  });
  it("is suspicious for a header-only email with a pixel or other tracking", () => {
    expect(overallVerdict([], pixel()).verdict).toBe("suspicious");
    expect(overallVerdict([], null, [], true).verdict).toBe("suspicious");
  });
  it("is unknown for an unscored email with no signals", () => {
    expect(overallVerdict([], null).verdict).toBe("unknown");
  });
});

describe("isClean", () => {
  it("is true only when every identifier is safe with no pixel or flags", () => {
    expect(isClean([ident("url", "safe")], null, [])).toBe(true);
  });
  it("is false with a non-safe identifier", () => {
    expect(isClean([ident("url", "suspicious")], null, [])).toBe(false);
  });
  it("is false when a tracking pixel is present", () => {
    expect(isClean([ident("url", "safe")], pixel(), [])).toBe(false);
  });
  it("is false when sender flags are present", () => {
    expect(isClean([ident("url", "safe")], null, ["Reply-To goes elsewhere"])).toBe(false);
  });
  it("is false with no identifiers at all", () => {
    expect(isClean([], null, [])).toBe(false);
  });
});

describe("defangFlag", () => {
  it("neutralises email addresses and bare domains, leaving prose intact", () => {
    const out = defangFlag("Reply-To (x@evil.tk) differs from noreply@bank.com.au");
    expect(out).toContain("x[@]evil[.]tk");
    expect(out).toContain("noreply[@]bank[.]com[.]au");
    expect(out).not.toMatch(/@evil\.tk/);
  });
  it("leaves dmarc=none and ordinary words untouched", () => {
    expect(defangFlag("publishes no enforcement (dmarc=none)")).toBe(
      "publishes no enforcement (dmarc=none)",
    );
  });
});

describe("defangValue", () => {
  it("defangs by kind", () => {
    expect(defangValue("email", "a@b.com")).toBe("a[@]b[.]com");
    expect(defangValue("phone", "0412345678")).not.toBe("0412345678");
  });
});

describe("formatVerdictEmail", () => {
  it("leads with a scam headline and defangs identifiers in the breakdown", () => {
    const email = formatVerdictEmail({
      results: [ident("email", "likely_scam", "scammer@evil.tk")],
      emailFlags: ["SPF failed for evil.tk"],
      pixelReport: null,
    });
    expect(email.subject).toMatch(/scam/i);
    expect(email.text).toContain("🚨");
    expect(email.text).toContain("scammer[@]evil[.]tk");
    expect(email.text).not.toMatch(/scammer@evil\.tk/);
    // Footer must state we didn't keep a copy (the discard promise).
    expect(email.text).toMatch(/did not keep a copy/i);
  });

  it("ends with a report CTA linking to a prefilled form when siteUrl is given", () => {
    const email = formatVerdictEmail({
      results: [ident("email", "likely_scam", "scammer@evil.tk"), ident("url", "likely_scam", "https://evil.tk/login")],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app",
      senderAddress: "scammer@evil.tk",
      replyToAddress: "reply@other.tk",
    });
    const match = email.text.match(/https:\/\/veriguard\.app\/report\?\S+/);
    expect(match).not.toBeNull();
    const params = new URL(match![0]).searchParams;
    expect(params.get("type")).toBe("email");
    expect(params.get("scamEmail")).toBe("scammer@evil.tk");
    expect(params.get("scamReplyTo")).toBe("reply@other.tk");
    expect(params.get("scamUrl")).toBe("https://evil.tk/login");
    // And the HTML gets a real button pointing at the same place.
    expect(email.html).toContain("/report?");
    expect(email.html).toMatch(/Report this scam/);
  });

  it("never puts the forwarded email content in the CTA link", () => {
    // The reply promises we kept no copy; the CTA must not smuggle one out.
    const secret = "PleaseSendYourPasswordToUs";
    const email = formatVerdictEmail({
      results: [ident("message", "likely_scam", secret, 90, ["Urgency pressure"])],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app",
    });
    const link = email.text.match(/https:\/\/veriguard\.app\/report\S*/)?.[0] ?? "";
    expect(link).not.toContain(secret);
    expect(link).not.toContain(encodeURIComponent(secret));
  });

  it("omits the CTA for a clean result", () => {
    // Inviting a report for an email we just called safe would pollute the
    // public database.
    const email = formatVerdictEmail({
      results: [ident("url", "safe", "https://example.com")],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app",
    });
    expect(email.text).not.toContain("/report");
    expect(email.html).not.toContain("/report");
  });

  it("omits the CTA entirely when no siteUrl is configured", () => {
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "https://evil.tk")],
      emailFlags: [],
      pixelReport: null,
    });
    expect(email.text).not.toContain("/report");
    expect(email.html).not.toContain("<a href");
  });

  it("does not double a trailing slash on the site URL", () => {
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "https://evil.tk")],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app/",
    });
    expect(email.text).toContain("https://veriguard.app/report");
    expect(email.text).not.toContain("com//report");
  });

  it("falls back to a suspicious verdict for a header-only forward with flags", () => {
    const email = formatVerdictEmail({
      results: [],
      emailFlags: ["Reply-To goes to a different domain"],
      pixelReport: null,
    });
    expect(email.subject).toMatch(/suspicious/i);
    expect(email.text).toContain("⚠️");
  });

  it("escapes HTML coming from a flag", () => {
    // Flags are echoed verbatim (after defang) into list items — a crafted
    // flag must not break out into live markup.
    const email = formatVerdictEmail({
      results: [ident("url", "suspicious", "http://x.test")],
      emailFlags: ["sender used <script>alert(1)</script> in the name"],
      pixelReport: null,
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });
});

// ── Plain language + branding ─────────────────────────────────────────────────
//
// The reply has to read as a genuine, easy-to-follow message from a real
// service to a worried, non-technical reader — not a wall of jargon, and not
// something that could itself be mistaken for a scam. These lock in the parts
// that carry that: a branded header, a colour-coded verdict banner, a prominent
// "what to do" step, everyday status words, and a trust line.

describe("formatVerdictEmail — plain language & branding", () => {
  const scam = () =>
    formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.tk/login", 90, ["Dodgy top-level domain"])],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app",
    });

  it("carries a Veriguard-branded header and states what the service is", () => {
    const email = scam();
    // The wordmark appears in both channels so the reply is identifiably ours.
    expect(email.html).toContain("Veriguard");
    expect(email.text).toContain("VERIGUARD");
    // A branded surface colour (the app's navy ground) — i.e. it isn't a bare
    // wall of black-on-white text.
    expect(email.html).toContain("#141C2B");
  });

  it("leads with a plain-English verdict label, not the engine's machine value", () => {
    const email = scam();
    expect(email.html).toContain("Likely a scam");
    // The raw enum value must never surface to the reader.
    expect(email.html).not.toContain("likely_scam");
    expect(email.text).not.toContain("likely_scam");
  });

  it("gives a clear, prominent next step near the top", () => {
    const email = scam();
    expect(email.html).toContain("What you should do");
    expect(email.text).toContain("WHAT YOU SHOULD DO");
    // The concrete instruction, not vague reassurance.
    expect(email.text).toMatch(/don't click any links/i);
  });

  it("labels each part of the email in everyday words", () => {
    const email = scam();
    // "Dangerous", not "likely scam"; the section reads "What we found".
    expect(email.html).toContain("Dangerous");
    expect(email.text).toContain("What we found".toUpperCase());
  });

  it("softens the advice for a clean result instead of shouting", () => {
    const email = formatVerdictEmail({
      results: [ident("url", "safe", "https://auspost.com.au/track", 0)],
      emailFlags: [],
      pixelReport: null,
      siteUrl: "https://veriguard.app",
    });
    expect(email.text).toMatch(/likely fine/i);
    expect(email.text).not.toMatch(/don't click any links/i);
  });

  it("renders the verdict meaning as dark text on a tint, not white on the accent", () => {
    // The banner is for low-vision readers; white on the amber/green accents
    // fails WCAG AA at body size, so the meaning must stay dark-on-pale.
    const email = formatVerdictEmail({
      results: [ident("url", "suspicious", "http://x.test", 40, ["Odd link"])],
      emailFlags: [],
      pixelReport: null,
    });
    // Tint background + accent border + dark meaning text — never a solid-accent
    // fill under white body text.
    expect(email.html).toContain("background:#fdf6e3"); // the suspicious tint
    expect(email.html).toContain("color:#2b3648"); // dark meaning text
    expect(email.html).not.toContain("background:#b9770e"); // solid accent fill
  });

  it("states plainly that it will never ask for anything, so it can't read as a scam", () => {
    const email = scam();
    expect(email.html).toMatch(/never ask you for passwords/i);
    expect(email.text).toMatch(/never ask you for passwords/i);
  });

  it("still references no external resource even with the fuller branded layout", () => {
    // The whole shell — header, banner, footer — must stay image- and
    // web-font-free so the reply can't leak a read receipt.
    const email = scam();
    expect(email.html).not.toMatch(/src\s*=\s*["']?https?:/i);
    expect(email.html).not.toMatch(/<link|@import|url\(/i);
  });
});

// ── Explaining the verdict ────────────────────────────────────────────────────
//
// The email once printed "Link evil[.]tk: likely scam" and nothing else: the
// per-result flags were computed and then discarded. That tells someone to be
// afraid without teaching them what to look for, which is the opposite of what
// this project is for. These cover the reasoning now reaching the reader.

describe("formatVerdictEmail — explaining why", () => {
  it("lists the reasons under each identifier, not just its verdict", () => {
    const email = formatVerdictEmail({
      results: [
        ident("url", "likely_scam", "http://evil.tk/login", 90, [
          "Dodgy top-level domain (.tk) — commonly used by scammers",
          "Contains login/verify/secure keywords — common in phishing URLs",
        ]),
      ],
      emailFlags: [],
      pixelReport: null,
    });

    expect(email.text).toContain("Dodgy top-level domain");
    expect(email.text).toContain("Contains login/verify/secure keywords");
    expect(email.html).toContain("Dodgy top-level domain");
  });

  it("defangs any domain appearing inside a reason", () => {
    // Reasons quote attacker-controlled content; a live link in the verdict
    // email would hand the reader the very thing we told them not to click.
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.tk", 90, ["Impersonates commbank.com.au"])],
      emailFlags: [],
      pixelReport: null,
    });

    expect(email.text).toContain("commbank[.]com[.]au");
    expect(email.text).not.toMatch(/commbank\.com\.au/);
  });

  it("caps a long reason list so the verdict is not buried", () => {
    const many = Array.from({ length: 9 }, (_, i) => `Reason number ${i + 1}`);
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.tk", 90, many)],
      emailFlags: [],
      pixelReport: null,
    });

    expect(email.text).toContain("Reason number 1");
    expect(email.text).not.toContain("Reason number 9");
    expect(email.text).toMatch(/and 5 more signals/);
  });

  it("uses the singular when exactly one reason is hidden", () => {
    const many = Array.from({ length: 5 }, (_, i) => `Reason ${i + 1}`);
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.tk", 90, many)],
      emailFlags: [],
      pixelReport: null,
    });
    expect(email.text).toMatch(/and 1 more signal(?!s)/);
  });

  it("leads with the resolved destination of a shortened link", () => {
    // The single most useful fact for a shortened URL, so it goes first rather
    // than sitting among the other signals.
    const email = formatVerdictEmail({
      results: [
        ident("url", "likely_scam", "https://bit.ly/x", 90, ["URL shortener detected"], {
          expandedUrl: "hxxp://evil[.]tk/steal",
        }),
      ],
      emailFlags: [],
      pixelReport: null,
    });

    const lines = email.text.split("\n");
    const destination = lines.findIndex((l) => l.includes("Real destination"));
    const shortener = lines.findIndex((l) => l.includes("URL shortener detected"));
    expect(destination).toBeGreaterThan(-1);
    expect(destination).toBeLessThan(shortener);
  });

  it("says what was checked when nothing was flagged, rather than going quiet", () => {
    // Silence reads as "we didn't bother"; naming the checks is the reassurance.
    const email = formatVerdictEmail({
      results: [ident("url", "safe", "https://auspost.com.au/track", 0)],
      emailFlags: [],
      pixelReport: null,
    });
    expect(email.text).toMatch(/nothing matched/i);
  });

  it("escapes HTML coming from a per-result reason", () => {
    // Same injection surface as emailFlags, via the new path.
    const email = formatVerdictEmail({
      results: [ident("url", "suspicious", "http://x.test", 40, ["<img src=x onerror=alert(1)>"])],
      emailFlags: [],
      pixelReport: null,
    });
    expect(email.html).not.toContain("<img src=x");
    expect(email.html).toContain("&lt;img");
  });

  it("references no external resource, so the reply cannot leak a read receipt", () => {
    // The recipient may be a scam victim; a remote image would disclose their
    // IP and the fact they opened it.
    const email = formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.tk", 90, ["Dodgy TLD"])],
      emailFlags: [],
      pixelReport: null,
    });
    expect(email.html).not.toMatch(/src\s*=\s*["']?https?:/i);
    expect(email.html).not.toMatch(/<link|@import|url\(/i);
  });
});

describe("pooledSignals", () => {
  const sig = (text: string, points: number, source = "message") =>
    ({ text, points, source }) as never;

  it("returns nothing when there are no identifiers", () => {
    expect(pooledSignals([])).toEqual([]);
  });

  it("pools findings across every identifier, not just the worst one", () => {
    // The case this exists for: a parcel-fee SMS carrying a dodgy link scores
    // as two identifiers, and showing only the message's rows hid the URL
    // findings — the most concrete evidence on the page.
    const results = [
      ident("message", "likely_scam", "", 95, [], {
        signals: [sig("Urgency language detected", 20), sig("Contains link", 15)],
      }),
      ident("url", "likely_scam", "", 45, [], {
        signals: [sig("Dodgy top-level domain (.top)", 30, "link"), sig("No HTTPS", 15, "link")],
      }),
    ];
    expect(pooledSignals(results).map((s) => s.text)).toEqual([
      "Urgency language detected",
      "Contains link",
      "Dodgy top-level domain (.top)",
      "No HTTPS",
    ]);
  });

  it("collapses a finding reported by two identifiers to one row", () => {
    const results = [
      ident("message", "suspicious", "", 20, [], { signals: [sig("No HTTPS", 15)] }),
      ident("url", "suspicious", "", 20, [], { signals: [sig("No HTTPS", 15, "link")] }),
    ];
    expect(pooledSignals(results)).toHaveLength(1);
  });

  it("sorts the clamp row last, after every observation", () => {
    // The clamp is arithmetic about the total, so it belongs at the bottom of
    // the column it explains rather than interleaved with the findings.
    const results = [
      ident("message", "likely_scam", "", 100, [], {
        signals: [sig("Signals total 130 — the score is capped at 100", -30, "score")],
      }),
      ident("url", "likely_scam", "", 45, [], { signals: [sig("No HTTPS", 15, "link")] }),
    ];
    expect(pooledSignals(results).map((s) => s.source)).toEqual(["link", "score"]);
  });

  it("tolerates an identifier with no signals at all", () => {
    const results = [ident("phone", "safe", "0400000000", 0)];
    expect(pooledSignals(results)).toEqual([]);
  });
});

// The panel's own copy invites the reader to check our arithmetic, so the rows
// on screen have to add up to the headline above them. Composing the score from
// the worst identifier while pooling rows from all of them broke exactly that.
describe("composeVerdictWithEvidence — the rows add up to the score", () => {
  const sig = (text: string, points: number, source = "message") =>
    ({ text, points, source }) as never;

  it("headline equals the sum of the evidence shown", () => {
    const results = [
      ident("message", "likely_scam", "msg", 75, [], {
        signals: [sig("urgency", 20), sig("address", 20), sig("link", 15), sig("dodgy link", 20)],
      }),
      ident("url", "likely_scam", "http://x.top", 45, [], {
        signals: [sig("dodgy tld", 30), sig("no https", 15)],
      }),
    ];
    const c = composeVerdictWithEvidence(results, null)!;
    const shown = c.signals.reduce((n, x) => n + x.points, 0);
    expect(shown).toBe(c.score);
    // Worst-identifier-wins still decides severity.
    expect(c.verdict).toBe("likely_scam");
    // And pooling can only ever raise the number, never soften it.
    expect(c.score).toBeGreaterThanOrEqual(75);
  });

  it("emits exactly one clamp row when the pooled total exceeds the ceiling", () => {
    const results = [
      ident("message", "likely_scam", "m", 100, [], { signals: [sig("a", 90), sig("cap", -0)] }),
      ident("url", "likely_scam", "u", 60, [], { signals: [sig("b", 60)] }),
    ];
    const c = composeVerdictWithEvidence(results, null)!;
    const clamps = c.signals.filter((x) => x.source === "score");
    expect(clamps).toHaveLength(1);
    expect(c.score).toBe(100);
    expect(c.signals.reduce((n, x) => n + x.points, 0)).toBe(100);
  });

  it("names the tracking pixel it scored, instead of an unexplained meter", () => {
    const pixel = { hasTrackingPixels: true, pixels: [{}] } as unknown as TrackingPixelReport;
    const results = [ident("message", "safe", "m", 5, [], { signals: [sig("minor", 5)] })];
    const c = composeVerdictWithEvidence(results, pixel)!;
    expect(c.verdict).toBe("suspicious");
    expect(c.signals.reduce((n, x) => n + x.points, 0)).toBe(c.score);
    expect(c.signals.some((x) => /tracking pixel/i.test(x.text))).toBe(true);
  });

  it("returns null when there is nothing scored, like composeVerdict", () => {
    expect(composeVerdictWithEvidence([], null)).toBeNull();
  });
});

// The emailed verdict and the results sheet are two renderings of one check.
// Someone who pasted a message on the site and someone who forwarded it should
// be told the same things in the same order — otherwise the email reads as a
// lesser product, and the transparency claim ("we publish our weights") holds
// on one surface and not the other.
describe("verdict email parity with the results sheet", () => {
  const scored = (points: number[], texts: string[]) =>
    ident("message", "likely_scam", "", 70, texts, {
      signals: texts.map((text, i) => ({ text, points: points[i], source: "message" as const })),
    });

  const sample = () =>
    formatVerdictEmail({
      results: [
        scored(
          [30, 25, 0],
          [
            "Urgency language detected: \"within 24 hours\"",
            "Claims to be from a government agency — verify directly via official channels",
            "A context row worth nothing",
          ],
        ),
      ],
      emailFlags: [],
      pixelReport: null,
    });

  it("publishes each signal's weight", () => {
    // The claim the product rests on. A list of assertions with a score and no
    // arithmetic asks to be taken on faith, which is what the sheet exists not
    // to do.
    const { text, html } = sample();
    expect(text).toContain("+30");
    expect(text).toContain("+25");
    expect(html).toContain("+30");
    expect(html).toContain("+25");
  });

  it("marks a context row as contributing nothing rather than as zero", () => {
    // "0" reads as a measured value; the em dash reads as "not a contribution",
    // which is what a context row is. Matches the sheet.
    expect(sample().text).toContain("—  A context row worth nothing");
  });

  it("states the risk score and what that band means", () => {
    const { text, html } = sample();
    expect(text).toMatch(/RISK SCORE: \d+\/100/);
    expect(text).toMatch(/Past where honest messages land/);
    expect(html).toContain("Risk score");
  });

  it("names the tactics using the Learn page's own words", () => {
    // Continuity is the whole point of the tactics layer: someone who has read
    // how scammers operate should meet the same six names on their result.
    const { text, html } = sample();
    expect(text).toContain("TACTICS USED");
    expect(text).toContain("Urgency & fear");
    expect(html).toContain("Tactics used");
  });

  it("leads with the score and evidence, then advice", () => {
    // The sheet's order. Advice used to come first; the redesign puts the
    // reasoning above it so the verdict is read as a conclusion rather than an
    // instruction.
    const { text } = sample();
    expect(text.indexOf("RISK SCORE")).toBeLessThan(text.indexOf("WHAT WE FOUND"));
    expect(text.indexOf("WHAT WE FOUND")).toBeLessThan(text.indexOf("WHAT YOU SHOULD DO"));
  });

  it("still renders when an identifier carries no weighted signals", () => {
    // Results predating the signals field, and the header-only forward, must
    // not lose their reasons — the email falls back to the plain flag list.
    const { text } = formatVerdictEmail({
      results: [ident("url", "likely_scam", "http://evil.test", 70, ["Dodgy top-level domain"])],
      emailFlags: [],
      pixelReport: null,
    });
    expect(text).toContain("Dodgy top-level domain");
  });

  it("still scores a header-only forward, which has a real score of its own", () => {
    // overallVerdict gives sender-spoofing flags 40 even with no scored
    // identifier, so the number is genuine and belongs in the reply.
    const { text } = formatVerdictEmail({
      results: [],
      emailFlags: ["Sender name claims to be \"myGov\" but the real address is elsewhere"],
      pixelReport: null,
    });
    expect(text).toContain("RISK SCORE: 40/100");
  });

  it("omits the score when there is genuinely nothing to report", () => {
    // Nothing scored and nothing flagged: "Risk score: 0/100" would present a
    // number we never worked out as though it were a finding.
    const { text } = formatVerdictEmail({ results: [], emailFlags: [], pixelReport: null });
    expect(text).not.toContain("RISK SCORE");
  });

  it("defangs signal text, so no evidence row carries a live link", () => {
    const { text, html } = formatVerdictEmail({
      results: [
        ident("message", "likely_scam", "", 70, [], {
          signals: [{ text: "Contains link: http://evil.test/pay", points: 20, source: "message" }],
        }),
      ],
      emailFlags: [],
      pixelReport: null,
    });
    expect(text).not.toContain("http://evil.test");
    expect(html).not.toContain("http://evil.test");
  });
});
