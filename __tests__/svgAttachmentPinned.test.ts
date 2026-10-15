// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkEmail } from "@veriguard/detect/scamDetector";

// Every score the SVG-attachment rule produces today, pinned before its
// patterns are rewritten to remove a polynomial blowup.
//
// Committed ahead of the change, for the reason the other pins here were: a
// characterisation test answers "did this change behaviour", a test written from
// intent answers "is this what I meant", and only the first is a rewrite's
// safety net. Every expectation below was read off the running engine.
//
// `scamDetector.test.ts` already covers what this rule decides — which shapes
// are attachments and which are asset references — and it asserts flag presence,
// not scores. That is the gap this fills twice over:
//
//   · **The rule's own row carries 0 points**, which no existing assertion
//     states. It is a wording-only row: the 20 comes from the generic
//     open-attachment rule beside it. A rewrite that gave the SVG row its own
//     weight would pass every existing test and change the score.
//   · **The dedup interaction is arithmetic.** Where the same file is both
//     "attached" and ".svg", the generic 20 is suppressed and the total is 25
//     rather than 45 — the `likely_scam` boundary, reached purely by adding two
//     rules describing one fact. The locality test that avoids it is the subtle
//     part: two attachments in one email are two facts and both charge.
//
// ## Why these patterns are being rewritten
//
// Each of the four uses three variable-length lookbehinds (`{0,200}`),
// re-evaluated at every position in the text, which is quadratic in message
// length. Measured through this entry point: 169ms at 16 KB, 2.1s at 64 KB,
// 8.1s at 128 KB, with profiling attributing 1757 of ~1850 samples to two of
// them. `checkEmail` is the entry point behind forward-to-check, so the input is
// attacker-chosen by construction — the text is whatever was in the mail someone
// forwarded.
//
// ## What the rewrite must not lose
//
// The lookbehinds are load-bearing, and each was added for a measured false
// positive. An `.svg` in an `href` or `src` is an ordinary logo or tracking
// pixel, which is most of the mail this app is handed, and the three exclusions
// cover an absolute URL, a quoted attribute value, and an unquoted or
// root-relative one — the last of which the quoted pattern alone misses
// (`<img src=/assets/logo.svg>`). The benign half of the table below is those
// regressions, each one a flag a real marketing email used to get.

/** The rule's own row, identified the way a reader would. */
const SVG_FLAG = "SVG file attached";
/** The generic open-attachment row the dedup suppresses. */
const ATTACH_FLAG = "Attachment is presented as a document";

/**
 * One case per distinguishable path.
 *
 * `svgPoints` is asserted as its own column because 0 is the surprising value
 * and the one a rewrite is most likely to "fix". `attachRow` is what the dedup
 * decides.
 */
const cases: Array<{
  label: string;
  text: string;
  score: number;
  svgRow: boolean;
  attachRow: boolean;
}> = [
  // ── Fires: an attachment word or payload noun beside a .svg ──────────────
  //
  // Both orders for each, because the rule is four patterns — word-then-file
  // and file-then-word, for attachment words and for payload nouns — and a
  // rewrite that collapses them can silently drop one direction.
  {
    label: "attachment word before the file",
    text: "Please see the attached invoice.svg for your records.",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "file before the attachment word",
    text: "Your statement.svg is attached — open it to view the details.",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "download framing",
    text: "Download remittance-advice.svg to confirm the payment.",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "enclosed, file first",
    text: "invoice.svg is enclosed for your records",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "enclosed, word first",
    text: "Enclosed: payment-advice.svg",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "payload noun before the file",
    text: "Your receipt receipt-8821.svg",
    score: 20,
    svgRow: true,
    attachRow: true,
  },
  {
    label: "payload noun after the file",
    text: "detail.svg — your remittance advice",
    score: 20,
    svgRow: true,
    attachRow: true,
  },

  // ── The dedup, which is the arithmetic half of this rule ─────────────────
  {
    label: "one file described twice — the generic charge is suppressed",
    text: "Please open the attached invoice.svg",
    // 25, not 45. Both rules match one file, and charging 20 + 25 landed it on
    // the likely_scam boundary by arithmetic rather than by evidence.
    score: 25,
    svgRow: true,
    attachRow: false,
  },
  {
    label: "two separate attachments — both charges stand",
    text: "Please open the attached remittance advice.\n\nSeparately, invoice.svg is attached.",
    // Locality, not a whole-text boolean: an email naming an attachment in one
    // paragraph and carrying a .svg in another describes two files, so
    // suppressing here would under-score a strictly worse email.
    score: 20,
    svgRow: true,
    attachRow: true,
  },

  // ── Silent: a .svg that is an asset reference, not an attachment ─────────
  //
  // Every one of these is a flag a real marketing email used to get. This is
  // the half the lookbehinds exist for, and the half a rewrite endangers.
  {
    label: "quoted absolute src",
    text: 'Thanks for subscribing!\n\n<img src="https://cdn.example.com/logo.svg" alt="logo">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "brand-kit chatter",
    text: "Our brand kit includes logo.svg and icon.svg in the shared drive.",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "tracking pixel",
    text: 'Footer: <img src="https://track.example.com/pixel.svg" width="1">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "the standard marketing header",
    text: 'View in browser <img src="https://e.co/l.svg">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "view this email in your browser",
    text: 'View this email in your browser <img src="https://cdn.co/logo.svg">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "see our new range",
    text: 'See our new range <img src="https://e.co/banner.svg">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "download the report, with an icon",
    text: 'Download the report <img src="https://e.co/icon.svg">',
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "bare 'file' as the trailing half",
    text: "Our logo.svg file lives in the shared drive.",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "bare 'document' as the trailing half",
    text: "The icon.svg document is in the brand kit.",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  // The unquoted and root-relative cases. The third lookbehind exists for
  // exactly these, and the quoted pattern alone misses all four.
  {
    label: "unquoted root-relative src",
    text: "<img src=/assets/logo.svg> your statement is ready",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "unquoted bare src",
    text: "<img src=logo.svg> see the statement below",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "quoted root-relative src",
    text: 'Footer <img src="/assets/logo.svg"> statement',
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "single-quoted root-relative src",
    text: "<img src='/img/pixel.svg'> your invoice is ready to view online",
    score: 0,
    svgRow: false,
    attachRow: false,
  },

  // ── Silent: cases that isolate ONE guard each ────────────────────────────
  //
  // Added after injections measured that most of the guards were unprotected:
  // deleting the absolute-URL exclusion, the end-anchors, the line scoping or
  // the payload window each changed nothing any test could see. Every case
  // above was covered by some *other* guard too, so each injection fell through
  // to a second net. These are the ones that flip.
  //
  // A bare absolute URL with no attribute, so only the scheme exclusion can
  // reject it — the quoted-attribute arm catches `src="https://…"` on its own,
  // which is why none of the cases above separated the two.
  {
    label: "bare absolute URL, payload noun in the path",
    text: "See https://cdn.example.com/invoice/logo.svg for details",
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "bare absolute URL, attachment word in the path",
    text: "See https://cdn.example.com/attached/logo.svg for details",
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "bare absolute URL after a payload noun",
    text: "Statement: https://e.co/statement-logo.svg",
    score: 10,
    svgRow: false,
    attachRow: false,
  },
  // The payload window is 20 and the attachment window 40, and the difference
  // is deliberate: a payload noun is weaker evidence, so it must sit closer.
  // Widening it to 40 made this ordinary sentence a phishing hit.
  {
    label: "payload noun further from the file than its window allows",
    text: "Your invoice is ready for you now logo.svg",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  // The cue must share a LINE with the file. The original patterns used `[^\n]`
  // for the gap, which made this true incidentally; it is load-bearing, because
  // the standard marketing header puts "View in browser" and a logo reference on
  // one line and the real body below. Scanning the whole text instead flags all
  // three of these.
  {
    label: "attachment word on the line above a loose token",
    text: "Please see the attached.\nlogo.svg",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "payload noun on the line above a loose token",
    text: "Your invoice.\nlogo.svg",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
  {
    label: "loose token on the line above a payload noun",
    text: "logo.svg\nYour invoice is ready.",
    score: 0,
    svgRow: false,
    attachRow: false,
  },
];

/**
 * Cases where a `.svg` is NOT in an attribute, although an attribute appears
 * earlier on the line.
 *
 * These pin the other direction of the asset-reference guard: it asks what sits
 * *immediately* before the token, so each shape is anchored at the end of the
 * slice with `$`. Unanchored, these two would be excluded — a real attachment
 * silently losing its flag because the email happened to contain an image
 * somewhere to its left, which is most HTML mail.
 *
 * Separate from the table because they FIRE, and they fire by the same
 * arithmetic as the dedup cases above, so they are asserted on the flag rather
 * than threaded through a score column that would need its own explanation.
 */
const firesDespiteEarlierAttribute = [
  'src="a.png" the attached invoice.svg',
  'src="a.png" your statement detail.svg',
];

const rowsWith = (
  r: { signals?: Array<{ text: string; points: number }> },
  needle: string,
) => (r.signals ?? []).filter((s) => s.text.includes(needle));

describe("SVG-attachment scoring, pinned before the pattern rewrite", () => {
  it.each(cases)("$label", ({ text, score, svgRow, attachRow }) => {
    const r = checkEmail(text, undefined, "AU");
    expect(r.score).toBe(score);

    const svg = rowsWith(r, SVG_FLAG);
    expect(svg).toHaveLength(svgRow ? 1 : 0);
    if (svgRow) {
      // Zero, and asserted because it is the surprising value: this row is
      // wording, and the points beside it belong to the generic rule. A rewrite
      // that gives it a weight of its own passes every other test here.
      expect(svg[0].points).toBe(0);
    }

    expect(rowsWith(r, ATTACH_FLAG)).toHaveLength(attachRow ? 1 : 0);
  });

  it.each(firesDespiteEarlierAttribute)(
    "still flags a real attachment when an image appears earlier on the line: %s",
    (text) => {
      const r = checkEmail(text, undefined, "AU");
      expect(rowsWith(r, SVG_FLAG)).toHaveLength(1);
    },
  );

  it("keeps the evidence summing to the score on every case", () => {
    // The dedup suppresses a charge rather than adding a negative row, so the
    // rows must still add up to what the reader is shown — and a rewrite that
    // suppresses by subtracting would pass the per-case assertions above.
    for (const { text } of cases) {
      const r = checkEmail(text, undefined, "AU");
      const summed = (r.signals ?? []).reduce((n, s) => n + s.points, 0);
      expect({ text, summed }).toEqual({ text, summed: r.score });
    }
  });
});
