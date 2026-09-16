import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions } from "@veriguard/engine/regions";
import type { LanguageCode } from "@veriguard/engine/regions/types";
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
 * Common words per language, consulted only for regions that declare the
 * language. `pack.languages` is what makes this scoping possible.
 *
 * **Scoping is the whole design, not an optimisation.** A union of every
 * language flags genuine acronyms and is worse than no check: NZ's "dia" (the
 * Department of Internal Affairs) collides with Spanish "día", IE's "ros" with
 * Dutch and Spanish, SG's "ica" with Swedish. None of those regions' users
 * read messages in those languages, so a union check would force an allowlist
 * entry per genuine acronym — inverting the guard's value, since the allowlist
 * is meant to be the rare exception. Checking Spanish only against
 * Spanish-reading regions keeps it quiet and honest.
 *
 * Bundled rather than read from a system dictionary: CI has no
 * `/usr/share/dict/words`, and a full dictionary is the wrong tool anyway — it
 * carries obscure entries ("kra", a Malay isthmus) that make the check cry
 * wolf. The bias is deliberately conservative in both directions: only words
 * common enough that a real message could plausibly contain one. Missing a
 * rare word costs a probe finding; adding a rare one costs every future pack
 * author a false alarm.
 *
 * Singulars only — the lookup strips a trailing "s", so "sap" covers "saps".
 *
 * **Non-English lists are short by necessity and that is the honest state.**
 * They hold only words verifiable without fluency: everyday nouns a
 * non-speaker can confirm in any dictionary. Authoring a broad list in a
 * language nobody here reads is the thing the roadmap says not to do, so these
 * grow when a speaker reviews them, not before. A short list still catches the
 * class it was built for — see the "ja" entry and JP's "yubin".
 */
const COMMON_WORDS_BY_LANGUAGE: Partial<Record<LanguageCode, string[]>> = {
  en: [
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
  ],

  // Everyday nouns and verbs. "dia" (day) and "ano" (year) are the ones that
  // matter: both are extremely common and both are plausible agency acronyms.
  es: ["ano", "casa", "cine", "dia", "hora", "mes", "ley", "luz", "mano",
    "mesa", "oro", "pan", "paz", "pie", "rio", "sal", "sol", "tren", "vida",
    "sat", "ine"],

  // "dia" is shared with Spanish; "mes", "pao", "rua", "sol" likewise everyday.
  pt: ["ano", "casa", "dia", "hora", "mes", "lei", "luz", "mao", "mesa",
    "pao", "paz", "pe", "rio", "rua", "sal", "sol", "vida"],

  fr: ["an", "ami", "eau", "fin", "jour", "loi", "main", "mer", "mois",
    "mot", "nuit", "pain", "paix", "pied", "rue", "sel", "vie", "ville"],

  de: ["arzt", "bad", "berg", "buch", "ei", "eis", "frau", "geld", "haus",
    "hund", "jahr", "kind", "lied", "mann", "meer", "tag", "tor", "uhr",
    "weg", "zeit"],

  it: ["anno", "casa", "cane", "cibo", "due", "fine", "gatto", "giorno",
    "luce", "mano", "mare", "mese", "oro", "pane", "pace", "piede", "sale",
    "sole", "vita"],

  nl: ["dag", "deur", "eten", "geld", "hond", "huis", "jaar", "kind", "land",
    "maan", "man", "melk", "mens", "nacht", "oog", "raam", "tijd", "uur",
    "vis", "water", "duo"],

  sv: ["barn", "bok", "dag", "hund", "hus", "land", "ljus", "man", "mat",
    "natt", "sol", "tid", "vatten", "ar"],

  pl: ["czas", "dom", "dzien", "kot", "las", "noc", "oko", "pies", "rok",
    "ryba", "sol", "woda"],

  // Romanised Japanese. This is the class the guard was extended for: an
  // agency short name that is an ordinary word once romanised. "yubin" (郵便,
  // mail/post) is the live instance — it read as a government agency in
  // "the yubin has not arrived today".
  ja: ["ame", "asa", "hana", "hito", "hon", "ie", "inu", "kane", "kawa",
    "kuni", "machi", "michi", "mizu", "neko", "niwa", "sora", "tori", "umi",
    "yama", "yoru", "yubin", "denwa", "tegami"],

  // Romanised Korean. Single-syllable entries are omitted for the reason given
  // under "zh": romanised one-syllable forms collide with acronyms without
  // being words a pasted message would contain on their own.
  ko: ["chaek", "namu", "bada", "baram"],

  // Romanised Vietnamese (unmarked, as a pasted message may lose diacritics).
  vi: ["ban", "bien", "cay", "cha", "com", "con", "cua", "dat", "den", "gio",
    "mua", "nam", "ngay", "nha", "nuoc", "song", "troi"],

  // Romanised Thai.
  th: ["ban", "fon", "kao", "khon", "mae", "mai", "nam", "pai", "phi", "rot",
    "wan"],

  // Indonesian / Malay share most everyday vocabulary.
  id: ["air", "anak", "api", "bulan", "hari", "hujan", "ibu", "jalan",
    "kaki", "kota", "laut", "mata", "nama", "orang", "pagi", "pintu", "rumah",
    "tahun", "tangan"],
  ms: ["air", "anak", "api", "bulan", "hari", "hujan", "ibu", "jalan",
    "kaki", "kota", "laut", "mata", "nama", "orang", "pagi", "pintu", "rumah",
    "tahun", "tangan"],

  // Tagalog.
  tl: ["araw", "bahay", "bata", "buwan", "gabi", "ilog", "ina", "isda",
    "kamay", "mata", "pera", "puso", "tao", "tubig", "ulan"],

  // Afrikaans — ZA declares it alongside English.
  af: ["boek", "brood", "dag", "geld", "hond", "huis", "jaar", "kind",
    "kos", "land", "maan", "man", "nag", "oog", "see", "son", "tyd", "water"],

  // Swahili — KE declares it alongside English.
  sw: ["baba", "chai", "jua", "kazi", "maji", "mama", "moto", "mtu", "mwaka",
    "mwezi", "ndege", "nyumba", "siku", "usiku", "watu"],

  // Romanised Hindi.
  hi: ["aag", "aankh", "din", "ghar", "haath", "kaam", "log", "maa", "naam",
    "pani", "paisa", "raat", "saal", "samay"],

  // Romanised Arabic.
  ar: ["bab", "bahr", "bayt", "bint", "ibn", "kitab", "layl", "mal", "nar",
    "nahr", "shams", "yawm"],

  // Romanised Mandarin. Deliberately EMPTY, and not an oversight: unmarked
  // pinyin is a syllable inventory, not a word list. Single syllables ("ma",
  // "lu", "yu") are morphemes that carry meaning only with a tone and usually
  // only in a compound, so listing them flags genuine acronyms — SG's "mas"
  // depluralised to "ma" and reported a collision that does not exist in any
  // message a user would paste. Multi-syllable romanisations would be safe to
  // list, but need a reader to choose them.
  zh: [],

  // Tamil, romanised. Single syllables omitted, per the "zh" note.
  ta: ["amma", "appa", "malai", "neer", "thanni", "veedu"],
};

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
      // Multi-word entries are safe: an expanded name is not a single word.
      if (!/^[a-z]+$/.test(word)) continue;
      if (word.length > 5) continue;
      out.push(word);
    }
  }
  return out;
};

/**
 * The word this entry collides with and the language it collides in, or null —
 * consulting only the languages the region declares. Strips one plural "s",
 * which is how "saps" reaches "sap".
 */
const collidesWith = (
  entry: string,
  languages: readonly LanguageCode[],
): { word: string; language: LanguageCode } | null => {
  const singular = entry.replace(/s$/, "");
  for (const language of languages) {
    const words = COMMON_WORDS_BY_LANGUAGE[language];
    if (!words) continue;
    if (words.includes(entry)) return { word: entry, language };
    if (singular !== entry && words.includes(singular)) {
      return { word: singular, language };
    }
  }
  return null;
};

/**
 * Every collision across every pack, as `"REGION acronym (word, lang)"`.
 *
 * The language is part of the key so an allowlist entry says which language it
 * was reviewed against — the same acronym can be innocuous in one and not in
 * another, and a bare "MX sat (sat)" would not record which reading was judged.
 */
const allCollisions = (): Set<string> => {
  const found = new Set<string>();
  for (const region of supportedRegions()) {
    const { languages } = resolveRegionPack(region);
    for (const entry of shortAlphaEntries(region)) {
      const hit = collidesWith(entry, languages);
      if (hit) found.add(`${region} ${entry} (${hit.word}, ${hit.language})`);
    }
  }
  return found;
};

describe("bare agency acronyms that are ordinary words", () => {
  it("has no unreviewed collisions in any pack", () => {
    const unreviewed = [...allCollisions()]
      .filter((c) => !KNOWN_COLLISIONS.has(c))
      .sort();
    expect(
      unreviewed,
      "Agency acronyms that are also ordinary words in a language the region " +
        'declares. Each one flags "Names a government agency" on innocent ' +
        "text, and supplies the authority half of a composite so a " +
        "rushed-but-innocent message reaches suspicious. Prefer authoring the " +
        "expanded agency name instead of the bare acronym. If the acronym " +
        "genuinely must stay, add it to KNOWN_COLLISIONS with the reason it " +
        "outweighs the word.",
    ).toEqual([]);
  });

  // Without this, a pack declaring a language nothing covers passes silently,
  // and the guard reports a clean sweep it never performed. An empty list is a
  // legitimate answer (see "zh"), but it has to be a stated one.
  it("has a word list for every language any pack declares", () => {
    const declared = new Set<LanguageCode>();
    for (const region of supportedRegions()) {
      for (const language of resolveRegionPack(region).languages) {
        declared.add(language);
      }
    }
    const uncovered = [...declared]
      .filter((l) => COMMON_WORDS_BY_LANGUAGE[l] === undefined)
      .sort();
    expect(
      uncovered,
      "Languages declared by a pack with no entry in " +
        "COMMON_WORDS_BY_LANGUAGE. Acronyms in those regions are unchecked " +
        "against that language. Add a list — an empty one is fine if the " +
        "reason is written down, as for romanised Mandarin.",
    ).toEqual([]);
  });

  it("keeps the allowlist free of collisions that no longer exist", () => {
    const found = allCollisions();
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
    // The collision the language axis exists to reach: an ordinary word in the
    // region's own language, invisible to an English-only check.
    ["JP", "The yubin arrived this morning."],
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
    ["JP", "Urgent: please confirm, the yubin has not arrived today!"],
  ];

  it.each(URGENT)("%s: urgency plus a collision word stays below suspicious — %s", (region, text) => {
    const result = checkSms(text, undefined, region);
    expect(result.verdict).not.toBe("suspicious");
    expect(result.verdict).not.toBe("likely_scam");
  });
});
