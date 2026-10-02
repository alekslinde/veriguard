// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Coverage for D3 (#227) and D2 (#226) of the 2026-08-31 roadmap.
//
// Both issues were rescoped after measuring against the live engine, per the
// README verification step. What each proposed vs what was actually missing:
//
//   #227  "scan this qr code to link your device"     suspicious (20) already
//         "your signal account has been flagged"      safe (0)  <- gap
//         "forward the verification code..."          safe (0)  <- gap
//   #226  e-commerce assistant recruitment lure       suspicious (25) already
//         "complete tasks to withdraw"                safe (0)  <- gap
//
// So the QR half of #227 and the recruitment half of #226 were dropped: the
// quishing regex and the jobSignals composite already carry them, and adding
// the proposed phrases would have double-scored against them.

const codeFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Asks you to pass on a verification code"));
const statusFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims a messaging account has been flagged"));
const gateFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Earnings held behind a task"));

describe("#227 — verification-code harvesting", () => {
  const scams: [string, string][] = [
    ["forward", "Your WhatsApp has been temporarily restricted. Forward the verification code to restore access."],
    ["reply with", "WhatsApp security: verify your identity to avoid account suspension. Reply with the 6-digit code."],
    ["share", "Telegram: your account is under review. Share the login code to confirm it's you."],
    ["text us", "Your WhatsApp account has been suspended. Text us the 6 digit code to restore it."],
    // The contact-compromise variant, which arrives from a real friend's
    // hijacked account and names no app at all.
    ["send me", "Hi it's me, I'm locked out. Can you send me the verification code that just arrived?"],
  ];

  it.each(scams)("flags the '%s' phrasing", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(codeFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("fires in every region — the tactic is not AU-specific", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US", "CA"]) {
      const r = checkSms("Forward the verification code to restore access.", undefined, region);
      expect(codeFlag(r), `expected the code ask to fire under ${region}`).toBeTruthy();
    }
  });
});

describe("#227 — code-harvest false-positive controls", () => {
  // Every legitimate 2FA message contains a code; the signal is being asked to
  // send one on. These are the near-misses that make that distinction load
  // bearing, and each measured as a false positive against a looser rule.
  const benign: [string, string][] = [
    ["a plain code delivery", "123456 is your WhatsApp code. Don't share this code with others."],
    ["a code delivery naming the service", "Your Signal verification code is 482910. Do not share it."],
    ["a one-time passcode", "Your one-time passcode is 8123. It expires in 10 minutes."],
    ["an enter-the-code instruction", "We sent a verification code to your email. Enter it to continue."],
    // Scored likely_scam (45) against a rule that only looked for the verb —
    // the worst possible false positive, since it is the anti-fraud advice.
    ["the anti-fraud warning itself", "Never share your verification code with anyone, including our staff."],
    ["a did-not-request notice", "If you did not request this code, ignore this message."],
    // "confirm" was dropped from the verb list for this: confirming a code you
    // already hold is a legitimate flow; transmitting one onward is not.
    ["confirming a code you hold", "Please confirm the security code printed on your card statement."],
  ];

  it.each(benign)("stays clear of the code flag: %s", (_label, text) => {
    expect(codeFlag(checkSms(text, undefined, "AU"))).toBeFalsy();
  });
});

describe("#227 — the code ask survives trailing reassurance", () => {
  // The negation guard was scoped to the whole message, so any negated-verb
  // sentence anywhere disarmed the +45 signal. Appending one line of
  // boilerplate — copied from the real notices these messages imitate — took
  // the contact-compromise lure to safe (0) with no flags at all.
  const withSuffix: [string, string][] = [
    ["never share it", "Hi it's me, I'm locked out. Send me the verification code that just arrived. Never share it with anyone else."],
    ["do not share this message", "Forward the verification code to restore access. Do not share this message with anyone."],
    ["staff will never ask", "Reply with the 6-digit code. Our staff will never ask for your PIN."],
    ["ignore if not requested", "Send us the login code to restore your account. If you did not request this, ignore this message."],
  ];

  it.each(withSuffix)("still flags when the message ends with '%s'", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(codeFlag(r)).toBeTruthy();
  });

  it("still suppresses when the warning is the whole message", () => {
    // The guard has to keep working clause-by-clause, not just stop existing.
    for (const text of [
      "Never share your verification code with anyone, including our staff.",
      "We will never ask you to share your one-time code.",
    ]) {
      expect(codeFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });
});

describe("#227 — 'code' nouns that are not account codes", () => {
  // "security code" and "access code" are the ordinary words for a door, gate
  // or alarm code. Matched as freely as "verification code" they took a
  // completely benign message to likely_scam, the engine's top severity.
  it("leaves a gate or door code alone", () => {
    for (const text of [
      "Can you forward me the security code for the gate?",
      "Send me the access code for the storage unit please.",
      "The security code for the front door is on the fridge.",
    ]) {
      expect(codeFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });

  it("still flags those nouns where an account is the subject", () => {
    // The weaker noun is reachable, but only with account context — which is
    // what separates the takeover script from a gate code.
    const r = checkSms("Your account is locked. Send us the security code to restore access.", undefined, "AU");
    expect(codeFlag(r)).toBeTruthy();
  });
});

describe("#227 — messaging-app status lures", () => {
  it("flags an account-flagged claim naming a messaging app", () => {
    const r = checkSms("Your Signal account has been flagged for unusual activity.", undefined, "AU");
    expect(statusFlag(r)).toBeTruthy();
  });

  it("flags the lower-case spelling too", () => {
    const r = checkSms("Your whatsapp account has been suspended.", undefined, "AU");
    expect(statusFlag(r)).toBeTruthy();
  });

  it("leaves ordinary talk about those apps alone", () => {
    for (const text of [
      "Message me on WhatsApp when you land.",
      "I flagged that message in Signal so we can find it later.",
      "Your WhatsApp backup completed successfully.",
      "Telegram is down for everyone apparently.",
    ]) {
      expect(statusFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });

  it("does not read the common noun 'signal' as the app", () => {
    // Reception and traffic talk is very common in SMS. Matched bare, these
    // all scored 30 as account lures.
    for (const text of [
      "Poor signal in the tunnel so my phone data was restricted",
      "The traffic signal at the intersection is under review by council",
      "The wifi signal is weak and my account keeps getting locked out",
      "No signal here, my phone is locked to the wrong network",
    ]) {
      expect(statusFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });

  it("does not add a second flag for the QR half — that is already covered", () => {
    // The quishing regex scored this at 20 before #227. The status lure adds
    // the pretext; the QR prompt must not be scored twice.
    const r = checkSms("Your Signal account has been flagged. Scan this QR code to link your device.", undefined, "AU");
    const qr = r.flags.filter((f) => f.startsWith("QR code scan prompt"));
    expect(qr).toHaveLength(1);
  });
});

describe("#226 — task-scam payment gate", () => {
  const scams: [string, string][] = [
    ["unfinished tasks", "You have unfinished tasks. Complete tasks to withdraw your earnings of $450."],
    ["complete to withdraw", "Your commission is ready. Complete the task to withdraw your earnings."],
    ["deposit to unlock", "To withdraw your commission you must first deposit $200 to unlock the next task set."],
    ["top up to continue", "Account frozen. Top up to continue and unlock your earnings."],
  ];

  it.each(scams)("flags the '%s' phrasing", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(gateFlag(r)).toBeTruthy();
    expect(r.verdict).not.toBe("safe");
  });

  it("leaves ordinary task and payroll messages alone", () => {
    for (const text of [
      "Reminder: you have 3 tasks due today in Asana.",
      "Complete your onboarding tasks before your first day.",
      "Your payroll has been processed. Payslip available in the portal.",
      // Measured at 40 against a rule whose outcome verbs included "receive".
      "Please complete the compliance training task to receive your certificate.",
      "Top up your Opal card to continue travelling.",
      "Finish the task and release the branch for review.",
      // The "unfinished tasks" branch carries no payment half of its own, so
      // it needs the money context the other branches state outright. Without
      // that it told a project-tracker reminder their money was gone.
      "Reminder from Asana: you have 3 unfinished tasks.",
      "You have unfinished tasks in the onboarding checklist.",
    ]) {
      expect(gateFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });

  it("still leaves the recruitment half to jobSignals", () => {
    // The lure #226 proposed REWARD_WORDS entries for. It was already caught,
    // and must be caught by the recruitment composite, not the payment gate.
    const r = checkSms(
      "Hi, we are hiring an e-commerce assistant to rate products to earn commission. No experience required. Work from home.",
      undefined,
      "AU",
    );
    expect(r.flags.some((f) => f.startsWith("Task/job recruitment pattern"))).toBe(true);
    expect(gateFlag(r)).toBeFalsy();
  });
});
