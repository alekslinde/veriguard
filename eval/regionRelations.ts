// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Metamorphic relations over the REGION axis.
//
// metamorphic.ts transforms content and holds the region fixed: "does rewriting
// this message talk the engine out of its verdict?". This file does the
// opposite — it holds the content fixed and varies the region pack, asking "is
// the engine consistent about WHERE it is looking from?".
//
// The two need separating because they fail differently. A content transform
// finds evasion. A region transform finds *pack leakage*: a signal that should
// be universal authored into one pack, or a pack claiming territory it does not
// own. That is the defect class the region programme has actually produced —
// four data-only packs, three defects, two of them in already-shipped packs —
// and no content transform can see it, because content transforms never change
// the pack.
//
// It matters more now than it did. A `minimal` pack is cheap enough to add in
// bulk, and item 4 of the roadmap proposes exactly that; the base layer is
// where breadth actually comes from, and a base edit changes every region at
// once while the corpus measures six countries. These relations are what make
// that safe to do quickly.
//
// As with the content relations: a violation is not proof the original verdict
// was right. These police consistency, not accuracy.

import { scoreContent, type Scored } from "./runner";
import type { EvalCase, SuspiciousPolicy } from "./schema";
import { supportedRegions, resolveRegionPack, type RegionCode } from "@veriguard/detect/regions";

/** Verdict severity, ordered. Same scale the content runner compares on. */
const RANK: Record<string, number> = { safe: 0, unknown: 1, suspicious: 2, likely_scam: 3 };

export type RegionRelationId = "region-invariance" | "coverage-monotonicity";

export interface RegionViolation {
  relation: RegionRelationId;
  caseId: string;
  /** One line on what the disagreement means, printed in the report. */
  explanation: string;
  baseRegion: RegionCode;
  otherRegion: RegionCode;
  base: Scored;
  other: Scored;
  content: string;
}

export interface RegionRelationResult {
  violations: RegionViolation[];
  applied: Map<RegionRelationId, number>;
  skipped: Map<RegionRelationId, number>;
}

/**
 * Content carrying no national signal, used for the invariance relation.
 *
 * Hand-written rather than drawn from the corpus, and that is the point: every
 * corpus case is a case precisely because it carries region-specific signal, so
 * scoring one under a foreign pack SHOULD differ. These strings are the
 * opposite — universal scam scripts and universal benign messages, with no
 * agency, brand, currency, phone number or national TLD anywhere in them.
 *
 * A string here that turns out to carry a national signal will show up as a
 * violation naming the region that disagreed, which is a finding about the
 * fixture as much as about the engine. Keep them boring.
 */
const REGION_NEUTRAL: { id: string; content: string }[] = [
  { id: "neutral-benign-coffee", content: "Hey, are we still on for coffee tomorrow morning?" },
  { id: "neutral-benign-meeting", content: "Moved the meeting to 3pm, does that still work for you?" },
  { id: "neutral-shortener", content: "You have a package waiting, see http://bit.ly/3xQz9Lm" },
  { id: "neutral-abused-tld", content: "Your account is locked. Verify now at http://secure-login-verify.cyou/auth" },
  { id: "neutral-credential-ask", content: "Please confirm your password and card number to continue." },
  { id: "neutral-remote-access", content: "Install AnyDesk so our technician can fix your computer remotely." },
  { id: "neutral-wallet", content: "Connect wallet and approve transaction to unlock your funds." },
  { id: "neutral-recovery", content: "We are a fund recovery specialist and can recover your lost funds." },
];

/**
 * REGION INVARIANCE — content with no national signal must score the same
 * everywhere.
 *
 * The verdict may legitimately differ in ONE direction only: coverage. A pack
 * short of `full` downgrades a clean result to `unknown`, so `safe` under AU
 * and `unknown` under a `minimal` pack is the gate working, not a violation.
 * Anything else — a different verdict on identical universal content — means a
 * signal that should live in base.ts has been authored into a pack, or a pack
 * is matching text that has nothing to do with it.
 *
 * Compared against AU rather than pairwise across all regions: AU is the
 * reference pack, the comparison is transitive enough for the defect this
 * catches, and pairwise would produce O(n²) near-duplicate violations for one
 * underlying cause.
 */
async function checkInvariance(
  suspiciousAs: SuspiciousPolicy,
  out: RegionViolation[],
  applied: Map<RegionRelationId, number>,
): Promise<void> {
  const regions = supportedRegions();
  const bump = () => applied.set("region-invariance", (applied.get("region-invariance") ?? 0) + 1);

  for (const sample of REGION_NEUTRAL) {
    const base = await scoreContent(sample.content, "AU", suspiciousAs);

    for (const region of regions) {
      if (region === "AU") continue;
      const other = await scoreContent(sample.content, region, suspiciousAs);
      bump();

      // The one legitimate difference: the coverage gate turning a clean
      // verdict into an abstention. Nothing else is excused.
      //
      // The score must be IDENTICAL for that excuse to apply. Checking only the
      // verdicts would let a real leak hide under the gate: a pack scoring 15
      // on region-neutral content still reads as `unknown` beside AU's `safe`,
      // because 15 is below the 20-point threshold, and the difference would be
      // filed as the gate working. It is not — it is a national signal firing
      // on text with no national content, one edit away from crossing the
      // threshold. Verified by injection: an authorityMentions leak scores 0
      // and moves nothing, while an urgency-group leak scores 20 and flips the
      // verdict, and only the score separates them before that point.
      const gateExplains =
        base.verdict === "safe" &&
        other.verdict === "unknown" &&
        other.score === base.score &&
        resolveRegionPack(region).coverage !== "full";
      if (gateExplains) continue;

      // Same verdict AND same score is the ordinary passing case.
      if (other.verdict === base.verdict && other.score === base.score) continue;

      // A score difference under an unchanged verdict is still a leak, and the
      // explanation has to say so rather than printing "scored X but X".
      const disagreement =
        other.verdict === base.verdict
          ? `scored the same verdict (${base.verdict}) but ${base.score} under AU versus ${other.score} under ${region}`
          : `scored ${base.verdict} under AU but ${other.verdict} under ${region}`;

      out.push({
        relation: "region-invariance",
        caseId: sample.id,
        explanation:
          `Region-neutral content ${disagreement}. ` +
          `Either a universal signal has been authored into one pack instead of base.ts, or ${region} ` +
          `matches text that carries no national signal.`,
        baseRegion: "AU",
        otherRegion: region,
        base,
        other,
        content: sample.content,
      });
    }
  }
}

/**
 * COVERAGE MONOTONICITY — a national layer may only ADD signal.
 *
 * For any content, a region with a pack must never score WEAKER than the
 * base-only `ZZ` fallback. Every pack is base plus a national layer, so a lower
 * verdict under a covered region means the national layer actively suppressed a
 * base signal — an over-broad `legitDomains` entry, a `trustedHostSuffixes`
 * exemption on an open registry, an allowlist swallowing a real detection.
 *
 * That is the highest-severity defect the region programme can produce, because
 * it fails toward the false negative that reaches a user as a clean bill of
 * health. It is also invisible to the corpus unless someone happened to write a
 * case for that exact domain under that exact region.
 *
 * `unknown` is excluded from the comparison rather than ranked. Under ZZ a
 * clean result is `unknown` by the coverage gate, and under a `full` pack the
 * same content is `safe` — which reads as a rank DROP (1 → 0) while being
 * exactly correct. Comparing only where both sides made a positive assertion
 * keeps the relation about suppression rather than about the gate.
 */
async function checkMonotonicity(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
  out: RegionViolation[],
  applied: Map<RegionRelationId, number>,
  skipped: Map<RegionRelationId, number>,
): Promise<void> {
  const bump = (m: Map<RegionRelationId, number>) =>
    m.set("coverage-monotonicity", (m.get("coverage-monotonicity") ?? 0) + 1);

  for (const c of cases) {
    const covered = await scoreContent(c.content, c.region, suspiciousAs);
    const fallback = await scoreContent(c.content, "ZZ", suspiciousAs);

    // Only compare positive assertions — see the note above on `unknown`.
    if (covered.verdict === "unknown" || fallback.verdict === "unknown") {
      bump(skipped);
      continue;
    }
    bump(applied);

    if ((RANK[covered.verdict] ?? 0) >= (RANK[fallback.verdict] ?? 0)) continue;

    out.push({
      relation: "coverage-monotonicity",
      caseId: c.id,
      explanation:
        `${c.region} scored ${covered.verdict} where the base-only ZZ pack scored ${fallback.verdict}. ` +
        `A national layer may only add signal, so the ${c.region} pack is suppressing a base detection — ` +
        `check legitDomains and trustedHostSuffixes for an entry that swallows this.`,
      baseRegion: "ZZ",
      otherRegion: c.region,
      base: fallback,
      other: covered,
      content: c.content,
    });
  }
}

/**
 * Brand-on-open-suffix probes — the "did the national layer contribute anything"
 * relation.
 *
 * The corpus cannot carry these. A region-neutral fixture cannot mention a
 * national suffix by definition, and the corpus has no `.co.uk` case at all —
 * which is exactly how an over-broad `trustedHostSuffixes` entry survives a
 * green run. This defect has shipped once already, so it gets a dedicated probe
 * rather than relying on someone remembering to write a case.
 *
 * Each probe is a BARE phishing host on a suffix the local registry sells to
 * anyone, with no surrounding message. The bareness is the whole design, and it
 * was arrived at by injection: with an ordinary scam sentence around it, an
 * exempted `.co.uk` still scored 77 under GB against 27 under ZZ, because the
 * authority mention and tax urgency more than covered the missing brand signal
 * — the suppression was real and completely invisible. Stripped to the host
 * alone, the same defect scores 25 under GB and 25 under ZZ: identical, because
 * the national layer contributed exactly nothing.
 *
 * So the assertion is not "the pack outranks ZZ" but "the pack IMPROVES on ZZ".
 * A region that recognises its own brand on an open suffix must score strictly
 * higher than a pack with no brand knowledge at all. Equality means the brand
 * signal was suppressed, which is the defect.
 *
 * A pack may only exempt eligibility-restricted suffixes: `.gov.uk` is
 * restricted to public bodies, `.co.uk` is sold over the counter.
 */
const OPEN_SUFFIX_PROBES: { id: string; region: RegionCode; content: string }[] = [
  { id: "probe-gb-couk", region: "GB", content: "http://hmrc-refund-verify.co.uk/claim" },
  { id: "probe-gb-orguk", region: "GB", content: "http://dvla-vehicle-update.org.uk/pay" },
  { id: "probe-au-comau", region: "AU", content: "http://auspost-redelivery-fee.com.au/pay" },
  { id: "probe-ca-ca", region: "CA", content: "http://cra-refund-secure.ca/login" },
  { id: "probe-nz-conz", region: "NZ", content: "http://nzpost-redelivery.co.nz/pay" },
];

/**
 * The open-suffix half of monotonicity. Its own loop because these probes carry
 * their own region rather than coming from the corpus, and because the
 * assertion is on SCORE rather than verdict — see the note above.
 */
async function checkOpenSuffixes(
  suspiciousAs: SuspiciousPolicy,
  out: RegionViolation[],
  applied: Map<RegionRelationId, number>,
): Promise<void> {
  const bump = () =>
    applied.set("coverage-monotonicity", (applied.get("coverage-monotonicity") ?? 0) + 1);

  for (const probe of OPEN_SUFFIX_PROBES) {
    const covered = await scoreContent(probe.content, probe.region, suspiciousAs);
    const fallback = await scoreContent(probe.content, "ZZ", suspiciousAs);
    bump();

    // Strictly greater: equality is the failure being hunted, not a pass.
    if (covered.score > fallback.score) continue;

    out.push({
      relation: "coverage-monotonicity",
      caseId: probe.id,
      explanation:
        `A phishing host carrying a ${probe.region} brand on an OPEN ${probe.region} suffix scored ` +
        `${covered.score} under ${probe.region} and ${fallback.score} under base-only ZZ — the national ` +
        `layer added nothing. The pack is exempting a suffix its registry sells to anyone: check ` +
        `trustedHostSuffixes and legitDomains. Only eligibility-restricted suffixes may be exempted.`,
      baseRegion: "ZZ",
      otherRegion: probe.region,
      base: fallback,
      other: covered,
      content: probe.content,
    });
  }
}

export async function runRegionRelations(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
  only?: string[],
): Promise<RegionRelationResult> {
  const violations: RegionViolation[] = [];
  const applied = new Map<RegionRelationId, number>();
  const skipped = new Map<RegionRelationId, number>();

  const wants = (id: RegionRelationId) => !only?.length || only.includes(id);

  if (wants("region-invariance")) {
    await checkInvariance(suspiciousAs, violations, applied);
  }
  if (wants("coverage-monotonicity")) {
    await checkMonotonicity(cases, suspiciousAs, violations, applied, skipped);
    await checkOpenSuffixes(suspiciousAs, violations, applied);
  }

  return { violations, applied, skipped };
}

// ── Reporting ────────────────────────────────────────────────────────────────

const RELATIONS: RegionRelationId[] = ["region-invariance", "coverage-monotonicity"];

export function formatRegionSummary(r: RegionRelationResult): string {
  const byRelation = new Map<string, number>();
  for (const v of r.violations) byRelation.set(v.relation, (byRelation.get(v.relation) ?? 0) + 1);

  const lines = ["", "Region relation           Checks  Violations", "─".repeat(66)];

  for (const id of RELATIONS) {
    const ran = r.applied.get(id) ?? 0;
    const bad = byRelation.get(id) ?? 0;
    // Same rule as the content summary: never print an untested relation as a
    // clean zero, which would read as evidence it holds.
    const mark = ran === 0 ? "  (never applied)" : bad > 0 ? "  ←" : "";
    lines.push(`${id.padEnd(25)} ${String(ran).padStart(6)}  ${String(bad).padStart(10)}${mark}`);
  }

  lines.push("─".repeat(66));
  return lines.join("\n");
}

/** Full detail for each violation — what disagreed, and what to go and look at. */
export function formatRegionViolations(r: RegionRelationResult): string {
  if (r.violations.length === 0) return "\nNo region-relation violations.";

  const clip = (s: string, n = 88) => {
    const flat = s.replace(/\n/g, "\\n");
    return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
  };

  const lines = ["", `${r.violations.length} region-relation violation(s)`, "─".repeat(66)];
  for (const v of r.violations) {
    lines.push(`[${v.relation}] ${v.caseId}`);
    lines.push(`  ${v.explanation}`);
    lines.push(`  ${v.baseRegion}: ${v.base.verdict} (${v.base.score})  →  ${v.otherRegion}: ${v.other.verdict} (${v.other.score})`);
    lines.push(`  content: ${clip(v.content)}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Exported for the harness test, so the fixtures cannot silently empty out. */
export { REGION_NEUTRAL, OPEN_SUFFIX_PROBES };
