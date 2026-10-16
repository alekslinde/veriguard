// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Whether the engine can read a region's scam messages, as a fact separate from
// how much that region's pack knows.
//
// ## Why this is not a field on RegionCoverage
//
// `RegionCoverage` answers one question with one word, and it is really two
// questions. CA sits at `partial` and SG at `minimal` "partly for language
// reasons" — but those two packs have the SAME language gap and different
// tiers, because the tier is dominated by the other axis. CA has brands, a
// number plan and agencies and lacks French keywords; SG has agencies and no
// brand knowledge at all. Ranked on depth, CA is correctly the stronger pack.
// Ranked on language, they are identical: both serve a population reading
// messages in a language no list here covers.
//
// SG's own header states the language reason and then cites it as "precisely
// the gap that holds CA at `partial`" — one sentence naming two different
// tiers for one gap. That is the conflation, written down in the pack that
// documents the tier.
//
// So depth stays on `coverage` and language moves here. Two axes, each
// answerable on its own evidence, neither standing in for the other.
//
// ## Why it is derived and not declared
//
// A second hand-maintained field would restate what the pack already shows,
// and this repo's most expensive recurring defect is a fact declared in one
// place and decided in another. A pack that adds a French urgency list would
// have to remember to change its tier too, and nothing would fail if it did
// not. Derived, the lists ARE the declaration: author French keywords and the
// answer moves by itself.
//
// The one thing a derivation cannot see is which language a list is written
// in, so that is what `keywordLanguages` states — per pack, next to the lists
// it describes, and checked against them rather than trusted.

import { BASE_SIGNALS } from "./base";
import type { LanguageCode, RegionCode, RegionPack } from "./types";

/**
 * How much of a region's reading population the engine's prose rules cover.
 *
 *   covered — every language the region declares has authored keyword lists
 *   partial — some do, some do not (CA: English yes, French no)
 *   none    — no language the region reads has lists, so the prose rules are
 *             silent and only the language-independent signals apply
 *
 * **`none` is not the same as a `none` coverage tier.** A pack can know its
 * agencies, its number plan and its registry-gated suffixes — real, useful,
 * positive knowledge — and still score zero on a message written in the local
 * language, because none of that knowledge is prose matching. That combination
 * is the common case here — **22 of the 28 packs** — and it had no way to be
 * said. That count is pinned by test, because the first version of this
 * sentence said 21 and nothing would have failed if it stayed wrong.
 */
export type LanguageCoverage = "covered" | "partial" | "none";

/**
 * The fields whose entries are matched against a message's prose, and so are
 * written in a language.
 *
 * This list is the load-bearing judgement in the module, so the rule for
 * membership is narrow and stated rather than left to inspection: a field
 * belongs here when its entries are **ordinary words or phrases chosen for how
 * a lure is worded**. A field whose entries are proper nouns does not, even
 * where those nouns are non-English.
 *
 * That distinction is the `minimal` tier's own rule and the reason BR, DE, ES
 * and FR carry accented entries while still reading as language-uncovered:
 * `authorityMentions` holds "polícia federal" and "bundeszentralamt für
 * steuern", which are *names*, verifiable from a public registry by someone
 * who does not speak the language. Counting them as language coverage would
 * report Germany as readable on the strength of a list its tier rules
 * explicitly allow without a speaker — the overstatement this whole module
 * exists to stop, re-entering through the back door.
 *
 * `brandMentions` and `typosquatBrands` are excluded for the same reason, and
 * `legitDomains` / `trustedHostSuffixes` because a hostname is not prose at
 * all.
 */
export const PROSE_FIELDS = [
  "urgencyWords",
  "rewardWords",
  "requestWords",
  "identityRereg",
  "parcelAddressPhrases",
  "gatedBenefitPhrases",
] as const;

type ProseField = (typeof PROSE_FIELDS)[number];

/**
 * Base's own contribution to each prose field.
 *
 * Read from `BASE_SIGNALS` rather than from a resolved `ZZ` pack, although the
 * two are equal today and `ZZ` reads more obviously as "base and nothing
 * else". The reason is the import graph: `resolveRegionPack` lives in
 * `index.ts`, which imports every pack, so reaching it from here would put
 * this module in a cycle with the thing it describes. The engine declined that
 * same trade once before, for the pack-entry matcher, and the answer was the
 * same — take the dependency that does not close the loop.
 *
 * What this must NOT become is a hand-listed set of base group names.
 * `buildPack` merges `urgency.generic` and `urgency.voiceClone` into every
 * pack, so all 28 arrive holding English prose they did not author; naming
 * those two groups would stop subtracting correctly the moment a third was
 * added, and the derivation would then report a clean sweep — the "partial
 * check reporting a clean sweep" shape this repo has paid for four times.
 * Taking `Object.values` of the whole urgency object keeps it automatic: a new
 * base group is subtracted because it is in the object, not because someone
 * remembered it.
 *
 * **That property is not observable from the packs as they stand, and saying
 * so is the point.** `BASE_SIGNALS.urgency` holds exactly `generic` and
 * `voiceClone` today, so the automatic form and a hardcoded two-group list
 * compute the identical set — swapping one for the other was injected and
 * changed no answer and failed no test, because there is no third group for
 * them to disagree about. The difference is entirely about the group that does
 * not exist yet, which no fixture built from real packs can reach. So
 * `subtractBase` is exported and the test supplies the third group itself,
 * rather than a green run on today's data being read as the property holding.
 */
const BASE_PROSE: Record<ProseField, readonly string[]> = {
  urgencyWords: Object.values(BASE_SIGNALS.urgency).flat(),
  rewardWords: BASE_SIGNALS.rewardWords,
  requestWords: BASE_SIGNALS.requestWords,
  // Base authors none of these three; every entry is some region's own. Stated
  // rather than omitted so the record is total over `ProseField` — a field
  // added to that list fails to compile until its base side is answered here.
  identityRereg: [],
  parcelAddressPhrases: [],
  gatedBenefitPhrases: [],
};

/**
 * What is left of `merged` once `base`'s entries are taken out.
 *
 * The subtraction is the whole subtlety: asked naively, every pack holds
 * English prose and the derivation reports total coverage. What is wanted is
 * what the REGION authored, so base's entries come out by identity.
 *
 * Exported, and takes both sides as arguments, so the property above can be
 * tested with a base set the packs do not currently produce. Reading it off
 * `BASE_SIGNALS` inside would make the function untestable in exactly the
 * dimension that matters.
 *
 * **Identity, which has one consequence worth stating.** A region authoring a
 * string base already carries has it attributed to base and loses the credit;
 * were that a pack's only authored prose, the pack would read `none` while
 * genuinely having a rule. No pack is in that state, and the collision is an
 * authoring fault anyway — the merged list is not deduplicated, so a
 * duplicate scores twice in rules that add one signal per match. A test fails
 * on the collision rather than on this function's reaction to it, which
 * catches it a step earlier and for the more serious reason.
 */
export function subtractBase(
  merged: readonly string[],
  base: readonly string[],
): readonly string[] {
  const exclude = new Set(base);
  return merged.filter((entry) => !exclude.has(entry));
}

/** Entries a pack contributes to one prose field beyond what base merged in. */
function regionAuthored(pack: RegionPack, field: ProseField): readonly string[] {
  return subtractBase(pack[field] ?? [], BASE_PROSE[field]);
}

/**
 * Whether this pack authored any prose rules of its own.
 *
 * Deliberately a boolean over all the prose fields rather than per field: a
 * region that authors tax lures but no parcel lures is not "partially
 * readable", it is readable with gaps like every other region including AU.
 * The question this module answers is whether the engine has ANY purchase on
 * prose in a language, not how complete that purchase is — the second question
 * needs a speaker, which is item 3's step 3 and is blocked on a person.
 *
 * **This gate changes no answer today, and that is worth stating rather than
 * leaving to be rediscovered.** It sits in series with `KEYWORD_LANGUAGES`,
 * and the table is what actually decides: a pack with a row authors lists
 * either way, and a pack without one returns `[]` whatever this says.
 * Dropping the subtraction underneath it was injected and failed nothing for
 * exactly that reason — not because the tests were thin, but because the two
 * gates are redundant on the current data.
 *
 * It is kept because the redundancy is the point of it. The failure it
 * guards is a pack getting a row before its lists are written — a plausible
 * ordering, since authoring the table entry is the five-second half — and in
 * that state the table alone would report a language as readable with nothing
 * behind it. The gate makes that combination score `none` instead of
 * asserting coverage that does not exist, which is the direction this whole
 * module is built to fail in. A test drives the subtraction directly for the
 * same reason.
 */
function hasProseRules(pack: RegionPack): boolean {
  return PROSE_FIELDS.some((field) => regionAuthored(pack, field).length > 0);
}

/**
 * The languages a pack's authored prose rules are written in.
 *
 * The one fact a derivation cannot read off the lists, and so the one thing
 * stated by hand — but stated ONCE, centrally, against a rule a test enforces:
 * a pack appears here when and only when it authors prose rules. A pack that
 * authors lists and has no entry fails, and an entry for a pack with no lists
 * fails. That is what stops this becoming the drifting second declaration the
 * module rejected a per-pack field for being.
 *
 * Every entry is `["en"]` today, and that is the finding rather than an
 * oversight: the six packs that author prose rules are the five
 * English-speaking ones plus CA, whose French half is the gap item 3 is about.
 *
 * **Exported raw, not only through `keywordLanguages`.** That function gates
 * the table behind `hasProseRules`, so a row for a pack that authors nothing
 * returns `[]` and reads exactly like no row at all — and a test asking only
 * through the function cannot tell an inert row from an absent one. Injecting
 * a `DE` row here passed every test until this was exported. Two gates in
 * series mask each other; the table has to be observable on its own.
 */
export const KEYWORD_LANGUAGES: Partial<Record<RegionCode, readonly LanguageCode[]>> = {
  AU: ["en"],
  GB: ["en"],
  US: ["en"],
  NZ: ["en"],
  IE: ["en"],
  // English only, against an officially bilingual population. This single
  // entry is the measured form of item 3's whole argument: CA's French
  // speakers get the language-independent signals and nothing else.
  CA: ["en"],
};

/**
 * Which languages a pack's prose rules are authored in, or none.
 *
 * The table AND the authoring gate, so a row with no lists behind it answers
 * the same as no row. That conjunction is why `KEYWORD_LANGUAGES` is also
 * exported raw: a test asking only through here cannot see which of the two
 * returned the empty array, and both were separately breakable while this was
 * the only way in.
 */
export function keywordLanguages(pack: RegionPack): readonly LanguageCode[] {
  if (!hasProseRules(pack)) return [];
  return KEYWORD_LANGUAGES[pack.code] ?? [];
}

/**
 * Whether the engine's prose rules reach the languages this region reads.
 *
 * Answered against `pack.languages` — the languages the population reads, not
 * the ones the pack happens to cover — so the gap is measured against the
 * people rather than against our own effort. A region declaring one language
 * we cover is `covered`; CA, declaring two and covering one, is `partial`;
 * everything else is `none`.
 */
export function languageCoverage(pack: RegionPack): LanguageCoverage {
  const authored = new Set(keywordLanguages(pack));
  if (authored.size === 0) return "none";

  const read = pack.languages;
  if (read.length === 0) return "none";

  const hit = read.filter((language) => authored.has(language)).length;
  if (hit === 0) return "none";
  return hit === read.length ? "covered" : "partial";
}

/**
 * The share of declared languages with no prose rules, as a fraction.
 *
 * Item 3's metric is "share of non-English scam text scoring above `unknown`",
 * which needs a corpus in those languages and so cannot be computed here. This
 * is the measurable proxy the derivation does support: of every
 * language-region pair the packs claim to serve, how many the prose rules
 * cannot read. Reported rather than gated — nothing should fail because a
 * language is unauthored, since authoring one needs a reviewer.
 */
export function unreadableLanguageShare(
  packs: readonly RegionPack[],
): { unreadable: number; total: number } {
  let unreadable = 0;
  let total = 0;
  for (const pack of packs) {
    const authored = new Set(keywordLanguages(pack));
    for (const language of pack.languages) {
      total += 1;
      if (!authored.has(language)) unreadable += 1;
    }
  }
  return { unreadable, total };
}
