import { describe, it, expect } from "vitest";
import { checkSms, checkCustom, mentions } from "@veriguard/detect/scamDetector";

// Regression cover for #233 — keyword entries firing inside ordinary words.
//
// mentions() protected entries of 4 characters or fewer (#196), which covered
// "pin", "free" and "ato" but stopped one letter short of "claim", "prize" and
// "voucher". "Unclaimed baggage goes to the storage room" reached suspicious
// (24) on nothing but ordinary English: "unclaimed" matched as itself and
// "claim" matched inside it, 2 x 12 = 24.
//
// checkCustom made it worse by matching with a raw includes() instead of
// mentions(), so the same text scored differently depending on which box it
// was pasted into, and every list was flattened into one count so collisions
// stacked.
//
// The rule is now token-based: a single-token entry is anchored at the start
// and allows only an inflectional suffix; multi-word phrases keep substring
// matching.

const keywordFlag = (r: { flags: string[] }) =>
  r.flags.find(
    (f) =>
      f.startsWith("Prize/reward language") ||
      f.startsWith("Asks for sensitive info") ||
      f.startsWith("Urgency language") ||
      f.startsWith("Suspicious keywords"),
  );

describe("#233 — entries do not fire inside longer words", () => {
  // Each of these is a measured false positive from the issue.
  const benign: [string, string][] = [
    ["claim inside reclaiming", "Reclaiming the deposit takes two weeks."],
    ["prize inside prizewinning", "The prizewinning entry was announced today."],
    ["voucher inside voucherless", "The voucherless option is cheaper."],
    ["pin inside spins", "The spins class at the gym starts at 6."],
    ["ato inside atomic", "The atomic clock is very accurate."],
    ["cash inside cashew", "We need cashew nuts and rice."],
    ["free inside freedom", "Freedom of information request received."],
  ];

  it.each(benign)("checkSms stays clean: %s", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it.each(benign)("checkCustom stays clean: %s", (_label, text) => {
    const r = checkCustom(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
  });

  it("does not stack collisions into a verdict on the custom path", () => {
    // Measured at suspicious (40) before the fix, on four phantom hits:
    // "won" (in won't), "free" (in freebies), "claim" and "unclaimed".
    const r = checkCustom(
      "The atomic superstore has unclaimed freebies; won't last.",
      undefined,
      "AU",
    );
    expect(r.verdict).toBe("safe");
  });
});

// The first cut of this file tested only PREFIX collisions, which is exactly
// why the suffix hole below shipped invisibly: an unconditional inflection
// allowance let "pin" reach "pins", "free" reach "freed" and "cash" reach
// "cashed", and all 1728 tests still passed. Both directions are covered now.
describe("#233 — short entries do not pick up inflections", () => {
  const benign: [string, string][] = [
    ["pin inside pins", "The pins fell over on the bowling lane."],
    ["free inside freed", "The prisoner was freed after the appeal."],
    ["cash inside cashed", "The cheque was cashed yesterday at the branch."],
  ];

  it.each(benign)("checkSms stays clean: %s", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it.each(benign)("checkCustom stays clean: %s", (_label, text) => {
    const r = checkCustom(text, undefined, "AU");
    expect(keywordFlag(r), r.flags.join(" | ")).toBeFalsy();
  });

  it("does not stack short-entry inflections into a verdict", () => {
    // Measured at suspicious (39) on sms and 24 on custom while the inflection
    // allowance was unconditional — three fragments of ordinary English.
    const text = "The pins fell over and the cheque was cashed and the prisoner freed.";
    expect(checkSms(text, undefined, "AU").verdict).toBe("safe");
    expect(checkCustom(text, undefined, "AU").verdict).toBe("safe");
  });

  it("still matches those same short entries as whole words", () => {
    const r = checkSms("ATO: confirm your TFN and PIN to release your refund", undefined, "AU");
    expect(r.flags.some((f) => /Asks for sensitive info/i.test(f))).toBe(true);
  });
});

describe("#233 — the half that needs #234", () => {
  it("halves the score on 'unclaimed baggage' but does not clear it", () => {
    // "unclaimed" is a legitimately listed reward word, so it still matches
    // here — correctly, as far as this fix is concerned. What #233 removes is
    // the SECOND hit: "claim" no longer fires inside it, so the score falls
    // from 24 (suspicious) to 12 (safe).
    //
    // The remaining hit is #234's territory: "claim" and "unclaimed" should
    // not both be listed in base REWARD_WORDS. Until that lands, this text is
    // safe by arithmetic rather than by intent.
    const r = checkSms("Unclaimed baggage goes to the storage room.", undefined, "AU");
    expect(r.verdict).toBe("safe");
    const reward = r.flags.find((f) => f.startsWith("Prize/reward language"));
    expect(reward).toBeTruthy();
    expect(reward).toContain("unclaimed");
    expect(reward).not.toContain('"claim"');
  });
});

describe("#233 — real signals still fire", () => {
  it("matches an entry as a whole word", () => {
    const r = checkSms("You have won a free prize! Claim now.", undefined, "AU");
    expect(r.flags.some((f) => f.startsWith("Prize/reward language"))).toBe(true);
  });

  it("follows a long entry into its own inflections", () => {
    // "urgent" is the listed entry; "urgently" is the same signal. An
    // exact-match rule dropped the bareHostname evasion case to safe.
    const r = checkSms("claim now at freemoney.tk urgently", undefined, "AU");
    expect(r.verdict).not.toBe("safe");
  });

  it("draws the inflection line at the #196 threshold", () => {
    // Pins the rule directly rather than through a verdict, so a change to
    // INFLECTION_MIN_LEN fails here rather than surfacing as a false positive
    // somewhere unrelated. Above four characters an entry is a real word that
    // inflects; at four and under it is a token whose "inflections" are other
    // people's words.
    expect(mentions("act urgently", "urgent")).toBe(true);
    expect(mentions("claiming now", "claim")).toBe(true);
    expect(mentions("vouchers issued", "voucher")).toBe(true);

    expect(mentions("the pins fell over", "pin")).toBe(false);
    expect(mentions("the prisoner was freed", "free")).toBe(false);
    expect(mentions("the cheque was cashed", "cash")).toBe(false);
  });

  it("blocks prefix collisions at every length", () => {
    expect(mentions("unclaimed baggage", "claim")).toBe(false);
    expect(mentions("the prizewinning entry", "prize")).toBe(false);
    expect(mentions("voucherless option", "voucher")).toBe(false);
    expect(mentions("reclaiming the deposit", "claim")).toBe(false);
    expect(mentions("spins class", "pin")).toBe(false);
    expect(mentions("atomic clock", "ato")).toBe(false);
  });

  it("still matches across punctuation and domains", () => {
    // \b sits at any non-word character, so boundary matching does not break
    // the domain and hyphen entries the packs are full of.
    for (const text of [
      "Update your medicare.gov.au details now",
      "Visit ato.gov.au to confirm",
    ]) {
      const r = checkSms(text, undefined, "AU");
      expect(r.flags.length, text).toBeGreaterThan(0);
    }
  });

  it("scores the two myGov spellings identically", () => {
    // "mygovid" is listed explicitly now that "mygov" cannot reach inside it.
    // The old substring behaviour scored myGovID higher for no detection
    // reason — the defect the au.ts note was written about.
    const a = checkSms("Confirm your myGovID to avoid suspension.", undefined, "AU");
    const b = checkSms("Confirm your myGov to avoid suspension.", undefined, "AU");
    expect(a.score).toBe(b.score);
    expect(a.verdict).toBe(b.verdict);
  });

  it("gives the same verdict on both the sms and custom paths", () => {
    // The paths used different matchers, so identical text scored differently
    // depending on where it was pasted.
    const text = "ATO: confirm your TFN and PIN to release your refund";
    expect(checkCustom(text, undefined, "AU").verdict).not.toBe("safe");
    expect(checkSms(text, undefined, "AU").verdict).not.toBe("safe");
  });
});

describe("multi-word phrases tolerate whitespace variation", () => {
  // Found by the metamorphic eval: mentions() matched phrases with includes(),
  // so the single space an entry happens to be written with was load-bearing.
  // Any variation defeated it — and that is ~65% of every region pack (2,917 of
  // 4,493 entries), failing silently because a phrase that does not match
  // raises no flag to notice.

  it.each([
    ["doubled space", "i dropped  my phone in the sink"],
    ["tab", "i dropped\tmy phone in the sink"],
    ["hard wrap mid-phrase", "i dropped\nmy phone in the sink"],
    ["non-breaking space", "i dropped my phone in the sink"],
    ["several spaces", "i dropped   my    phone in the sink"],
  ])("matches across a %s", (_label, text) => {
    expect(mentions(text, "dropped my phone")).toBe(true);
  });

  it("still requires the words themselves, not just their letters", () => {
    // The separators are relaxed; nothing else is. A missing space joins two
    // words into a third, which is a different string and not a match.
    expect(mentions("i droppedmy phone", "dropped my phone")).toBe(false);
  });

  it("still requires the words in order", () => {
    expect(mentions("my phone dropped", "dropped my phone")).toBe(false);
  });

  it("tolerates irregular spacing in the entry as well as the text", () => {
    // Pack entries are hand-written; a stray double space in one should not
    // quietly disable it.
    expect(mentions("press win r now", "win  r")).toBe(true);
  });

  it("keeps regex metacharacters in a phrase literal", () => {
    // The phrase branch builds a RegExp now, so an unescaped "+" or "." in an
    // entry would change from a literal to a quantifier or wildcard.
    expect(mentions("press win+r to open run", "win+r to")).toBe(true);
    expect(mentions("press winxr to open run", "win+r to")).toBe(false);
  });
});

describe("the whitespace evasion, end to end", () => {
  it("scores the family-impersonation script the same however it is spaced", () => {
    // The regression that motivated the fix: this dropped from likely_scam (45)
    // to safe (0) with no flags at all, because the gate needs its pretext
    // phrase and had no other way to see one.
    const single =
      "Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?";
    const doubled = single.replace(/ /g, "  ");

    const a = checkSms(single, undefined, "AU");
    const b = checkSms(doubled, undefined, "AU");

    expect(a.verdict).toBe("likely_scam");
    expect(b.verdict).toBe(a.verdict);
    expect(b.score).toBe(a.score);
  });
});
