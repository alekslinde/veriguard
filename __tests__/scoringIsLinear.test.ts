// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";

// Scoring cost grows with the length of the input, not with its square.
//
// Every entry point here scores attacker-supplied text: `/api/check` takes a
// paste from a request, the WebExtension scores in the user's browser, and the
// inbound-email worker scores whatever was forwarded to it. A pattern that
// backtracks turns any of those into a CPU exhaustion with one message, and
// nothing else in this suite would notice — the verdict is correct, just slow.
//
// Found by CodeQL on a forwarding-scaffold pattern, as `js/polynomial-redos`,
// and confirmed by measurement rather than taken on the tool's word:
// `"12:34" + " "*n + "-" + " "*n` through `checkSms` took 326ms at 4 KB, 1.4s at
// 8 KB and 5s at 16 KB — four times the work for twice the input. The pattern
// was a chat-export line whose middle was `.*?` ahead of an optional `\]?` and
// two `\s*`, so on a line whose trailing `:` never arrived, every way of
// splitting the run of spaces was retried. Bounding the middle and excluding the
// separator from it leaves exactly one way to split a candidate line.
//
// The alert named a file this change had only MOVED the pattern into, so the
// same line sits unflagged on the default branch at its old path. It was a real
// defect either way, which is the argument for measuring rather than triaging on
// where a tool points.
//
// ## Why this asserts a ratio and not a duration
//
// A wall-clock threshold ("under 100ms") measures the machine: it fails on a
// loaded CI runner and passes on a fast laptop with the defect present. The
// ratio between two sizes is the property that actually distinguishes linear
// from quadratic, and it is what survives being run anywhere.
//
// Generous bounds, deliberately. Quadratic at these sizes is a factor of ~16
// across a 4× length increase; linear is ~4. The gate sits at 8, which no
// timing noise reaches from below and no polynomial blowup escapes from above.
// A tighter bound would buy nothing and start failing for reasons that are not
// defects.

/**
 * Inputs built to maximise backtracking against the forwarding and header
 * scaffolding, which is the code that inspects the START of a message and so
 * the code with the most alternatives to try.
 *
 * Each is a line that *begins* like something on the scaffold list and then
 * never completes it — the shape that makes an engine exhaust every split
 * before failing. A string that matches cleanly is fast; the adversarial case
 * is the near-miss.
 */
const adversarial: Array<{ label: string; build: (n: number) => string }> = [
  {
    // The measured case. Opens like a chat-export timestamp, carries two long
    // runs of whitespace around a separator, and has no trailing colon.
    label: "chat-export prefix with no closing colon",
    build: (n) => "12:34" + " ".repeat(n) + "-" + " ".repeat(n) + "x",
  },
  {
    label: "bracketed chat-export prefix, unclosed",
    build: (n) => "[12:34" + " ".repeat(n) + "-" + " ".repeat(n) + "x",
  },
  {
    // Header-shaped, with the whitespace the header pattern's `\s*` can absorb.
    label: "header-shaped line that never resolves",
    build: (n) => "From" + " ".repeat(n) + ":" + " ".repeat(n),
  },
  {
    // The forwarded-message marker, which has two `-{2,}` runs and `\s*`
    // between them, and must end at `$`.
    label: "forwarded-message marker that never terminates",
    build: (n) => "--" + " ".repeat(n) + "forwarded message" + " ".repeat(n),
  },
  {
    // Many scaffold-shaped lines rather than one long one, so the per-line loop
    // and its cap are exercised too.
    label: "many near-miss scaffold lines",
    build: (n) => Array.from({ length: Math.floor(n / 10) }, () => "Note: x").join("\n"),
  },
];

/** Median of three runs, so one scheduling hiccup does not decide the result. */
function medianMs(run: () => void): number {
  const samples = [0, 1, 2].map(() => {
    const t0 = performance.now();
    run();
    return performance.now() - t0;
  });
  return samples.sort((a, b) => a - b)[1];
}

const SMALL = 2_000;
const LARGE = 8_000;
/** 4× the input. Linear is ~4× the work, quadratic ~16×. */
const MAX_GROWTH = 8;
/** Below this, the ratio is measuring timer noise rather than the algorithm. */
const FLOOR_MS = 2;

// `checkEmail` is deliberately absent, and it is absent because it FAILS.
//
// It carries a second, unrelated polynomial blowup that predates this file: the
// four SVG-attachment patterns each use three variable-length lookbehinds
// (`{0,200}`), re-evaluated at every position in the text. Measured from source
// on the same inputs — 169ms at 16 KB, 2.1s at 64 KB, 8.1s at 128 KB — and
// confirmed by profiling, where those two patterns take 1757 of ~1850 samples
// while the pattern this file was written for takes 75.
//
// Not fixed here. Those patterns have a documented false-positive history (an
// `.svg` in an `href`/`src` is an ordinary marketing-email logo, which is most
// of the mail this app is handed), so rewriting them needs its own pin and its
// own measurement, and folding a second security fix into a refactor is what
// makes the refactor hard to verify. Listing the entry point here and letting it
// fail would make the ratio assertion read as this change's problem.
//
// **The gap is named rather than silently narrowed**, because a test file that
// quietly covers two of three entry points is the "partial check reporting a
// clean sweep" shape. `checkEmail` joins this list when those patterns are
// fixed, and the last case below asserts the one property that does hold for it
// today.
const entryPoints: Array<[string, (t: string) => unknown]> = [
  ["checkSms", (t) => checkSms(t, undefined, "AU")],
  ["checkCustom", (t) => checkCustom(t, undefined, "AU")],
];

describe("scoring cost grows linearly in the length of the input", () => {
  for (const [name, check] of entryPoints) {
    it.each(adversarial)(`${name} — $label`, ({ build }) => {
      const small = medianMs(() => check(build(SMALL)));
      const large = medianMs(() => check(build(LARGE)));

      // Too fast to measure is a pass: the defect this guards against is not
      // subtle at these sizes — it was 5 seconds — so an unmeasurably quick
      // result cannot be hiding it.
      if (large < FLOOR_MS) return;

      const growth = large / Math.max(small, 0.05);
      expect(
        growth,
        `${name} took ${small.toFixed(1)}ms at ${SMALL} chars and ${large.toFixed(1)}ms at ${LARGE} — ${growth.toFixed(1)}× for 4× the input, which is superlinear`,
      ).toBeLessThan(MAX_GROWTH);
    });
  }

  it("scores a large adversarial input in a time a request can afford", () => {
    // The ratio test above cannot see a cost that is linear but enormous, so
    // one absolute bound, set loosely enough to be about the algorithm rather
    // than the machine. The pre-fix figure here was ~5s at a quarter of this
    // length.
    const text = "12:34" + " ".repeat(32_000) + "-" + " ".repeat(32_000) + "x";
    expect(medianMs(() => checkSms(text, undefined, "AU"))).toBeLessThan(2_000);
  });

  // The forwarding scaffolding is shared by every channel, so the fix above has
  // to hold on the email path too — even though that path has its own separate
  // blowup and so cannot be ratio-tested yet (see the note by `entryPoints`).
  //
  // Asserted at a size below where the SVG patterns dominate, which is what
  // makes this about the scaffolding rather than about them: at 4 KB the email
  // path matches the SMS path (19ms vs 18ms measured), and before the fix it was
  // seconds. A loose multiple of the SMS cost rather than a duration, so the
  // machine is divided out — and so this case starts failing if the scaffolding
  // regresses on email alone.
  it("does not reintroduce the scaffolding cost on the email path", () => {
    const text = "12:34" + " ".repeat(2_000) + "-" + " ".repeat(2_000) + "x";
    const sms = medianMs(() => checkSms(text, undefined, "AU"));
    const email = medianMs(() => checkEmail(text, undefined, "AU"));
    expect(
      email,
      `email took ${email.toFixed(1)}ms against SMS ${sms.toFixed(1)}ms on the same text`,
    ).toBeLessThan(Math.max(sms * 6, 100));
  });
});
