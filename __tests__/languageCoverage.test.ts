// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// The second coverage axis: can the engine read this region's scam messages,
// as a question separate from how much its pack knows.
//
// What these tests are for, in order of how much they are worth:
//
//   1. The hand-maintained half cannot drift from the packs. `KEYWORD_LANGUAGES`
//      is the one fact the derivation cannot read off the lists, so it is the
//      one place a declaration and the code can disagree — this repo's most
//      expensive recurring defect. Held in BOTH directions, because the
//      registry work measured that a declaration checked one way reads as
//      checked both ways.
//   2. The base subtraction survives a base group that does not exist yet.
//      Driven with a synthetic base rather than the real packs, for the reason
//      the module header gives: on today's data the correct form and a broken
//      one compute the same answer, so a green run here would prove nothing.
//   3. The measured state is pinned, so item 3's gap is a number that fails
//      when it moves rather than a sentence in a document that goes stale.

import { describe, expect, it } from "vitest";
import {
  KEYWORD_LANGUAGES,
  PROSE_FIELDS,
  keywordLanguages,
  languageCoverage,
  resolveRegionPack,
  subtractBase,
  supportedRegions,
  unreadableLanguageShare,
} from "@veriguard/detect/regions";
import type { RegionPack } from "@veriguard/detect/regions";

const packs = () => supportedRegions().map((code) => resolveRegionPack(code));

// The prose fields, named here independently of the module's own list so the
// two have to agree rather than one being read off the other. One test
// asserts they match; the exclusion test below reads the MODULE's list, since
// a list checking itself checks nothing.
//
// Checked against the resolved ZZ pack rather than against BASE_SIGNALS, which
// reaches the subtraction by a different route than the module does: ZZ
// authors no prose of its own, so whatever it holds in these fields IS base's
// contribution to every pack.
const EXPECTED_PROSE_FIELDS = [
  "urgencyWords",
  "rewardWords",
  "requestWords",
  "identityRereg",
  "parcelAddressPhrases",
  "gatedBenefitPhrases",
] as const;

/** What `pack` holds in `field` beyond what base merged into every pack. */
function authoredIn(pack: RegionPack, field: (typeof EXPECTED_PROSE_FIELDS)[number]): readonly string[] {
  return subtractBase(pack[field] ?? [], resolveRegionPack("ZZ")[field] ?? []);
}

describe("the hand-maintained table and the packs agree", () => {
  // The load-bearing direction. A pack that authors prose rules and has no
  // row in KEYWORD_LANGUAGES reports `none` — it would look like a region we
  // cannot read while its lists sit there working, and nothing else says so.
  it("every pack with authored prose rules names the language it is in", () => {
    const authoring = packs().filter((pack) => keywordLanguages(pack).length > 0);
    // Six today: the five English-speaking `full` packs (AU, GB, US, NZ, IE)
    // and CA. An earlier version of this comment said seven and listed IE
    // twice, over a six-element assertion — the list is the fact, the prose
    // was decoration, and review caught the mismatch.
    expect(authoring.map((p) => p.code).sort()).toEqual(["AU", "CA", "GB", "IE", "NZ", "US"]);
  });

  // The "other direction" is NOT tested here, and the obvious way to write it
  // is a tautology worth naming. A test that filters to packs where
  // `keywordLanguages(pack)` is non-empty and then asserts they author prose
  // cannot fail: that function returns `[]` unless `hasProseRules` is true,
  // which is the same expression the assertion recomputes. The guard that
  // lets the body run entails what the body checks, so it passed against the
  // inert-row injection it was written for. Review caught it.
  //
  // The real other direction reads the table raw, which the test below does.

  // THE SAME SET, computed WITHOUT going through keywordLanguages.
  //
  // Both tests above read the answer through that function, which applies two
  // gates — the pack must author prose AND have a row — and that is why each
  // of them alone could be broken without either test noticing. Measured:
  // dropping the base subtraction passed, and adding an inert DE row passed,
  // because whichever gate was left standing still returned `[]`. Injected
  // TOGETHER they fail, which is the classic "every fixture was covered by
  // some other guard too" shape — isolating one guard needs a case the other
  // does not also reject.
  //
  // So this asserts the authoring side on its own, straight off the packs. It
  // fails when the subtraction stops working, whatever the table says, and it
  // is what makes the two tests above about the TABLE rather than about the
  // conjunction of the table and the lists.
  it("exactly six packs author prose rules, computed without the table", () => {
    const authoring = packs()
      .filter((pack) => EXPECTED_PROSE_FIELDS.some((field) => authoredIn(pack, field).length > 0))
      .map((pack) => pack.code)
      .sort();
    expect(authoring).toEqual(["AU", "CA", "GB", "IE", "NZ", "US"]);
  });

  // And the table side on its own, for the same reason in the other
  // direction: a row for a pack that authors nothing is dead weight that the
  // conjunction hides. Named explicitly rather than derived, so adding a row
  // for a region whose lists have not been written fails here.
  it("the table names exactly the packs that author prose, and no others", () => {
    // Read RAW, not through keywordLanguages — that function gates the table
    // behind hasProseRules, so an inert row returns [] and is indistinguishable
    // from no row. Injecting a DE row passed until this read the table itself.
    const rows = Object.keys(KEYWORD_LANGUAGES).sort();
    const authoring = packs()
      .filter((pack) => EXPECTED_PROSE_FIELDS.some((field) => authoredIn(pack, field).length > 0))
      .map((pack) => pack.code)
      .sort();
    expect(rows).toEqual(authoring);
  });

  // A keyword language the region's people do not read is a different kind of
  // wrong — coverage aimed at nobody. Not reachable today, and asserted so it
  // stays that way as packs are added.
  it("every keyword language is one the region actually reads", () => {
    for (const pack of packs()) {
      for (const language of keywordLanguages(pack)) {
        expect(
          pack.languages,
          `${pack.code} authors ${language} rules for a population that does not read it`,
        ).toContain(language);
      }
    }
  });
});

describe("what counts as prose", () => {
  // PROSE_FIELDS is the module's load-bearing judgement, and nothing held it
  // in place: adding `authorityMentions` to it was injected and failed
  // nothing, because every pack that authors agencies ALSO reads a language
  // no other test distinguished. Counting agencies would report Germany as
  // German-readable on the strength of "bundeszentralamt für steuern" — a
  // proper noun, taken from a public registry, by the `minimal` tier's own
  // rules, with no speaker involved. That is the exact overstatement the
  // module exists to prevent, re-entering through the field list.
  //
  // So the rule is asserted where it bites: a field holding proper nouns must
  // not make a pack readable. DE is the case, because every prose-ish list it
  // has is of that kind.
  it("a pack with only proper-noun lists is not readable", () => {
    const de = resolveRegionPack("DE");
    expect(de.authorityMentions.length).toBeGreaterThan(0);
    expect(de.foreignAuthorityMentions.length).toBeGreaterThan(0);
    expect(languageCoverage(de)).toBe("none");
  });

  // The same statement in the form that fails if the field list grows. Named
  // rather than derived from the module, so adding a field there means
  // answering for it here.
  // The test's independent copy and the module's list must agree. Without
  // this, every test above runs against the copy and says nothing about what
  // the module actually subtracts.
  it("the module's field list is the one these tests assume", () => {
    expect([...PROSE_FIELDS].sort()).toEqual([...EXPECTED_PROSE_FIELDS].sort());
  });

  // PROSE_FIELDS is an opt-in list, which is this page's oldest recurring
  // shape: a guard whose scope is opt-in reports a clean sweep of whatever
  // opted in. A new string-array field on RegionPack is simply not considered,
  // and nothing says so — the derivation would keep answering confidently
  // while a prose field it has never heard of sits beside it.
  //
  // Enumerated from the resolved pack rather than from a list, so a new field
  // lands here as a failure and has to be classified as prose or not. The
  // answer is usually "not", and the cost of saying so is one line.
  it("every string-array field on a pack is classified as prose or not", () => {
    const au = resolveRegionPack("AU") as unknown as Record<string, unknown>;
    const arrayFields = Object.keys(au)
      .filter((key) => Array.isArray(au[key]) && (au[key] as unknown[]).every((v) => typeof v === "string"))
      .sort();

    // Prose: a lure's wording lands here. Not prose: proper nouns, hostnames,
    // registry facts, or copy that is never matched against a message.
    const notProse = [
      "authorityMentions",
      "authorityOwnDomains",
      "bankIdentifiers",
      "brandSuffixes",
      "callbackBrands",
      "caseSensitiveAuthorities",
      "cryptoExchanges",
      "fakeInvestmentPlatforms",
      "foreignAuthorityMentions",
      "languages",
      "legitDomains",
      "noLinkSenders",
      "officialSenderNames",
      "shortenerDomains",
      "suspiciousHosting",
      "suspiciousTlds",
      "trustedHostSuffixes",
    ];

    const unclassified = arrayFields.filter(
      (f) => !(PROSE_FIELDS as readonly string[]).includes(f) && !notProse.includes(f),
    );
    expect(
      unclassified,
      "new pack field(s) — decide whether a lure's wording lands there, then add to PROSE_FIELDS or to notProse here",
    ).toEqual([]);
  });

  it("the proper-noun and hostname fields are excluded by name", () => {
    const excluded = [
      "authorityMentions",
      "foreignAuthorityMentions",
      "brandMentions",
      "typosquatBrands",
      "officialSenderNames",
      "legitDomains",
      "trustedHostSuffixes",
      "noLinkSenders",
    ];
    for (const field of excluded) {
      expect(PROSE_FIELDS as readonly string[], `${field} must not count as prose`).not.toContain(
        field,
      );
    }
  });

  // And the positive half: the fields that ARE prose are the ones a lure's
  // wording lands in. BR authors agencies in Portuguese and no urgency words,
  // so it stays `none`; AU authors urgency words and is `covered`. The pair
  // is what separates "wrote something in a language" from "can read a lure
  // written in it".
  it("authoring agencies in a language is not authoring prose in it", () => {
    const br = resolveRegionPack("BR");
    expect(br.languages).toEqual(["pt"]);
    expect(br.authorityMentions.some((a) => /[áâãéêíóôõúç]/.test(a))).toBe(true);
    expect(languageCoverage(br)).toBe("none");
  });
});

describe("the base subtraction", () => {
  it("removes base entries and keeps the region's own", () => {
    expect(subtractBase(["base-a", "base-b", "mine"], ["base-a", "base-b"])).toEqual(["mine"]);
  });

  it("reports nothing authored when a pack adds nothing to base", () => {
    expect(subtractBase(["base-a", "base-b"], ["base-a", "base-b"])).toEqual([]);
  });

  // THE one that is worth having. On the real packs this cannot fail: base
  // fills exactly two urgency groups, so a hardcoded two-group list and the
  // automatic form agree, and swapping them was injected and changed nothing.
  // The defect only exists once base grows a third group, so the third group
  // is supplied here instead of waited for.
  //
  // Expressed as the property rather than as a call: whatever base holds, a
  // pack holding only base entries authors nothing. A subtraction that named
  // its groups by hand would leave the unnamed group's entries behind and
  // report this pack as having authored them.
  it("survives a base group that does not exist yet", () => {
    const base = ["generic-1", "voiceclone-1", "a-third-group-nobody-listed"];
    const packHoldingOnlyBase = [...base];
    expect(subtractBase(packHoldingOnlyBase, base)).toEqual([]);

    const packWithOneOfItsOwn = [...base, "regional"];
    expect(subtractBase(packWithOneOfItsOwn, base)).toEqual(["regional"]);
  });

  // Base merges into every pack, so if the subtraction were skipped entirely
  // every region would read as English-covered. Asserted as a fact about the
  // packs rather than about the function: ZZ authors nothing and must say so.
  it("leaves the base-only pack with no authored prose", () => {
    expect(keywordLanguages(resolveRegionPack("ZZ"))).toEqual([]);
    expect(languageCoverage(resolveRegionPack("ZZ"))).toBe("none");
  });

  // The subtraction works by value identity, so a region authoring a string
  // that base already has is attributed to base and vanishes from what the
  // region is credited with. If that were a pack's ONLY authored prose it
  // would drop to `none` — coverage it has, reported as coverage it lacks.
  //
  // No pack is in that state (checked across all 28 × every prose field), and
  // the collision is an authoring smell in its own right: a duplicate entry
  // is scored twice by rules that add one signal per match, which `regions
  // .test.ts` already treats as a pack invariant for the brand lists. So this
  // fails on the collision rather than on its consequence, which is the
  // earlier and more useful place to catch it.
  it("no pack re-authors a string base already contributes", () => {
    const zz = resolveRegionPack("ZZ");
    for (const pack of packs()) {
      for (const field of PROSE_FIELDS) {
        const seen = new Map<string, number>();
        for (const entry of pack[field] ?? []) seen.set(entry, (seen.get(entry) ?? 0) + 1);
        const collisions = [...seen]
          .filter(([, n]) => n > 1)
          .map(([entry]) => entry)
          .filter((entry) => (zz[field] ?? []).includes(entry));
        expect(
          collisions,
          `${pack.code}.${field} re-authors base entries, so they are credited to base, not to the region`,
        ).toEqual([]);
      }
    }
  });

  // The state the authoring gate exists for, which no real pack is in.
  //
  // Dropping the subtraction was injected and failed nothing, because the
  // gate sits in series with KEYWORD_LANGUAGES and the table decides on
  // today's data: a pack with a row authors lists either way, one without a
  // row returns [] regardless. The gate only bites in the combination a pack
  // reaches by getting its table row written before its lists — the likely
  // ordering, since the row is the five-second half.
  //
  // Built here rather than waited for: a pack holding nothing but base's
  // entries must report no authored prose, so that a row added ahead of the
  // lists scores `none` rather than asserting coverage with nothing behind
  // it. That is the direction this module has to fail in.
  it("a pack holding only base entries has authored nothing", () => {
    const zz = resolveRegionPack("ZZ");
    for (const field of PROSE_FIELDS) {
      const baseOnly = [...(zz[field] ?? [])];
      expect(
        subtractBase(baseOnly, zz[field] ?? []),
        `${field}: a pack with base's entries and none of its own authored something`,
      ).toEqual([]);
    }
  });
});

describe("languageCoverage separates language from depth", () => {
  // The whole point of the axis, stated as the case that motivated it. CA
  // ships `partial` and SG `minimal` — a real difference in pack depth — and
  // SG's own header cites CA's language gap as the reason for its own tier.
  // On language they are not the same, and CA is the stronger of the two:
  // its English half genuinely works.
  it("ranks CA above SG on language, the opposite of what the tier conflated", () => {
    expect(languageCoverage(resolveRegionPack("CA"))).toBe("partial");
    expect(languageCoverage(resolveRegionPack("SG"))).toBe("none");
  });

  // Depth and language are independent, and these two pairs prove it in both
  // directions: NG is `minimal` on depth and reads English; AU is `full` and
  // reads English. Same language population, different depth. DE is `minimal`
  // like NG and scores `none`, because the axis is about the language.
  it("does not track the coverage tier", () => {
    const ng = resolveRegionPack("NG");
    const de = resolveRegionPack("DE");
    expect(ng.coverage).toBe(de.coverage);
    expect(languageCoverage(ng)).toBe("none");
    expect(languageCoverage(de)).toBe("none");

    // And a `full` pack is `covered` for the ordinary reason, not by virtue
    // of its tier.
    expect(languageCoverage(resolveRegionPack("AU"))).toBe("covered");
  });

  // An English-reading population in a pack that authors no English prose
  // rules is `none`, not `covered`. This is the result most likely to look
  // like a bug and is correct: NG declares English and gets base rules only,
  // exactly as DE does. The tier says `minimal` and the language axis agrees
  // for a reason the tier could not express.
  it("does not credit a region for base's English lists", () => {
    const ng = resolveRegionPack("NG");
    expect(ng.languages).toContain("en");
    expect(languageCoverage(ng)).toBe("none");
  });

  it("is covered only when every declared language has rules", () => {
    for (const pack of packs()) {
      const authored = new Set(keywordLanguages(pack));
      const covered = pack.languages.every((l) => authored.has(l)) && authored.size > 0;
      expect(languageCoverage(pack) === "covered").toBe(covered);
    }
  });
});

describe("the measured gap", () => {
  // Item 3's number, pinned. A probe result is a measurement with a date, and
  // this page's own record is that written-down measurements go stale and get
  // re-asserted as facts. This one fails when it moves, in either direction.
  //
  // 31 of 37 language-region pairs have no prose rules: every language of
  // every pack except English in the six that author English lists. It should
  // only ever go DOWN, and when it does the reviewer who made that possible
  // is the thing worth recording.
  it("31 of 37 language-region pairs have no prose rules", () => {
    expect(unreadableLanguageShare(packs())).toEqual({ unreadable: 31, total: 37 });
  });

  // The per-pack distribution, pinned because the module's header states it
  // in prose and the first version of that sentence was wrong (it said 21 of
  // 28; the answer is 22). A count asserted in a comment is a count that
  // drifts, which is this repo's whole argument for deriving things.
  it("22 of the 28 packs score none, 5 covered, 1 partial", () => {
    const tally = { covered: 0, partial: 0, none: 0 };
    for (const pack of packs()) tally[languageCoverage(pack)] += 1;
    expect(tally).toEqual({ covered: 5, partial: 1, none: 22 });
    expect(packs()).toHaveLength(28);
  });

  // The non-English half, stated separately because it is the claim item 3
  // actually makes: the engine has no prose opinion outside English anywhere.
  it("no non-English language has prose rules in any pack", () => {
    const nonEnglish = packs().flatMap((pack) => {
      const authored = new Set(keywordLanguages(pack));
      return pack.languages
        .filter((l) => l !== "en" && authored.has(l))
        .map((l) => `${pack.code}/${l}`);
    });
    expect(nonEnglish).toEqual([]);
  });
});
