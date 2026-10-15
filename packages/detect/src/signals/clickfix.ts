// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// ClickFix, as values. The first composite out of `scamDetector.ts`.
//
// ClickFix is the social-engineering script that gets the user to run the
// attacker's command themselves: a fake CAPTCHA or "browser fix" overlay tells
// them to press a key combination, paste, and hit enter. Two OS variants
// (D3 / #74 / #143 / ACSC advisory May 2026, ASC-2026-0809 9 Aug 2026).
//
// Chosen as step 3's first conversion for three reasons, in order of what they
// bought:
//
//   · **It was scored at two call sites**, in `checkSms` and `checkCustom`,
//     each with its own copy of the branch. That is the restated-guard shape
//     this item exists to delete, and here it had already drifted — the
//     `checkCustom` copy carries a comment the `checkSms` copy does not, which
//     is how two copies of one rule start explaining themselves differently.
//   · **It is the cleanest channel-weight case.** Both variants sit in
//     `UNDISCOUNTED_COMPOSITES`, exempted from the email body pass's 0.7 by
//     string-prefix match. Converted, each declares `50` on every channel it
//     runs on, and the exemption is deleted rather than extended.
//   · **It forced the precedence question at the smallest possible surface**,
//     which is the same reason `checkPhone` went first. The variants are an
//     `else if` inline; as two independent signals both would fire and one lure
//     would score 100. See `supersedes` in `signalRegistry.ts`.
//
// ## Why the halves are this narrow
//
// The Windows branch keys off "press Win+R", which nothing legitimate says. The
// macOS equivalent has no such luxury: "open Terminal" and `curl … | bash` are
// ordinary developer-documentation phrases, so matching either alone would flag
// every install guide on the internet.
//
// So each macOS branch needs two halves — a *delivery* cue (Spotlight/Terminal,
// or a piped shell command) and a *clipboard* cue (a paste instruction, or the
// fake-CAPTCHA framing that makes it social engineering). An install guide says
// "run this in Terminal" and stops; the lure says "press Cmd+Space, open
// Terminal, paste".
//
// Both halves are deliberately narrower than they first appear, because a loose
// half defeats the two-half design and code review found each firing on its own:
//
//   · bare "copy" matched "open Terminal and copy the output into this ticket",
//     which is content moving *out* of the shell, the opposite direction;
//   · bare "spotlight" is an ordinary noun, so scam-awareness copy ("puts the
//     spotlight on scam trends… copy the link") self-triggered the flag — and
//     this app publishes exactly that kind of writing.
//
// Each of those is pinned as a negative in `__tests__/clickFixPinned.test.ts`.

import type { Hit, SignalDef } from "../signalRegistry";

/**
 * The Windows cue: the key combination, or an encoded PowerShell invocation.
 *
 * Kept as two named predicates rather than one regex because they are different
 * claims — one is an instruction to the user, the other is the payload itself —
 * and a reader checking whether this rule can misfire should be able to see
 * which. Neither has a legitimate use in a message to a consumer.
 */
function isWindowsClickFix(text: string): boolean {
  const runDialog = /press\s+(win|windows)(?:\s*\+\s*|\s+)r\b/i.test(text);
  const encodedPowerShell = /powershell\s+-[ec]/i.test(text);
  return runDialog || encodedPowerShell;
}

/** The macOS variant: a delivery cue paired with a clipboard or framing cue. */
function isMacClickFix(text: string): boolean {
  const delivery =
    /\b(?:open|launch|start)\s+(?:the\s+)?terminal\b/i.test(text) ||
    /\b(?:cmd|command)\s*\+\s*space\b/i.test(text) ||
    // "spotlight" is an ordinary English noun ("puts the spotlight on scam
    // trends"), so it only counts as a delivery cue when used as the macOS
    // launcher — opening it, or searching in it.
    /\b(?:open|launch|press|hit|use|via)\s+(?:the\s+)?spotlight\b/i.test(text) ||
    /\bspotlight\s+(?:search|and\s+type|then\s+type)\b/i.test(text);
  // Note the grouping below: an unguarded `curl \| bash` alternative would fire
  // on any README, which is exactly the false positive the issue asked to
  // avoid.
  const shellPipe = /\bcurl\b[^\n]{0,120}\|\s*(?:sudo\s+)?(?:ba|z|)sh\b/i.test(text);
  // Paste only — not bare "copy". The attack direction is content moving *into*
  // the user's shell; "copy the output into this ticket" is the opposite, and
  // matching it flagged a legitimate support instruction as likely_scam.
  // "copy" is still matched where it's explicitly paired with pasting.
  const clipboard =
    /\b(?:paste|pbpaste|ctrl\s*\+\s*v|cmd\s*\+\s*v|command\s*\+\s*v)\b/i.test(text) ||
    /\bcopy\b[^\n]{0,40}\b(?:paste|run|execute|enter|terminal)\b/i.test(text);
  // The fake-verification framing is itself a co-signal: it's what separates a
  // malicious paste instruction from a legitimate one.
  const captchaFraming =
    /\b(?:captcha|human verification|browser\s+(?:fix|repair|error))\b/i.test(text) ||
    // "…not a robot" / "…you are human", with any leading verb — the campaigns
    // vary it freely ("I'm not a robot", "confirm you are not a robot",
    // "verify you're human", "prove you are human").
    /\b(?:i'?m|i am|you'?re|you are)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text) ||
    /\b(?:confirm|verify|prove|check)\s+(?:that\s+)?(?:you'?re|you are|i'?m|i am)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text);

  return (delivery && (clipboard || captchaFraming)) ||
    (shellPipe && (clipboard || captchaFraming));
}

/**
 * The reader-facing rows. Wording unchanged by the conversion, deliberately:
 * one change at a time is what makes "observationally identical" checkable.
 *
 * These are the two strings `UNDISCOUNTED_COMPOSITES` matched by prefix, and
 * `scamDetector.ts` no longer imports either. That is the small, concrete
 * result of the conversion: the flag text used to be shared machinery — a
 * handle the email path held so it could find a row it had just discounted and
 * lift it back — and it is now just a sentence a reader sees. A signal's weight
 * is no longer carried by its prose.
 *
 * Exported for tests, which assert the wording a reader is shown.
 */
export const WIN_CLICKFIX_FLAG =
  "'Press Win+R' instruction detected — this is ClickFix social engineering: scammers trick you into running malware on your own computer disguised as a 'human verification' step";

export const MAC_CLICKFIX_FLAG =
  "'Open Terminal and paste this' instruction detected — this is the macOS ClickFix variant: a fake CAPTCHA or 'browser fix' overlay talks you into running the attacker's command yourself, usually via Spotlight and Terminal. No legitimate site or verification step ever asks for this.";

/**
 * Both variants, at 50 on every channel they run on.
 *
 * `weight: 50` as a bare number rather than a per-channel record, which is the
 * declaration that *replaces* the exemption list. The email discount exists to
 * soften hits whose false-positive rate rises with message length; a two-half
 * gate's does not, and these scripts arrive by email as readily as by SMS. A
 * bare number says that once, where the author chose the number — instead of
 * saying it in a list six entries long that a new composite silently fails to
 * join.
 *
 * Both are `structural`: they match the shape of an instruction, not a claim
 * about which entities exist, so neither goes stale and neither needs
 * re-checking against the world on a schedule.
 *
 * Not on the `url` or `phone` channels. A hostname is not prose and carries no
 * instruction to the user, and the inline rule never ran there either.
 */
export const CLICKFIX_SIGNALS: readonly SignalDef[] = [
  {
    id: "clickfix.windows",
    // The original text, not the normalised body: every pattern here is
    // case-insensitive by its own flag, and the key combination and the
    // PowerShell flag are punctuation-sensitive in a way normalisation is
    // allowed to change.
    reads: ["original"],
    channels: ["sms", "email", "custom"],
    weight: 50,
    kind: "structural",
    // One campaign, described twice. A page carrying per-OS instructions is the
    // normal shape of this lure rather than a contrived input, and scoring both
    // readings would count it twice. Windows is the surviving reading because
    // its cue is the unambiguous one — nothing legitimate says "press Win+R" —
    // and because that is the precedence the inline `else if` had, which is
    // what this conversion must not change.
    supersedes: ["clickfix.macos"],
    evaluate: (ctx): Hit[] =>
      isWindowsClickFix(ctx.original)
        ? [{ text: WIN_CLICKFIX_FLAG, source: "message" }]
        : [],
  },
  {
    id: "clickfix.macos",
    reads: ["original"],
    channels: ["sms", "email", "custom"],
    weight: 50,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      isMacClickFix(ctx.original)
        ? [{ text: MAC_CLICKFIX_FLAG, source: "message" }]
        : [],
  },
];
