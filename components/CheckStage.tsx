// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

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
  above,
}: {
  /** Seeds the check box — used by the share target. */
  initialContent?: string;
  surface?: "web" | "share";
  /** Rendered above the box on the input step only (the share truncation notice). */
  children?: ReactNode;
  /**
   * The page's own head — title, privacy line, counters — on the input step.
   *
   * It is a slot rather than markup in the page so the stage can retire it
   * when a verdict arrives: a headline saying "check before you click" over a
   * finished verdict is answering a question nobody is still asking, and the
   * verdict carries its own provenance line.
   *
   * HIDDEN, NOT UNMOUNTED, and that distinction is load-bearing. This slot
   * holds StatsBar, which listens for `veriguard:check-complete` to refresh
   * the counter the reader just moved. Unmounting on `done` tore that listener
   * down at exactly the moment the event fires, so the one person guaranteed
   * to notice a stale number — the one who just changed it — was the one
   * guaranteed to see it. Measured: 413 before a check, still 413 after.
   *
   * Same reasoning as CheckFlow's textarea, which is hidden rather than
   * unmounted across the swap for its own state's sake.
   */
  above?: ReactNode;
} = {}) {

  const { t } = useLang();
  const [step, setStep] = useState<CheckStep>("input");
  // What the last check was run against. Held here rather than read from
  // CheckFlow's textarea so it survives the flow re-rendering, and so the strip
  // shows what was *checked* rather than whatever the box currently holds.
  const [checked, setChecked] = useState("");

  const done = step !== "input";

  return (
    // The breakout lives here, on everything the stage renders, rather than on
    // the card alone — otherwise the "Checked:" strip stays at the input's
    // 760px while the verdict beneath it spans the page, which reads as two
    // columns that failed to line up.
    //
    // The page centres the stage at 760px, the right measure for a paste box
    // and too narrow for what replaces it: the verdict splits into an evidence
    // sheet and a tactics rail that divide the width between them, so a cap
    // starves both. A negative margin rather than the page widening itself,
    // because the page cannot know which step the stage is on — that state
    // belongs to the flow. It expands toward 1180px (the page's own container)
    // and stops, so the verdict never runs wider than the rest of the site,
    // and is bounded by the viewport on a phone where the margins clamp to 0.
    <div className={done ? "lg:-mx-[calc((min(1180px,100vw-4rem)-760px)/2)]" : ""}>
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

      {/* Keyed so React reconciles this by identity rather than by position.
          The strip and the notices above it are conditional, so the number of
          preceding siblings changes when a check runs — and matched by index
          this is reconciled against a different element, tearing down CheckFlow
          and taking its state with it. That emptied the box, so "Edit & check
          again" returned to a blank textarea instead of the message the reader
          had just checked. */}
      {/* A flex column holding the head and the card as SIBLINGS, which is what
          lets the caption inside `above` move below the box with `order-last`
          on a phone. Nested in a wrapper of its own they could not reorder
          across each other. */}
      <div key="stage-grid" className="min-w-0 flex flex-col">
        {/* The page head. `display: contents` so its children join THIS flex
            column rather than forming a row of their own — that is what puts
            the title and the caption in the same ordering context as the card.

            Hidden rather than unmounted on a verdict, because this slot holds
            StatsBar and unmounting would tear down its refresh listener at
            exactly the moment the check-complete event fires. aria-hidden with
            it, so a title about checking is not announced over a result. */}
        {above && (
          <div className={done ? "hidden" : "contents"} aria-hidden={done || undefined}>
            {above}
          </div>
        )}

        <CheckFlow
          initialContent={initialContent}
          surface={surface}
          onStepChange={setStep}
          onChecked={(c) => setChecked(summarise(c))}
        />
      </div>

    </div>
  );
}
