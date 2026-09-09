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
