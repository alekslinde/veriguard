import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions } from "@veriguard/engine/regions";
import { checkSms } from "@veriguard/engine/scamDetector";

// Guards the failure mode where an agency's own bare acronym is also an
// ordinary English word.
//
// mentions() anchors single tokens on word boundaries, which stops a short
// entry firing *inside* a longer word ("acc" inside "account"). It cannot help
// when the entry *is* itself a word: it matches correctly, as a whole word,
// and that is exactly the problem. The message never mentioned an agency — it
// mentioned ants, or ice, or a sec.
//
// Four instances shipped and were each found by hand rather than by a check:
// two in one authoring wave and two more in the adversarial probe run after
// the next one merged. Every one survived authoring-time review because the
// reviewer's own example sentences never happened to contain the word.
//
// The harm is not the score in isolation — a lone authority mention is 0 and
// stays "safe". It is that the flag supplies the *authority* half of a
// composite, so an ordinary rushed message reaches 35 / suspicious and is told
// it "claims to be from a government agency":
//
//   "Urgent: the ants are back, please confirm you can come today!"  (FR)
//   "Urgent, please confirm: both sars outbreaks are on the exam today!"  (ZA)
//
// This guard makes the collision visible at authoring time so a new one is a
// decision rather than an accident. It cannot make the decision: "rare enough
// to keep" vs. "common enough to drop" is the author's judgement, which is why
// KNOWN_COLLISIONS carries a reason per entry rather than a bare list.

/**
 * Common English words that collide with acronyms in the packs.
 *
 * Bundled rather than read from a system dictionary: CI has no
 * `/usr/share/dict/words`, and a full dictionary is the wrong tool anyway —
 * it carries obscure entries ("kra", a Malay isthmus) that make the check cry
 * wolf on genuine acronyms. The bias here is deliberately conservative: only
 * words common enough that a real message could plausibly contain one. Missing
 * a rare word costs a probe finding; adding a rare one costs every future pack
 * author a false alarm.
 *
 * Singulars only — SHORT_ENTRY_WORDS is consulted after a trailing "s" is
 * stripped, so "sap" covers "saps".
 */
const COMMON_WORDS = new Set([
  "ant",
  "arm",
  "art",
  "bag",
  "ban",
  "bar",
  "bat",
  "bed",
  "bee",
  "bell",
  "bid",
  "bin",
  "bit",
  "box",
  "bus",
  "cab",
  "can",
  "cap",
  "car",
  "cat",
  "cop",
  "cow",
  "cup",
  "cut",
  "dam",
  "day",
  "den",
  "dig",
  "dog",
  "dot",
  "duo",
  "ear",
  "egg",
  "end",
  "eye",
  "fan",
  "far",
  "fee",
  "few",
  "fig",
  "fir",
  "fit",
  "fix",
  "fly",
  "fog",
  "gap",
  "gas",
  "gem",
  "gun",
  "gut",
  "ham",
  "hat",
  "hawk",
  "hen",
  "hip",
  "hit",
  "hot",
  "ice",
  "ink",
  "jar",
  "jet",
  "job",
  "jog",
  "key",
  "kid",
  "lab",
  "lap",
  "law",
  "leg",
  "lid",
  "lip",
  "log",
  "lot",
  "low",
  "mad",
  "man",
  "map",
  "mat",
  "mix",
  "mud",
  "mug",
  "nail",
  "net",
  "new",
  "nib",
  "nut",
  "oak",
  "oil",
  "old",
  "one",
  "owl",
  "pad",
  "pan",
  "paw",
  "pay",
  "pen",
  "pet",
  "pie",
  "pig",
  "pin",
  "pit",
  "pot",
  "pub",
  "rat",
  "raw",
  "red",
  "rib",
  "rim",
  "rod",
  "row",
  "rug",
  "run",
  "sad",
  "sap",
  "sat",
  "saw",
  "sea",
  "sec",
  "set",
  "sha",
  "she",
  "shaw",
  "sit",
  "six",
  "sky",
  "son",
  "spark",
  "sun",
  "tag",
  "tan",
  "tap",
  "tax",
  "tea",
  "ten",
  "tie",
  "tin",
  "tip",
  "toe",
  "ton",
  "top",
  "toy",
  "try",
  "tub",
  "two",
  "up",
  "van",
  "war",
  "wax",
  "way",
  "web",
  "wet",
  "who",
  "wig",
  "win",
  "yes",
  "yet",
  "zoo",
]);

/** The authority lists, where a bare acronym reads as impersonation. */
const AUTHORITY_LISTS = ["authorityMentions", "foreignAuthorityMentions"] as const;

/**
 * Collisions accepted as they stand, `"REGION acronym (word)"`.
 *
 * Empty today, and that is the expected steady state: the standing preference
 * is to author the expanded agency name rather than keep a colliding acronym,
 * which costs no coverage because a real lure names the agency in full.
 *
 * An entry here is the "rare enough to keep" side of a judgement this guard
 * deliberately does not make — the agency is named by the acronym far more
 * often than the word would appear in a pasted message. It needs the reason
 * written down, because the next author will read it as precedent.
 *
 * Note that several acronyms a full dictionary flags never reach this list:
 * SG's "mas", DE's "gez" and KE's "kra" are all dictionary entries but not
 * common English, so COMMON_WORDS excludes them by design. That exclusion is
 * the check's conservatism, not an oversight.
 */
const KNOWN_COLLISIONS = new Set<string>([]);

const shortAlphaEntries = (region: string) => {
  const pack = resolveRegionPack(region) as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const key of AUTHORITY_LISTS) {
    const list = pack[key];
    if (!Array.isArray(list)) continue;
    for (const entry of list as string[]) {
      if (typeof entry !== "string") continue;
      const word = entry.toLowerCase();
      // Multi-word entries are safe: an expanded name is not an English word.
      if (!/^[a-z]+$/.test(word)) continue;
      if (word.length > 5) continue;
      out.push(word);
    }
  }
  return out;
};

/** The word this entry collides with, or null. Strips one plural "s". */
const collidesWith = (entry: string): string | null => {
  if (COMMON_WORDS.has(entry)) return entry;
  const singular = entry.replace(/s$/, "");
  if (singular !== entry && COMMON_WORDS.has(singular)) return singular;
  return null;
};

describe("bare agency acronyms that are ordinary English words", () => {
  it("has no unreviewed collisions in any pack", () => {
    const found = new Set<string>();

    for (const region of supportedRegions()) {
      for (const entry of shortAlphaEntries(region)) {
        const word = collidesWith(entry);
        if (word) found.add(`${region} ${entry} (${word})`);
      }
    }

    const unreviewed = [...found].filter((c) => !KNOWN_COLLISIONS.has(c)).sort();
    expect(
      unreviewed,
      "Agency acronyms that are also ordinary English words. Each one flags " +
        '"Names a government agency" on innocent text, and supplies the ' +
        "authority half of a composite so a rushed-but-innocent message " +
        "reaches suspicious. Prefer authoring the expanded agency name " +
        "instead of the bare acronym. If the acronym genuinely must stay, " +
        "add it to KNOWN_COLLISIONS with the reason it outweighs the word.",
    ).toEqual([]);
  });

  it("keeps the allowlist free of collisions that no longer exist", () => {
    const found = new Set<string>();
    for (const region of supportedRegions()) {
      for (const entry of shortAlphaEntries(region)) {
        const word = collidesWith(entry);
        if (word) found.add(`${region} ${entry} (${word})`);
      }
    }
    const stale = [...KNOWN_COLLISIONS].filter((c) => !found.has(c)).sort();
    expect(stale, "Allowlist entries with no matching collision — remove them.").toEqual([]);
  });
});

// Regression cover for the instances this class has actually produced. These
// assert the user-visible outcome rather than the list contents, so they stay
// honest if the entry moves between lists.
describe("innocent messages containing agency-acronym words", () => {
  const INNOCENT: [string, string][] = [
    ["US", "Can you grab some ice for the party tonight?"],
    ["US", "Hang on a sec, I will call you back."],
    ["FR", "There are ants all over the kitchen floor."],
    ["NG", "The firs along the ridge look lovely in the snow."],
    ["ZA", "Both sars outbreaks were studied for years."],
    ["MX", "I sat on the porch all afternoon."],
    ["NL", "The duo performed beautifully last night."],
  ];

  it.each(INNOCENT)(
    "%s: does not read as a government agency — %s",
    (region, text) => {
      const result = checkSms(text, undefined, region);
      const authority = result.flags.filter((f) => /government agency/i.test(f));
      expect(authority).toEqual([]);
    },
  );

  // The composite is the real harm: urgency alone is a weak signal, and the
  // spurious authority flag is what carries it to suspicious.
  const URGENT: [string, string][] = [
    ["FR", "Urgent: the ants are back, please confirm you can come today!"],
    ["ZA", "Urgent, please confirm: both sars outbreaks are on the exam today!"],
  ];

  it.each(URGENT)("%s: urgency plus a collision word stays below suspicious — %s", (region, text) => {
    const result = checkSms(text, undefined, region);
    expect(result.verdict).not.toBe("suspicious");
    expect(result.verdict).not.toBe("likely_scam");
  });
});
