import { describe, it, expect } from "vitest";
import { checkSms, checkUrl, mentions } from "@veriguard/engine/scamDetector";
import { resolveRegionPack, supportedRegions, DEFAULT_REGION, FALLBACK_REGION } from "@veriguard/engine/regions";
import { BASE_SIGNALS, CHINESE_AUTHORITY_MENTIONS } from "@veriguard/engine/regions/base";
import { AU } from "@veriguard/engine/regions/au";
import { GB } from "@veriguard/engine/regions/gb";
import { US } from "@veriguard/engine/regions/us";
import { NZ } from "@veriguard/engine/regions/nz";
import { CA } from "@veriguard/engine/regions/ca";
import { IE } from "@veriguard/engine/regions/ie";
import { SG } from "@veriguard/engine/regions/sg";
import { DE } from "@veriguard/engine/regions/de";
import { ZA } from "@veriguard/engine/regions/za";
import { IN } from "@veriguard/engine/regions/in";
import { JP } from "@veriguard/engine/regions/jp";
import { BR } from "@veriguard/engine/regions/br";
import { REST_OF_WORLD } from "@veriguard/engine/regions/rest-of-world";
import { findKeyboardTypo } from "@veriguard/engine/keyboardAdjacency";
import type { RegionCode, RegionDefinition } from "@veriguard/engine/regions/types";

/**
 * The national layers, keyed by code — what a pack AUTHOR wrote, before
 * buildPack merges base into it. Needed by the base/national disjointness
 * invariant, which is a statement about the authored list and is invisible in
 * the resolved pack (where the two layers are already unioned).
 */
const REGION_DEFINITIONS: Record<RegionCode, RegionDefinition> = {
  AU, GB, US, NZ, CA, IE, SG, DE, ZA, IN, JP, BR, ZZ: REST_OF_WORLD,
};

/**
 * Every suffix any pack claims in `brandSuffixes`, as a set.
 *
 * Fixtures below need namespaces NO pack claims, and hand-picking them expires
 * the moment a pack ships on that country — which is exactly what happened:
 * `paypal.gov.br` and `amazon.ac.jp` were chosen because nothing claimed
 * `gov.br` or `ac.jp`, and both stopped testing the rule the day the BR and JP
 * packs shipped. Derived here so a stale fixture fails as a *fixture* problem
 * with a named cause, rather than reading as a detection regression.
 */
const CLAIMED_BRAND_SUFFIXES = new Set(
  supportedRegions().flatMap((code) => resolveRegionPack(code).brandSuffixes),
);

describe("resolveRegionPack", () => {
  it("resolves a known region", () => {
    const pack = resolveRegionPack("AU");
    expect(pack.code).toBe("AU");
    expect(pack.name).toBe("Australia");
    expect(pack.coverage).toBe("full");
  });

  it("is case-insensitive", () => {
    expect(resolveRegionPack("au").code).toBe("AU");
  });

  // An unknown region must degrade to a working checker, never break the check.
  it.each([undefined, null, "", "QQ", "not-a-region"])(
    "falls back to the default region for %p",
    (input) => {
      expect(resolveRegionPack(input).code).toBe(DEFAULT_REGION);
    },
  );

  it("returns a stable memoised instance", () => {
    expect(resolveRegionPack("AU")).toBe(resolveRegionPack("AU"));
  });

  it("lists every region that has a pack", () => {
    expect(supportedRegions()).toContain(DEFAULT_REGION);
    expect(supportedRegions()).toContain(FALLBACK_REGION);
  });

  it("resolves the base-only fallback pack", () => {
    const pack = resolveRegionPack(FALLBACK_REGION);
    expect(pack.code).toBe(FALLBACK_REGION);
    expect(pack.coverage).toBe("none");
    // Universal signals still run — real detections must still fire.
    expect(pack.suspiciousTlds.length).toBeGreaterThan(0);
    expect(pack.requestWords.length).toBeGreaterThan(0);
    // But there is no national layer to lean on.
    expect(pack.authorityMentions).toEqual([]);
    expect(pack.legitDomains).toEqual([]);
  });
});

describe("pack composition", () => {
  const pack = resolveRegionPack("AU");

  it("inherits universal signals from base", () => {
    expect(pack.rewardWords).toEqual(expect.arrayContaining(BASE_SIGNALS.rewardWords));
    expect(pack.requestWords).toEqual(expect.arrayContaining(BASE_SIGNALS.requestWords));
    expect(pack.callbackBrands).toEqual(expect.arrayContaining(BASE_SIGNALS.callbackBrands));
    expect(pack.suspiciousTlds).toBe(BASE_SIGNALS.suspiciousTlds);
  });

  it("layers region signals on top of base", () => {
    // AU-specific identifiers that have no meaning in other markets.
    expect(pack.requestWords).toEqual(expect.arrayContaining(["tax file number", "bsb", "smsf"]));
    expect(pack.rewardWords).toContain("verified by asic");
    expect(pack.callbackBrands).toEqual(expect.arrayContaining(["coinspot", "swyftx"]));
  });

  it("flattens every urgency group into urgencyWords", () => {
    for (const group of Object.values(pack.urgency)) {
      expect(pack.urgencyWords).toEqual(expect.arrayContaining(group));
    }
  });

  it("keeps the flat urgency union free of duplicates", () => {
    // A phrase in two groups would score twice for one match.
    expect(new Set(pack.urgencyWords).size).toBe(pack.urgencyWords.length);
  });
});

// Invariants that must hold for every pack, present and future. These come from
// code-review findings on the GB pack — each was a real defect, and each is the
// kind that reappears the next time someone authors a region.
describe("pack invariants (every region)", () => {
  const packs = supportedRegions().map((code) => [code, resolveRegionPack(code)] as const);

  // A phrase that another entry can match inside scores twice for one match.
  // The overlap is invisible in the flag text (both phrases are listed, which
  // reads as two findings) but doubles the score.
  //
  // Overlap is tested the way mentions() actually matches (#233): a single
  // token only shadows on word boundaries, so "mygov" no longer reaches inside
  // "mygovid" and both can be listed. A multi-word phrase still matches as a
  // substring, so "bank details" inside "updated bank details" would still
  // double-score and is still forbidden.
  // The engine's own matcher — a hand-copied rule here would let the invariant
  // drift from what actually double-scores.
  const canMatchInside = (needle: string, hay: string) => mentions(hay, needle);

  // Every scored list, not just requestWords (#234). The rule had only ever
  // been applied to one list, and the other two had accumulated 22 overlapping
  // pairs between them — "tax refund" inside "council tax refund", "final
  // notice" inside "final notice of unpaid toll", "reward" inside "reward
  // points". Each scored one phrase as two findings and quoted both in the
  // flag, so the evidence shown to the reader was doubled too.
  //
  // The longer entry in such a pair is unreachable: the shorter one always
  // matches first, so it can never be the sole hit. It contributes nothing but
  // the duplicate, which is why the fix was to delete it rather than to
  // re-weight around it.
  const SCORED_LISTS = ["urgencyWords", "rewardWords", "requestWords"] as const;

  for (const list of SCORED_LISTS) {
    it.each(packs)(`%s: no ${list} entry can match inside another`, (_code, pack) => {
      const entries = pack[list] as string[];
      const offenders = entries.filter((w) =>
        entries.some((other) => other !== w && canMatchInside(other, w)),
      );
      expect(offenders).toEqual([]);
    });
  }

  it.each(packs)("%s: only lists eligibility-restricted trusted suffixes", (_code, pack) => {
    // A trusted suffix suppresses brand scoring entirely, so an open
    // registration would whitelist exactly the domains scammers buy.
    const OPEN = [".co.uk", ".org.uk", ".com", ".net", ".org", ".io", ".co", ".me"];
    for (const suffix of pack.trustedHostSuffixes) {
      expect(OPEN).not.toContain(suffix);
    }
  });

  // Code review of the US/NZ/CA/IE packs. The registrable-label rule decided a
  // two-part public suffix from the penultimate label alone ("is it co/com/gov/
  // …?"), which is true for `chase.gov.co` and `kiwibank.co.io` — but `.co` and
  // `.io` are ordinary gTLDs, so there the last two labels ARE the registrable
  // domain. Reading them as a suffix made the brand own the label, tripping the
  // "brand owns the label, so it's the real site" exemption and suppressing
  // brand scoring outright.
  //
  // One open-registration domain therefore defeated the typosquat rule in every
  // pack at once, which is why this is asserted per-pack rather than once: the
  // bug was cross-region, and so is the guarantee.
  it.each(packs)("%s: a brand under a fake two-part suffix is still a typosquat", (code, pack) => {
    const brand = pack.typosquatBrands.substring[0];
    if (!brand) return; // ZZ has no national brand list.
    // `.co` and `.io` are gTLDs — "<brand>.gov.co" is an ordinary domain someone
    // bought, not the brand's real site under a government suffix.
    for (const host of [`${brand}.gov.co`, `${brand}.com.co`, `${brand}.co.io`]) {
      const flags = checkUrl(`http://${host}/login`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ host, impersonating: flags.includes("impersonates") })
        .toEqual({ host, impersonating: true });
    }
  });

  it.each(packs)("%s: a brand on its own real domain is not a typosquat", (code, pack) => {
    // The other half — the registrable-label exemption must keep working, or the
    // fix above would flag every genuine brand site. Phase 5 found that dropping
    // it flagged 21 of 24 real UK brand sites as likely_scam.
    //
    // The `.co.uk` / `.com.au` cases are the ones that exercise the two-part
    // suffix path specifically: a bare `<brand>.com` has only two labels, so the
    // suffix branch never runs, and a brand under the pack's own trusted suffix
    // is exempted earlier by the trusted-suffix rule. Without a genuine two-part
    // host here, removing suffix handling altogether would pass unnoticed.
    const brand = pack.typosquatBrands.substring[0];
    if (!brand) return;
    const hosts = [
      `${brand}.com`,
      `www.${brand}.com`,
      // Real two-part suffixes, on the open registrations where brands actually
      // live. These must resolve the registrable label to the brand itself.
      `${brand}.co.uk`,
      `www.${brand}.com.au`,
      `${brand}.co.nz`,
    ];
    for (const host of hosts) {
      const flags = checkUrl(`https://${host}/`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ host, impersonating: flags.includes("impersonates") })
        .toEqual({ host, impersonating: false });
    }
  });

  it.each(packs)("%s: names only concrete brands as crypto exchanges", (_code, pack) => {
    // The TOAD flag quotes whichever entry matched, so a generic phrase renders
    // "crypto exchange and other exchanges never ring customers".
    for (const brand of pack.cryptoExchanges) {
      expect(brand).not.toMatch(/\b(exchange|platform|wallet|crypto)\b/i);
    }
  });

  // Found when the US/NZ/CA/IE packs were added. Agency lists are plain string
  // arrays with no substring/word split, and national agency acronyms are
  // overwhelmingly three letters — so a bare `includes()` fired inside ordinary
  // English. It was flagging "your account is fine" as government impersonation
  // (NZ "acc" ⊂ "account"), and would have read "message" as the SSA, "security"
  // as the SEC and "weird"/"third" as the IRD.
  //
  // The fix is mechanical rather than curated (mentionsAny in scamDetector
  // boundary-matches anything ≤3 chars), so this test asserts the *behaviour*
  // holds for every pack rather than policing list contents — a new region
  // inherits the protection without its author opting in.
  it.each(packs)("%s: short agency names don't fire inside ordinary words", (code, _pack) => {
    const innocuous = [
      "Please check your account balance today.",
      "Your message was received and the service notice is attached.",
      "That's weird, the third payment went through immediately.",
      "For your security, review the craft order their team sent.",
    ];
    for (const text of innocuous) {
      const flags = checkSms(text, undefined, code).flags.join(" | ").toLowerCase();
      expect({ text, flags: flags.includes("government agency") }).toEqual({ text, flags: false });
      expect({ text, flags: flags.includes("police authority") }).toEqual({ text, flags: false });
    }
  });

  // ── Global brand floor ──────────────────────────────────────────────────
  //
  // The base list is what makes the structural typosquat rules reach a country
  // nobody has authored. Before it, `ZZ` and every `minimal` pack carried empty
  // brand lists, so both the substring rule and keyboard-adjacency detection
  // had nothing to match against — the adjacency rule was region-independent by
  // construction and did nothing for exactly the regions that needed it.

  it.each(packs)("%s: inherits the global brand floor", (_code, pack) => {
    for (const brand of BASE_SIGNALS.typosquatBrands) {
      expect(pack.typosquatBrands.substring).toContain(brand);
    }
  });

  it.each(packs)("%s: doesn't re-list a global brand nationally", (code, _pack) => {
    // The URL checker adds one signal per matching entry, so a brand in both
    // layers scores +90 instead of +45 — a silent doubling that no flag text
    // reveals, since the flag names the brand once either way.
    //
    // buildPack deliberately does not dedupe: collapsing it here would hide the
    // authoring mistake rather than surface it, which is the same reasoning as
    // the pack-shadowing invariant. So the disjointness is asserted instead.
    const national = REGION_DEFINITIONS[code].typosquatBrands;
    for (const brand of BASE_SIGNALS.typosquatBrands) {
      expect({ code, substring: national.substring.includes(brand) })
        .toEqual({ code, substring: false });
      expect({ code, word: national.word.includes(brand) })
        .toEqual({ code, word: false });
    }
  });

  it.each(packs)("%s: scores a squat of a global brand", (code) => {
    // The behavioural half, and the point of the whole exercise: a pack with no
    // national brands at all must still catch these. Asserted per-pack so a
    // future region cannot regress it by overriding the merge.
    const flags = checkUrl("http://paypal-secure-verify.cyou/login", undefined, code)
      .flags.join(" | ").toLowerCase();
    expect({ code, impersonating: flags.includes('impersonates "paypal"') })
      .toEqual({ code, impersonating: true });
  });

  it.each(packs)("%s: scores a keyboard typo of a global brand", (code) => {
    // Adjacency specifically — the rule the reach gap was really about. "payppal"
    // is the doubled-key shape, and it contains no brand substring at all, so
    // nothing else in the checker can be producing this flag.
    const flags = checkUrl("http://payppal.com/login", undefined, code)
      .flags.join(" | ").toLowerCase();
    expect({ code, typo: flags.includes('one mistyped letter away from "paypal"') })
      .toEqual({ code, typo: true });
  });

  // The false-positive direction, and the costlier one — a scam card on a real
  // site teaches users the verdicts are noise. These brands now score in every
  // region, so a wrong flag is wrong in ~190 countries rather than one.
  //
  // The national suffixes below are the regression this pair exists for. A
  // sweep of the six global brands across 18 national suffixes produced 96
  // impersonation flags on real sites, because `brandSuffixes` asks "would a
  // COVERED region's brands be here" and no pack authors `.com.br`, `.co.jp` or
  // `.co.za`. Global brands register in every country, so for them the
  // multi-label default inverts — see SQUAT_NAMESPACE_SUFFIXES.
  it.each(packs)("%s: leaves the global brands' own sites alone", (code) => {
    const hosts = [
      "paypal.com", "www.amazon.com", "netflix.com",
      // Suffixes a pack authors.
      "amazon.co.uk", "paypal.com.sg", "netflix.com.au",
      // Suffixes NO pack authors — the case the union got wrong.
      "paypal.com.br", "amazon.co.jp", "netflix.co.za", "www.paypal.com.tr",
    ];
    for (const host of hosts) {
      const flags = checkUrl(`https://${host}/`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ code, host, impersonating: flags.includes("impersonates") })
        .toEqual({ code, host, impersonating: false });
    }
  });

  it.each(packs)("%s: still squats a global brand in a lookalike namespace", (code) => {
    // The other half. Widening the default for global brands must not hand the
    // ownership exemption to the namespaces the multi-label rule exists to
    // catch: `.co` and `.io` SECOND LEVELS are sold worldwide as `.com`
    // lookalikes, so a brand owning the label there is evidence of a squat.
    // (The bare `.co` and `.io` are a different question and are exempt by
    // default — pinned in publicSuffix.test.ts.)
    // `gov.uk`, `ac.uk` and `edu.au` are the restricted namespaces, and they are
    // here because the unit test for that rule was the ONLY thing covering it:
    // removing the non-commercial second-level check failed six unit cases and
    // not one behavioural one, while actually exempting `amazon.gov.uk` and
    // `netflix.ac.uk` — a global brand squatting a government or academic
    // namespace, waved through. A guard reachable only from its own unit test
    // is the same shape as the adjacency alphabetic-label guard that passed its
    // injection for lack of a fixture that reached it.
    const hosts = [
      // Sold internationally as `.com` lookalikes.
      "paypal.gov.co", "amazon.com.co", "netflix.co.io",
      // Wildcard registry — no enumerated commercial second level.
      "paypal.com.np",
      // Non-commercial second levels in countries NO pack authors — the only
      // fixtures that reach the second-level rule on their own.
      //
      // The country matters as much as the second level, and getting that wrong
      // is what an earlier cut of this test did: it used `netflix.ac.uk` and
      // `paypal.edu.au`, which the GB and AU packs list in `brandSuffixes`
      // precisely because those registries vet registrants ("a brand name under
      // either is genuine" — gb.ts). Both were clean on `main`; asserting them
      // as squats invented a stricter behaviour rather than pinning an existing
      // one, and it only looked right because a separate bug was suppressing
      // the pack union for these brands.
      //
      // These carry the same shape with no pack claiming them, so the
      // exemption has to be withheld by the rule itself. Asserted unclaimed
      // below rather than assumed — see CLAIMED_BRAND_SUFFIXES.
      "paypal.gov.gr", "amazon.ac.kr", "netflix.edu.pl",
    ];
    for (const host of hosts) {
      const flags = checkUrl(`http://${host}/login`, undefined, code).flags.join(" | ").toLowerCase();
      expect({ code, host, impersonating: flags.includes("impersonates") })
        .toEqual({ code, host, impersonating: true });
    }
  });

  it("uses non-commercial fixtures no pack has since claimed", () => {
    // The guard on the fixtures above, not on the engine. A pack shipping on
    // one of these countries hands the ownership exemption to its own national
    // namespace legitimately — every shipped pack lists its own `gov.*` — so
    // the fixture silently stops reaching the second-level rule and the failure
    // reads as a detection regression instead of a stale test.
    //
    // Written as its own case so the diagnosis arrives with the failure: if
    // this goes red, re-point the fixture at an unclaimed country rather than
    // changing the rule.
    for (const suffix of ["gov.gr", "ac.kr", "edu.pl"]) {
      expect({ suffix, claimed: CLAIMED_BRAND_SUFFIXES.has(suffix) })
        .toEqual({ suffix, claimed: false });
    }
  });

  it("keeps the global list substring-safe", () => {
    // Matched with hostname.includes() in every region at once, so a collision
    // is a false accusation worldwide rather than in one country. The adjacency
    // floor is six characters and these must clear it too, or a brand would be
    // listed for a rule that silently ignores it.
    for (const brand of BASE_SIGNALS.typosquatBrands) {
      expect({ brand, length: brand.length >= 6 }).toEqual({ brand, length: true });
      expect({ brand, alphabetic: /^[a-z]+$/.test(brand) }).toEqual({ brand, alphabetic: true });
    }
  });

  it("keeps the global brands from being typos of one another", () => {
    // They are checked against every candidate together, so one brand being a
    // keyboard slip of another would make each squat of the pair ambiguous.
    for (const brand of BASE_SIGNALS.typosquatBrands) {
      const others = BASE_SIGNALS.typosquatBrands.filter((b) => b !== brand);
      expect({ brand, typoOf: findKeyboardTypo(brand, others) }).toEqual({ brand, typoOf: null });
    }
  });

  it.each(packs)("%s: keeps word-matched brands out of the substring lists", (_code, pack) => {
    // A name needing \b boundaries must not also be substring-matched — the
    // substring path would defeat the boundary that made it safe to include.
    for (const set of [pack.typosquatBrands, pack.brandMentions]) {
      for (const word of set.word) {
        expect(set.substring).not.toContain(word);
      }
    }
  });
});

describe("AU region definition", () => {
  it("only claims no-link senders that are also impersonated authorities", () => {
    // The flag copy names these bodies, so a sender missing from
    // authorityMentions could never reach the nested no-link check.
    const authorities = AU.authorityMentions.map((a) => a.toLowerCase());
    for (const sender of AU.noLinkSenders) {
      expect(authorities).toContain(sender.toLowerCase());
    }
  });

  it("builds the fraudulent-platform flag around the matched name", () => {
    expect(AU.fakeInvestmentPlatformFlag("quantum ai")).toContain("quantum ai");
  });

  it("has no duplicate entries within a signal list", () => {
    const lists = {
      authorityMentions: AU.authorityMentions.map((a) => a.toLowerCase()),
      legitDomains: AU.legitDomains,
      identityRereg: AU.identityRereg,
      foreignAuthorityMentions: AU.foreignAuthorityMentions,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect({ [name]: new Set(list).size }).toEqual({ [name]: list.length });
    }
  });
});

describe("foreign-authority mentions", () => {
  // The Chinese-authority block used to be copy-pasted into all six national
  // packs. It is diaspora-targeted rather than country-targeted, so there was
  // never a regional reason for six copies — and six copies meant the
  // "Chinese Embassy" gap (found 2026-08-10) existed six times over.
  const NATIONAL = supportedRegions().filter((c) => c !== FALLBACK_REGION);

  it("is shared by every national pack rather than duplicated", () => {
    for (const code of NATIONAL) {
      const pack = resolveRegionPack(code);
      for (const term of CHINESE_AUTHORITY_MENTIONS) {
        expect(pack.foreignAuthorityMentions, code).toContain(term);
      }
    }
  });

  it("carries interpol/europol everywhere except AU", () => {
    // AU's pack deliberately omits them; the AFP warning this list came from is
    // specifically about Chinese-authority impersonation.
    for (const code of NATIONAL) {
      const has = resolveRegionPack(code).foreignAuthorityMentions.includes("interpol");
      expect(has, code).toBe(code !== "AU");
    }
  });

  it("lists both word orders for embassy and consulate", () => {
    // Matching is \b-delimited substring, so word order is literal: before this
    // was fixed, "embassy of china" was listed and scored 31 while the natural
    // "Chinese Embassy" scored 0.
    for (const pair of [
      ["chinese embassy", "embassy of china"],
      ["chinese consulate", "consulate of china"],
    ]) {
      for (const term of pair) {
        expect(CHINESE_AUTHORITY_MENTIONS).toContain(term);
      }
    }
  });

  it("flags the phrasings a real lure uses", () => {
    for (const claim of [
      "This is the Chinese Embassy. You are named in a money laundering investigation.",
      "The Chinese Embassy in Canberra requires you to verify your identity.",
      "Consulate of China: your residency status is under review.",
      "This is the Public Security Bureau. An arrest warrant has been issued.",
      "Chinese police have opened a case against you.",
    ]) {
      const flags = checkSms(claim).flags.join(" | ");
      expect(/foreign police or government authority/i.test(flags), claim.slice(0, 44)).toBe(true);
    }
  });

  it("leaves topic words out, so ordinary copy stays clean", () => {
    // Each of these was considered and rejected: they name a subject rather than
    // an institution making contact, and the flag is worth +35 on its own.
    for (const term of ["chinese immigration", "chinese government", "china police"]) {
      expect(CHINESE_AUTHORITY_MENTIONS).not.toContain(term);
    }
    for (const legit of [
      "Chinese immigration rules changed in 2026, see our firm's summary.",
      "The Chinese government published new tariff schedules today.",
    ]) {
      const flags = checkSms(legit).flags.join(" | ");
      expect(/foreign police or government authority/i.test(flags), legit.slice(0, 44)).toBe(false);
    }
  });

  it("has no duplicates after the spread", () => {
    for (const code of NATIONAL) {
      const list = resolveRegionPack(code).foreignAuthorityMentions;
      expect({ [code]: new Set(list).size }).toEqual({ [code]: list.length });
    }
  });
});
