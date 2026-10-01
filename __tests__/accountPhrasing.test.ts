import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Regression cover for two false-positive sources found via the pack-shadowing
// guard (#196), both of which flagged ordinary service messages.
//
// 1. Bare "your account" sat in URGENCY_GENERIC. It is a noun phrase, not
//    pressure language, so it scored +10 on every transactional notification a
//    bank, gym or streaming service sends.
// 2. The typo regex matched "ur account" unanchored, so it fired inside
//    "yo|ur account|" and "fo|ur account|s" — adding a second +10 for a typo
//    that was not there. Together they put benign messages at 20 / suspicious.

const benign = [
  "Your account balance is available in the app.",
  "Your account statement for July is ready to view.",
  "Your account will renew on 3 September.",
  "Your account is now active. Welcome to the gym!",
  "Your account is ready to use.",
  "Please check your account settings.",
  "We refunded four accounts today.",
];

describe("ordinary account notifications", () => {
  it.each(benign)("stays clean: %s", (text) => {
    const result = checkSms(text, undefined, "US");
    expect(result.verdict).toBe("safe");
    expect(result.flags).toHaveLength(0);
  });

  // The specific mechanism, pinned separately: a message with "your account"
  // must not be accused of a typo it does not contain.
  it("does not report a typo for 'your account' or 'four accounts'", () => {
    for (const text of ["Please check your account settings.", "We refunded four accounts today."]) {
      const flags = checkSms(text, undefined, "US").flags.join(" | ");
      expect(flags).not.toContain("Spelling/grammar");
    }
  });

  it("still catches the real SMS-speak typo", () => {
    const result = checkSms("Check ur account now", undefined, "US");
    expect(result.flags.some((f) => f.includes("Spelling/grammar"))).toBe(true);
  });
});

describe("account-threat phrasing still scores", () => {
  // Removing the bare noun must not cost the scam shapes. What makes these
  // scams is the instruction or the threatened state, not the noun.
  it.each([
    ["Your account has been suspended. Verify now at http://bit.ly/x", "likely_scam"],
    ["Your account will be closed unless you act now.", "suspicious"],
    ["Your account is locked. Confirm your identity immediately.", "suspicious"],
  ])("%s -> %s", (text, verdict) => {
    expect(checkSms(text, undefined, "US").verdict).toBe(verdict);
  });

  it("flags an instruction to act on the account", () => {
    const result = checkSms("Verify your account now to avoid closure.", undefined, "US");
    expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(true);
  });

  it("fires in every region (base signal)", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US", "CA"]) {
      const result = checkSms("Your account is locked.", undefined, region);
      expect(result.flags.some((f) => f.includes("Urgency language"))).toBe(true);
    }
  });
});
