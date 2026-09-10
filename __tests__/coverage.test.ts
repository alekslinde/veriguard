import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail, checkCustom, checkPhone, analyzeContent } from "@veriguard/engine/scamDetector";
import { overallCoverage, isClean, formatVerdictEmail } from "@/lib/verdictSummary";
import { FALLBACK_REGION, resolveRegionPack, supportedRegions, type RegionCoverage } from "@veriguard/engine/regions";
import { toPrediction } from "@/eval/schema";
import { analysePhone } from "@veriguard/engine/phoneIntel";
import { BASE_SIGNALS } from "@veriguard/engine/regions/base";

// The Phase 3 guarantee: a "safe" verdict asserts we looked and found nothing.
// Where we have no rules to look with, that assertion isn't available — a clean
// result must read as "unknown", never as a confident pass.

// Innocuous content that scores low everywhere, so any "safe" here comes from
// absence of signal rather than from a positive finding.
const BENIGN = "Hey, are we still on for coffee tomorrow morning?";
const BENIGN_URL = "https://example.com/about";

describe("clean results are not presented as safe without coverage", () => {
  it.each([
    ["checkSms", () => checkSms(BENIGN, undefined, FALLBACK_REGION)],
    ["checkCustom", () => checkCustom(BENIGN, undefined, FALLBACK_REGION)],
    ["checkEmail", () => checkEmail(BENIGN, undefined, FALLBACK_REGION)],
    ["checkUrl", () => checkUrl(BENIGN_URL, undefined, FALLBACK_REGION)],
  ])("%s downgrades a clean verdict to unknown", (_name, run) => {
    const result = run();
    expect(result.verdict).toBe("unknown");
    expect(result.coverage).toBe("none");
    expect(result.details).toContain("not checked");
  });

  it("reports safe for the same content under full coverage", () => {
    // Guards against the downgrade being a blanket behaviour rather than a
    // coverage-conditional one.
    expect(checkSms(BENIGN, undefined, "AU").verdict).toBe("safe");
    expect(checkUrl(BENIGN_URL, undefined, "AU").verdict).toBe("safe");
  });

  it("tags every result with the coverage that produced it", () => {
    expect(checkSms(BENIGN, undefined, "AU").coverage).toBe("full");
    expect(checkPhone("+61412345678", "AU").coverage).toBe("full");
    expect(checkPhone("+61412345678", FALLBACK_REGION).coverage).toBe("none");
  });
});

describe("positive detections are unaffected by coverage", () => {
  // Base signals fire everywhere. Anything they catch is a real finding and
  // must be reported as found, not softened into "we couldn't check".
  const SCAM_URL = "http://bit.ly/x";

  it("keeps a scam verdict under no coverage", () => {
    const covered = checkUrl(SCAM_URL, undefined, "AU");
    const uncovered = checkUrl(SCAM_URL, undefined, FALLBACK_REGION);
    expect(covered.verdict).not.toBe("safe");
    expect(uncovered.verdict).toBe(covered.verdict);
    expect(uncovered.score).toBe(covered.score);
  });

  it("still flags universal signals with no national layer", () => {
    const result = checkUrl("http://login-verify.xyz", undefined, FALLBACK_REGION);
    expect(result.flags.join(" ")).toContain("Dodgy top-level domain");
    expect(result.verdict).not.toBe("safe");
  });

  it("does not downgrade an unparseable URL", () => {
    const result = checkUrl("http://[[[", undefined, FALLBACK_REGION);
    expect(result.verdict).toBe("suspicious");
    expect(result.coverage).toBe("none");
  });
});

describe("region-specific allowlists respect coverage", () => {
  it("does not vouch for an AU gov domain under the base-only pack", () => {
    // The allowlist is regional; under no coverage it's empty, so nothing
    // should come back as a verified-legitimate pass.
    const covered = checkUrl("https://my.gov.au", undefined, "AU");
    expect(covered.verdict).toBe("safe");
    expect(checkUrl("https://my.gov.au", undefined, FALLBACK_REGION).verdict).not.toBe("safe");
  });
});

describe("overallCoverage", () => {
  it("reports the weakest coverage across identifiers", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    expect(overallCoverage(results)).toBe("none");
  });

  it("reports full coverage for a fully-covered check", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    expect(overallCoverage(results)).toBe("full");
  });

  it("treats an absent coverage field as full", () => {
    // Results predating the field must read exactly as they always did.
    const legacy = [{ kind: "message" as const, value: "x", result: { verdict: "safe" as const, score: 0, flags: [], details: "" } }];
    expect(overallCoverage(legacy)).toBe("full");
  });

  it("is empty-safe", () => {
    expect(overallCoverage([])).toBe("full");
  });
});

describe("downstream consumers", () => {
  it("never reports an uncovered check as clean", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    expect(isClean(results, null)).toBe(false);
  });

  it("reports a covered benign check as clean", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    expect(isClean(results, null)).toBe(true);
  });

  it("adds a coverage caveat to the email reply", async () => {
    const results = await analyzeContent(BENIGN, undefined, FALLBACK_REGION);
    const email = formatVerdictEmail({ results, emailFlags: [], pixelReport: null });
    expect(email.text).toContain("don't have full scam-detection rules");
    expect(email.html).toContain("don&#39;t have full scam-detection rules");
  });

  it("omits the caveat when coverage is full", async () => {
    const results = await analyzeContent(BENIGN, undefined, "AU");
    const email = formatVerdictEmail({ results, emailFlags: [], pixelReport: null });
    expect(email.text).not.toContain("don't have full scam-detection rules");
  });
});

describe("region reaches nested URL checks", () => {
  // Regression: checkSms/checkCustom called checkUrl without forwarding region,
  // so an embedded link was always scored with AU's allowlist — defeating the
  // coverage guarantee on exactly the path real requests take (analyzeContent
  // routes through these two).
  //
  // abf.gov.au is the probe because it isolates the nested call: AU allowlists
  // it (score 5) while the base-only pack scores it 15 on its own merits, and
  // the surrounding text is neutral so the outer pack contributes nothing
  // region-specific to the difference.
  const GOV_URL = "http://abf.gov.au";
  const TEXT = `hello see ${GOV_URL} thanks`;

  it("scores the direct URL differently per region", () => {
    // The precondition the assertions below rely on.
    expect(checkUrl(GOV_URL, undefined, "AU").score).toBe(5);
    expect(checkUrl(GOV_URL, undefined, FALLBACK_REGION).score).toBe(15);
  });

  it("checkCustom forwards region to the embedded URL check", () => {
    // checkCustom adds floor(urlScore * 0.5), so the nested region shows up
    // directly in the total: 5 -> +2 under AU, 15 -> +7 under the base pack.
    // With the region dropped, both were 2.
    expect(checkCustom(TEXT, undefined, "AU").score).toBe(2);
    expect(checkCustom(TEXT, undefined, FALLBACK_REGION).score).toBe(7);
  });

  it("checkSms forwards region to the embedded URL check", () => {
    // The >40 escalation branch is what consumes the nested score here. Use a
    // link that clears it under the base pack but is allowlisted under AU.
    const SHORTENED = "http://bit.ly/x";
    const smsAu = checkSms(`hello see ${SHORTENED} thanks`, undefined, "AU");
    const smsZz = checkSms(`hello see ${SHORTENED} thanks`, undefined, FALLBACK_REGION);
    // Both regions catch the shortener (a base signal), so the escalation fires
    // in both — this pins that the nested call happens at all.
    expect(smsAu.flags.some((f) => f.includes("dodgy too"))).toBe(true);
    expect(smsZz.flags.some((f) => f.includes("dodgy too"))).toBe(true);
  });
});

describe("region-specific copy is not asserted globally", () => {
  // Regression: the shared scorer hardcoded AU agencies and regulation, so
  // non-AU users were told to contact Scamwatch and were informed about ACMA
  // sender-ID rules that don't apply to them.
  const SCAM = "URGENT: verify now at http://bit.ly/x or your account is suspended. Send your password.";

  it("names the region's reporting body, not Scamwatch everywhere", () => {
    const au = checkSms(SCAM, undefined, "AU");
    const zz = checkSms(SCAM, undefined, FALLBACK_REGION);
    expect(au.details).toContain("Scamwatch");
    expect(zz.details).not.toContain("Scamwatch");
    expect(zz.details).toContain("local consumer protection");
  });

  it("only applies the sender-ID rule where such a scheme exists", () => {
    const TEXT = "Your message may be displayed as unverified — please ignore the unverified label.";
    const au = checkSms(TEXT, undefined, "AU");
    const zz = checkSms(TEXT, undefined, FALLBACK_REGION);
    expect(au.flags.join(" ")).toContain("ACMA");
    // Asserting Australian regulation to a non-AU user would simply be false.
    expect(zz.flags.join(" ")).not.toContain("ACMA");
    expect(zz.score).toBeLessThan(au.score);
  });

  it("uses the region's wording for an allowlisted domain", () => {
    const au = checkUrl("https://my.gov.au", undefined, "AU");
    expect(au.flags[0]).toContain("Australian government domain");
  });
});

// ── The `minimal` tier ───────────────────────────────────────────────────────
//
// `minimal` is a promise about what a "safe" verdict means, not a description
// of effort. These pin the two properties that make it honest: it does not earn
// the right to assert safety, and it ranks BELOW `partial` despite the names
// suggesting otherwise.

describe("minimal coverage tier", () => {
  it("downgrades a clean verdict, exactly like partial and none", () => {
    // The whole design rests on this. A minimal pack knows the local agencies
    // but has no brands, keywords or allowlist, so a quiet result still means
    // "no rule matched because no rule exists".
    const result = checkSms(BENIGN, undefined, "SG");
    expect(result.coverage).toBe("minimal");
    expect(result.verdict).toBe("unknown");
    expect(result.details).toContain("not checked");
  });

  it("still reports positive detections at full strength", () => {
    // The tier's value is entirely on the positive side. Base signals fire
    // everywhere, so anything they catch must read as found.
    const covered = checkUrl("http://bit.ly/x", undefined, "AU");
    const minimal = checkUrl("http://bit.ly/x", undefined, "SG");
    expect(minimal.verdict).toBe(covered.verdict);
    expect(minimal.score).toBe(covered.score);
  });

  it("ranks below partial, not above it", () => {
    // The one ordering that is easy to get backwards: CA's `partial` has
    // brands, agencies and a number plan and lacks only French keywords, while
    // `minimal` has no brand knowledge at all. Reversing these would report the
    // stronger pack as the weakest link.
    const at = (coverage: RegionCoverage) =>
      [{ result: { verdict: "safe", score: 0, flags: [], details: "", category: "SMS", coverage } }] as never;

    expect(overallCoverage(at("minimal"))).toBe("minimal");
    expect(
      overallCoverage([...at("partial"), ...at("minimal")] as never),
    ).toBe("minimal");
    expect(
      overallCoverage([...at("minimal"), ...at("none")] as never),
    ).toBe("none");
  });

  it("abstains in the eval rather than counting as a prediction", () => {
    // A minimal pack's clean cases must land in a coverage metric, never in
    // recall — the same treatment CA's partial cases get.
    expect(toPrediction({ verdict: "safe", score: 0, flags: [], details: "", category: "SMS", coverage: "minimal" } as never)).toBe("abstain");
  });
});

describe("minimal pack phone plans", () => {
  // The phone plan was the one part of the SG pack nothing exercised, and all
  // three of its fields were wrong: premiumPrefixes missing the trunk 0 (so the
  // rule never fired), tollFreeFlag naming the NANP 800 range instead of
  // Singapore's 1800, and a comment claiming 1800 sat in emergencyNumbers,
  // which matches on exact equality rather than as a prefix.
  //
  // These are pinned per-region rather than generically because the numbering
  // plan is the whole point: a generic "some prefix fires" assertion would have
  // passed against every one of those bugs.

  it("fires the premium-rate rule on a Singapore 1900 number", () => {
    // The regression that made premiumFlag unreachable. analysePhone matches
    // against "0" + the national number, so a prefix authored without the trunk
    // 0 is compared against "01900…" and never matches.
    const r = analysePhone("1900 112 233", "SG");
    expect(r.lineType).toBe("premium");
    expect(r.spoofingNotes.join(" ")).toContain("1900");
  });

  it("fires it on the same number in +65 form", () => {
    expect(analysePhone("+65 1900 112 233", "SG").lineType).toBe("premium");
  });

  it("names Singapore's own toll-free range, not the NANP one", () => {
    // A genuine 1800 line was being described as an "800 number" — the exact
    // unverified regional claim this tier's rules forbid.
    const notes = analysePhone("1800 255 0000", "SG").spoofingNotes.join(" ");
    expect(notes).toContain("1800");
    expect(notes).not.toMatch(/\b800 numbers\b/);
  });

  it("recognises the ScamShield helpline as an emergency number", () => {
    expect(analysePhone("1799", "SG").lineType).toBe("emergency");
  });

  it("leaves ordinary mobiles alone", () => {
    // Guards the premium fix against over-reaching onto normal numbers.
    expect(analysePhone("+65 9123 4567", "SG").lineType).toBe("mobile");
  });
});

// Per-region phone plans for the 2026-09-10 `minimal` wave (DE, ZA, IN, JP, BR).
//
// Pinned per region for the reason the SG block above states: the numbering
// plan IS the point, and a generic "some prefix fires" assertion passes against
// every real defect this field has produced. All five plans were verified by
// printing analysePhone output rather than by reading the types, and the suite
// was green before these existed — which is exactly why they exist.
//
// One finding is pinned negatively at the end: JP 0570 cannot reach
// sharedCostFlag, so the pack must not author one.
describe("minimal pack phone plans (2026-09 wave)", () => {
  // ── DE ──
  // 0900 and 0137 are Bundesnetzagentur premium ranges. Authored WITH the trunk
  // 0 because analysePhone matches against "0" + nationalNumber: "+49 900 …"
  // arrives as "9001234567", so a bare "900" would silently never fire.
  it("fires the premium rule on a German 0900 number", () => {
    const r = analysePhone("0900 1234567", "DE");
    expect(r.lineType).toBe("premium");
    expect(r.spoofingNotes.join(" ")).toContain("0900");
  });

  it("fires it on the same number in +49 form", () => {
    expect(analysePhone("+49 900 1234567", "DE").lineType).toBe("premium");
  });

  it("also covers the German 0137 mass-traffic range", () => {
    expect(analysePhone("0137 7123456", "DE").lineType).toBe("premium");
  });

  it("reaches DE/ZA/JP premium verdicts through libphonenumber, not the prefixes", () => {
    // An INJECTION FINDING, pinned so a green suite is not misread.
    //
    // Breaking DE's premiumPrefixes to a trunk-less "900"/"137" left every
    // assertion above green: libphonenumber classifies these ranges as
    // PREMIUM_RATE itself, and analysePhone pushes premiumFlag from that branch
    // too — so lineType, the flag copy and the very_high bump are all reached
    // without the pack's prefixes firing at all.
    //
    // That is the roadmap's NANP trap ("US and CA hide this class of bug")
    // generalising to three more countries. SG is the exception that made the
    // original defect visible, because libphonenumber rejects SG 1900 as
    // invalid and the prefix rule is the only thing that fires.
    //
    // So this test asserts the mechanism rather than the outcome: if these
    // ranges ever stop being classified upstream, the packs' prefixes become
    // load-bearing and the assertions above start testing them for real.
    // Compared in INTERNATIONAL form against the base-only pack. The national
    // form would be confounded: ZZ has no number plan of its own and parses
    // national-format input against DEFAULT_REGION (AU), so "0900 1234567"
    // resolves as an Australian number and "1900 112 233" hits AU's OWN
    // premium range — neither of which says anything about DE, ZA or JP.
    for (const [region, intl] of [["DE", "+49 900 1234567"], ["ZA", "+27 86 2123 456"], ["JP", "+81 990 123456"]] as const) {
      expect({ region, withPlan: analysePhone(intl, region).lineType })
        .toEqual({ region, withPlan: "premium" });
      // No plan in play at all, and still premium — so the verdict is upstream.
      expect({ region, upstream: analysePhone(intl, FALLBACK_REGION).lineType })
        .toEqual({ region, upstream: "premium" });
    }
  });

  it("is the SG plan, not libphonenumber, that catches SG 1900", () => {
    // The contrast case, and the reason the prefixes are kept rather than
    // deleted as dead weight. libphonenumber rejects SG 1900 as invalid, so
    // the pack's prefix is the only thing that produces a premium verdict.
    expect(analysePhone("1900 112 233", "SG").lineType).toBe("premium");
    // International form against the base-only pack: parsed as Singaporean,
    // unclassified upstream, and no plan to rescue it.
    expect(analysePhone("+65 1900 112 233", FALLBACK_REGION).lineType).not.toBe("premium");
  });

  it("names Germany's own toll-free and shared-cost ranges", () => {
    // Naming the NANP 800 range to a German user is the SG tollFreeFlag defect.
    const free = analysePhone("0800 1234567", "DE");
    expect(free.lineType).toBe("freecall");
    expect(free.spoofingNotes.join(" ")).toContain("0800");
    const shared = analysePhone("0180 1234567", "DE");
    expect(shared.lineType).toBe("shared_cost");
    expect(shared.spoofingNotes.join(" ")).toContain("0180");
  });

  it("treats the German medical on-call line as an emergency number", () => {
    expect(analysePhone("116117", "DE").lineType).toBe("emergency");
  });

  it("leaves an ordinary German mobile alone", () => {
    expect(analysePhone("+49 151 12345678", "DE").lineType).toBe("mobile");
  });

  // ── ZA ──
  it("fires the premium rule on a South African 0862 number", () => {
    const r = analysePhone("086 2123 456", "ZA");
    expect(r.lineType).toBe("premium");
    expect(r.spoofingNotes.join(" ")).toContain("0862");
  });

  it("does NOT treat ZA 0860 share-call as premium", () => {
    // The false-positive direction, and the reason 0860/0861 are not in
    // premiumPrefixes: they are billed at local rates and carry the published
    // service lines of real banks. Calling those premium would tell a user
    // their own bank's number is charging them.
    const r = analysePhone("0860 123 456", "ZA");
    expect(r.lineType).toBe("shared_cost");
    expect(r.spoofingNotes.join(" ")).toContain("0860");
  });

  it("recognises South Africa's own emergency numbers", () => {
    // 10111/10177 are NOT in the universal EMERGENCY_NUMBERS set, so these come
    // from the pack. Matched by exact equality, so whole numbers only.
    expect(analysePhone("10111", "ZA").lineType).toBe("emergency");
    expect(analysePhone("10177", "ZA").lineType).toBe("emergency");
  });

  it("leaves an ordinary South African mobile alone", () => {
    expect(analysePhone("+27 82 123 4567", "ZA").lineType).toBe("mobile");
  });

  // ── IN ──
  it("names India's 1800 toll-free range, not the NANP one", () => {
    const r = analysePhone("1800 123 4567", "IN");
    expect(r.lineType).toBe("freecall");
    expect(r.spoofingNotes.join(" ")).toContain("1800");
    expect(r.spoofingNotes.join(" ")).not.toMatch(/\b800 numbers\b/);
  });

  it("recognises India's emergency and cyber-fraud helplines", () => {
    // 1930 is the cyber-fraud helpline — the same role SG's 1799 plays, and the
    // reason it belongs in emergencyNumbers: a short official number that must
    // never score as suspicious.
    expect(analysePhone("100", "IN").lineType).toBe("emergency");
    expect(analysePhone("1930", "IN").lineType).toBe("emergency");
  });

  it("leaves an ordinary Indian mobile alone", () => {
    expect(analysePhone("+91 98765 43210", "IN").lineType).toBe("mobile");
  });

  it("claims no Indian premium range", () => {
    // TRAI allocates no dialable consumer premium-rate level, so the pack
    // authors neither a prefix nor a flag. Pinned so a later author does not
    // add speculative copy — an unreachable flag is the shape this tier forbids.
    const plan = resolveRegionPack("IN").phonePlan;
    expect(plan.premiumPrefixes).toBeUndefined();
    expect(plan.premiumFlag).toBeUndefined();
  });

  // ── JP ──
  it("fires the premium rule on a Japanese 0990 number", () => {
    const r = analysePhone("0990 123456", "JP");
    expect(r.lineType).toBe("premium");
    expect(r.spoofingNotes.join(" ")).toContain("0990");
  });

  it("names Japan's 0120 toll-free range", () => {
    const r = analysePhone("0120 123456", "JP");
    expect(r.lineType).toBe("freecall");
    expect(r.spoofingNotes.join(" ")).toContain("0120");
  });

  it("recognises the Japanese consumer hotline as an emergency number", () => {
    expect(analysePhone("188", "JP").lineType).toBe("emergency");
  });

  it("leaves an ordinary Japanese mobile alone", () => {
    expect(analysePhone("+81 90 1234 5678", "JP").lineType).toBe("mobile");
  });

  it("authors no JP shared-cost flag, because 0570 cannot reach one", () => {
    // A NEGATIVE pin on a real finding. sharedCostFlag is only pushed from the
    // `type === "SHARED_COST"` branch, and libphonenumber classifies JP 0570
    // (Navi Dial) as UAN — which has no branch and falls through to "unknown".
    // Authoring the flag would ship copy no reader can ever see.
    //
    // Both halves are asserted: the classification that makes it unreachable,
    // and the absence of the flag. If a UAN branch is added later, the first
    // assertion fails and this comment is where to look.
    expect(analysePhone("0570 123456", "JP").lineType).toBe("unknown");
    expect(resolveRegionPack("JP").phonePlan.sharedCostFlag).toBeUndefined();
  });

  // ── BR ──
  it("names Brazil's 0800 toll-free and 0300 shared-cost ranges", () => {
    const free = analysePhone("0800 123 4567", "BR");
    expect(free.lineType).toBe("freecall");
    expect(free.spoofingNotes.join(" ")).toContain("0800");
    // 0300 is the case that made the trunk-prefix question explicit: Brazilians
    // dial the 0, but libphonenumber returns "3001234567" without it, and
    // analysePhone prepends one — so "0300" is right for a reason unrelated to
    // how it is dialled. See br.ts.
    const shared = analysePhone("0300 123 4567", "BR");
    expect(shared.lineType).toBe("shared_cost");
    expect(shared.spoofingNotes.join(" ")).toContain("0300");
  });

  it("recognises Brazil's own emergency numbers", () => {
    for (const n of ["190", "192", "193", "180"]) {
      expect({ n, type: analysePhone(n, "BR").lineType }).toEqual({ n, type: "emergency" });
    }
  });

  it("leaves an ordinary Brazilian mobile alone", () => {
    expect(analysePhone("+55 11 91234 5678", "BR").lineType).toBe("mobile");
  });

  it("claims no Brazilian premium range", () => {
    // ANATEL allocates no consumer premium level comparable to DE's 0900.
    const plan = resolveRegionPack("BR").phonePlan;
    expect(plan.premiumPrefixes).toBeUndefined();
    expect(plan.premiumFlag).toBeUndefined();
  });
});

// A KNOWN, DELIBERATE COST of the `minimal` tier, pinned so it stays visible.
//
// A link to a region's REAL government site scores 40/suspicious under a
// `minimal` pack, where the same shape scores 15/safe under `full`. Mechanism,
// isolated by probing rather than inferred: the authority name appears in the
// HOSTNAME ("iras.gov.sg", "gov.br/inss"), which fires authorityMentions; the
// trusted suffix suppresses brand scoring but not the authority flag, and a
// `minimal` pack has no `legitDomains` to counterweight it because the tier
// forbids one. Bare prose naming an agency correctly scores 0.
//
// This is NOT a defect introduced by the 2026-09 wave — SG has behaved this way
// since it shipped. Nor is it every `minimal` pack: probing showed it fires
// only where an authority entry is a substring of the body's own hostname, so
// DE and ZA inherit it and IN, JP and BR do not. See the table below.
// It is recorded here because it is the tier's real false-positive cost and
// nothing else in the repo stated it: the honest summary of `minimal` is
// "positive-side value, at the price of over-flagging the government's own
// domain", not "positive-side value only".
//
// Deliberately not fixed here. The fix is either an allowlist (a tier
// violation — an entry waves a scam through) or suppressing the authority flag
// under a trusted suffix (a base-layer change affecting every region, which
// wants its own probe). Left as a named cost rather than a silent one.
describe("minimal tier: known cost on a region's own government domain", () => {
  it("over-flags a real government link where a full pack does not", () => {
    const minimal = checkSms("Check https://www.iras.gov.sg/taxes for details", undefined, "SG");
    expect(minimal.verdict).toBe("suspicious");
    expect(minimal.flags.some((f) => f.toLowerCase().includes("government agency"))).toBe(true);

    // The contrast that makes it a tier property rather than an engine bug.
    const full = checkSms("Check https://www.gov.uk/hmrc for details", undefined, "GB");
    expect(full.verdict).toBe("safe");
    expect(full.flags.some((f) => f.toLowerCase().includes("government agency"))).toBe(false);
  });

  it("still scores a bare agency name in prose at zero", () => {
    // The guard on the entry above: the cost is specific to the name appearing
    // in a hostname. If this ever starts scoring, the authority layer has gone
    // broad in a way that would light up ordinary conversation.
    expect(checkSms("IRAS says your taxes are due", undefined, "SG").score).toBe(0);
  });

  // Which regions inherit the cost, asserted per pack. Written as a table
  // rather than a blanket claim because probing showed the split is NOT
  // "every minimal pack" — it tracks whether an authority entry happens to be
  // a SUBSTRING of the body's own hostname:
  //
  //   fires:        bsi.bund.de ("bsi"), saps.gov.za ("saps"), iras.gov.sg
  //   does not:     caa.go.jp, cybercrime.gov.in, gov.br
  //
  // So the real driver is short abbreviations in an agency list, and the
  // remedy available to a pack author is to prefer expanded names — which is
  // why DE keeps "bsi" (it is how a German message names the body) but BR
  // dropped "gov.br". Pinned per region so a later change that shifts one
  // region is visible rather than averaged away.
  it.each([
    ["DE", "bsi.bund.de", true],
    ["ZA", "saps.gov.za", true],
    ["IN", "cybercrime.gov.in", false],
    ["JP", "caa.go.jp", false],
    ["BR", "gov.br", false],
  ] as const)("%s on %s: authority flag fires = %s", (code, host, expected) => {
    const r = checkSms(`Check https://www.${host}/page for details`, undefined, code);
    expect({ code, flagged: r.flags.some((f) => f.toLowerCase().includes("government agency")) })
      .toEqual({ code, flagged: expected });
  });
});

describe("minimal packs make no claims they have not verified", () => {
  // Each of these fields either asserts something about a real organisation's
  // policy or waves a URL through. A minimal pack does no research, so it must
  // leave them empty — enforced here rather than left to convention, because
  // the failure mode is fabricating a regulatory claim about a foreign country.
  const MINIMAL_PACKS = supportedRegions().filter(
    (code) => resolveRegionPack(code).coverage === "minimal",
  );

  it("has at least one minimal pack to check", () => {
    // Guards the suite against quietly passing if the tier is ever emptied.
    expect(MINIMAL_PACKS.length).toBeGreaterThan(0);
  });

  it.each(MINIMAL_PACKS)("%s asserts no no-link-sender policy", (code) => {
    // The flag copy states an organisation has publicly committed to never
    // sending links. Asserting that unverified invents a policy.
    expect(resolveRegionPack(code).noLinkSenders).toEqual([]);
  });

  it.each(MINIMAL_PACKS)("%s ships no allowlist", (code) => {
    // legitDomains short-circuits URL scoring to "safe". A wrong entry waves a
    // scam through, so the bar is verified evidence.
    expect(resolveRegionPack(code).legitDomains).toEqual([]);
  });

  it.each(MINIMAL_PACKS)("%s claims no brand knowledge of its own", (code) => {
    // Having NATIONAL brands would make it a partial pack, not a minimal one.
    //
    // Asserted against the global floor rather than against `[]`, because
    // buildPack unions BaseSignals.typosquatBrands into every pack — the names
    // squatted in every market, which are not a claim about this country and
    // are what lets the structural typosquat rules reach it at all. Equality
    // with the base list is the stronger reading of the tier rule: not "has
    // few brands" but "has contributed none".
    const pack = resolveRegionPack(code);
    expect(pack.typosquatBrands.substring).toEqual(BASE_SIGNALS.typosquatBrands);
    expect(pack.typosquatBrands.word).toEqual([]);
    expect(pack.brandMentions.substring).toEqual([]);
    expect(pack.brandMentions.word).toEqual([]);
  });

  it.each(MINIMAL_PACKS)("%s still names where to report", (code) => {
    // The positive half of the bargain: the tier exists to give a victim a
    // local authority instead of a foreign one.
    const pack = resolveRegionPack(code);
    expect(pack.reportingBody).not.toBe("");
    expect(pack.authorityMentions.length).toBeGreaterThan(0);
  });
});
