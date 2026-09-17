// Reader-facing strings for the popup.
//
// The verdict lines are the app's own, copied from `messages/en.normal.json`
// rather than paraphrased: a user who checks something on the site and then in
// the extension must not be told two different things about the same score.
// That file is the source; a test asserts these still match it, so a reword on
// the site fails the build here rather than quietly forking the wording.
//
// Not imported directly, because `messages/` is a Next.js i18n bundle carrying
// every string on every page — a few hundred entries — and the popup needs
// eight. The test is what keeps the copy honest without the bundle.

import type { Verdict } from "@veriguard/engine/verdictRank";

export const VERDICT_COPY: Record<Verdict, { label: string; sub: string }> = {
  safe: {
    label: "Looks good",
    sub: "Nothing matched our rules — but a new scam won't match them either. Verify anything that asks for money or details.",
  },
  suspicious: {
    label: "Proceed with caution",
    sub: "Something feels off. Don't engage until you've verified it.",
  },
  likely_scam: {
    label: "Likely a scam — do not engage",
    sub: "Don't engage. Block the sender and report it.",
  },
  unknown: {
    label: "Unable to determine",
    sub: "Not enough to go on — trust your instincts.",
  },
};

/** Source labels on evidence rows — the surface a reader can look at themselves. */
export const SOURCE_LABEL: Record<string, string> = {
  link: "Link",
  message: "Wording",
  sender: "Sender",
  phone: "Number",
  attachment: "Attachment",
  score: "Score",
};

/**
 * What this surface could not do, said plainly.
 *
 * Both notices exist because the extension is deliberately less capable than
 * the site, and a verdict that hides its own gaps is the failure mode that
 * matters most here: a reader who is not told reads a quiet result as a clean
 * one. Coverage honesty is a standing constraint, not a nicety.
 */
export const NOTICE = {
  /** A region whose pack asserts little or nothing. */
  coverage: (coverage: string) =>
    coverage === "none"
      ? "We have no detection rules for this region, so only universal signals were checked. A quiet result here means we could not look, not that nothing is wrong."
      : "Detection for this region is partial — some checks were not available. A quiet result means less here than it would elsewhere.",
  /** A shortened link this client will not resolve. */
  shortener:
    "This message hides a link behind a shortener. Checking it here would tell the shortener your IP address, so we did not follow it — the destination is unchecked. Paste it on veriguard.app to have it resolved safely.",
  /**
   * The known-malicious-host list was unavailable.
   *
   * Shown only on an otherwise-clean verdict, and the wording is careful about
   * why: on a verdict that already found something the list would not have
   * changed the advice, but on a quiet one it is the difference between "we
   * checked and found nothing" and "we could not run one of the checks".
   */
  noBlocklist:
    "We could not reach the list of known malicious sites, so that check did not run. Everything else was checked normally. This result is less complete than usual — if anything about the message feels wrong, treat it as suspicious.",
};

/**
 * The report hand-off.
 *
 * Says where the user is going and what travels with them, because the button
 * leaves the extension — and an offer to "report this" that quietly posted the
 * message would contradict the one thing this surface promises. The message
 * itself is deliberately not carried; the form asks for it in the user's own
 * words, in a box they can see.
 */
export const REPORT = {
  label: "Report this scam",
  /** Sits under the button, in the same register as the notices above it. */
  note: "Opens the report form on veriguard.app with the link, number or address filled in. Nothing is sent until you review it there and submit.",
};
