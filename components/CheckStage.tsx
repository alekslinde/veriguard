"use client";

// The check box, and what happens around it once a check runs.
//
// Before this, the check flow swapped its input for the verdict *inside its own
// column*, which left the verdict in the narrower of two tracks with ~470px of
// dead space beside it. The verdict is the payoff of the entire product and it
// was rendering in half a page.
//
// So the stage owns the layout rather than the flow, and the input collapses to
// a one-line record of what was checked. That record is not decoration — without
// it the reader has no way to confirm the thing on screen is a verdict about the
// thing they pasted, and "check the right message" is precisely the anxiety this
// product exists to answer.
//
// Why a wrapper and not a prop on CheckFlow: the blocks the stage retires on a
// verdict are CheckFlow's siblings, not its children, so nothing inside the flow
// can hide them. Lifting just the step here keeps CheckFlow owning everything
// else about the check.

import { useState, type ReactNode } from "react";
import CheckFlow, { type CheckStep } from "@/components/CheckFlow";
import { useLang } from "@/lib/lang";

/** Collapse a checked message to one line: whitespace flattened, and trimmed. */
function summarise(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export default function CheckStage({
  initialContent,
  surface = "web",
  children,
  below,
  after,
}: {
  /** Seeds the check box — used by the share target. */
  initialContent?: string;
  surface?: "web" | "share";
  /** Rendered above the box on the input step only (the share truncation notice). */
  children?: ReactNode;
  /**
   * Rendered directly under the box on the input step only — the privacy
   * caption.
   *
   * Under, not above, and that is the whole point of the slot. The caption is
   * what the homepage's headline became when the box moved to the top of the
   * screen: it qualifies the thing the reader is about to use, so it reads
   * after it rather than delaying it. Anything placed above the card pushes the
   * product's one job further down the phone screen, which is the regression
   * this arrangement exists to prevent.
   *
   * Input step only, because once a verdict is on screen the caption is
   * answering a question nobody is asking any more — and the verdict carries
   * its own provenance line.
   */
  below?: ReactNode;
  /**
   * Rendered last, on every step — the ways-in rows and the threat radar.
   *
   * On every step deliberately. There used to be a second slot that retired
   * with the input, on the reasoning that background material belonged to the
   * question rather than the answer; the radar sat in it and vanished the
   * moment a verdict arrived, which is when someone told "this looks clean"
   * most wants to know what is going around.
   *
   * Passed through the stage rather than placed after it in the page so it
   * shares the stage's width: the input step caps at a readable measure, and a
   * full-width strip underneath a 760px column left the page with two different
   * right edges.
   */
  after?: ReactNode;
} = {}) {

  const { t } = useLang();
  const [step, setStep] = useState<CheckStep>("input");
  // What the last check was run against. Held here rather than read from
  // CheckFlow's textarea so it survives the flow re-rendering, and so the strip
  // shows what was *checked* rather than whatever the box currently holds.
  const [checked, setChecked] = useState("");

  const done = step !== "input";

  return (
    <>
      {/* The record of what was checked. Shown only once there is something to
          record, and it sits above the results because it is the question the
          verdict below is answering. */}
      {done && checked && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] px-3.5 py-2.5">
          <span className="font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium uppercase tracking-[0.1em] text-[var(--faint)] shrink-0">
            {t("check.checked")}
          </span>
          {/* min-w-0 is what lets the ellipsis happen: a flex item defaults to
              min-width:auto, so without it the nowrap text pushes the row wider
              than the container instead of being clipped inside it. */}
          <span
            className="flex-1 min-w-0 basis-[260px] font-[family-name:var(--font-mono-ui)] text-[13px] text-[var(--text-dim)] whitespace-nowrap overflow-hidden text-ellipsis"
            title={checked}
          >
            {checked}
          </span>
          {/* history.back() rather than a state reset, so this and the browser's
              own Back button do the same thing — CheckFlow mirrors every step
              into history and treats it as the source of truth for going back. */}
          <button
            type="button"
            onClick={() => history.back()}
            className="shrink-0 rounded-lg border border-[var(--rule)] px-3 py-1.5 text-[13px] text-[var(--foreground)] hover:border-[var(--ink-3)] hover:bg-[var(--ink-3)] transition-colors"
          >
            {t("check.back.edit")}
          </button>
        </div>
      )}

      {/* Notices belong to the input, so they go when it does. */}
      {!done && children}

      {/* The cap applies on the input step only, and everything on that step
          shares it: a full-width strip under a 760px column gives the page two
          different right edges. The verdict that replaces the input is not
          capped — it splits into an evidence sheet and a tactics rail, which
          divide the width between them, so each lands at a readable measure on
          its own and a cap only starves both.

          This was a two-column grid while the forwarding panel stood beside the
          box; that panel is one of the ways-in rows now, so there is nothing to
          sit alongside.

          Keyed so React reconciles this by identity rather than by position.
          The strip and the notices above it are conditional, so the number of
          preceding siblings changes when a check runs — and matched by index
          this is reconciled against a different element, tearing down CheckFlow
          and taking its state with it. That emptied the box, so "Edit & check
          again" returned to a blank textarea instead of the message the reader
          had just checked. */}
      <div key="stage-grid" className={done ? "min-w-0" : "min-w-0 max-w-[760px]"}>
        <CheckFlow
          initialContent={initialContent}
          surface={surface}
          onStepChange={setStep}
          onChecked={(c) => setChecked(summarise(c))}
        />
        {/* Inside the capped wrapper, so the caption tracks the card's right
            edge instead of running to the full 1180px container. It sits in the
            same element as the card rather than after it because it is the
            card's own footnote — see the `below` prop.

            HIDDEN, NOT UNMOUNTED, and that distinction is load-bearing. This
            slot holds the home page's StatsBar, which listens for
            `veriguard:check-complete` to refresh the counter the reader just
            moved. Unmounting on `done` tore that listener down at exactly the
            moment the event fires, so the one person guaranteed to notice a
            stale number — the one who just changed it — was the one guaranteed
            to see it. Measured: 413 before a check, still 413 after, and 414
            only after a remount re-read the server.

            Same reasoning as CheckFlow's textarea, which is hidden rather than
            unmounted across the swap for its own state's sake.

            aria-hidden with it, so the caption is not announced while a verdict
            is on screen: it is a footnote on the input, and the verdict carries
            its own provenance line. */}
        {below && (
          <div className={done ? "hidden" : "mt-2.5"} aria-hidden={done || undefined}>
            {below}
          </div>
        )}
      </div>

      {/* Capped on every step, including the one where the stage above is not:
          the verdict wants the full width, but an aside stretched to 1180px
          reads as a banner rather than a footnote. space-y rather than a gap on
          the parent, because this holds two sections and they need separating
          from each other as well as from the box.

          `contents` when there is nothing to show, rather than a truthiness
          guard on `after`. Callers pass a Fragment — always truthy, so the
          guard never fired — and its children can still each render null (the
          radar does outside AU), which left an empty spacer div under the
          verdict. Display:contents removes the box from layout without the
          caller having to know whether its own children rendered.

          The wrapper is not conditional on `done`. Both sections survive a
          check by design: see the note on `after` above. */}
      <div className={after ? "max-w-[760px] space-y-6 empty:contents" : "contents"}>
        {after}
      </div>
    </>
  );
}
