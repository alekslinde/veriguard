"use client";

// The fold: paste it, or forward it — and what happens to both once a check runs.
//
// Before this, the check flow swapped its input for the verdict *inside its own
// column*, which left the verdict in the narrower of two tracks with ~470px of
// dead space beside it, and left the forwarding panel sitting there offering an
// alternative to something the reader had already done. The verdict is the
// payoff of the entire product and it was rendering in half a page.
//
// So the stage owns the layout rather than the flow: two columns while there is
// a choice to make, one column once there isn't. The input collapses to a
// one-line record of what was checked, which is not decoration — without it the
// reader has no way to confirm the thing on screen is a verdict about the thing
// they pasted, and "check the right message" is precisely the anxiety this
// product exists to answer.
//
// Why a wrapper and not a prop on CheckFlow: the forwarding panel is CheckFlow's
// sibling, not its child, so nothing inside the flow can hide it. Lifting just
// the step here keeps CheckFlow owning everything else about the check.

import { useState, type ReactNode } from "react";
import CheckFlow, { type CheckStep } from "@/components/CheckFlow";
import ForwardPanel from "@/components/ForwardPanel";
import { useLang } from "@/lib/lang";

/** Collapse a checked message to one line: whitespace flattened, and trimmed. */
function summarise(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

export default function CheckStage({
  initialContent,
  surface = "web",
  forward = true,
  children,
  belowFold,
  after,
}: {
  /** Seeds the check box — used by the share target. */
  initialContent?: string;
  surface?: "web" | "share";
  /**
   * Whether to offer forwarding beside the box. False on the share target,
   * which is already the result of the reader choosing how to get content here.
   */
  forward?: boolean;
  /** Rendered above the box on the input step only (the share truncation notice). */
  children?: ReactNode;
  /**
   * Rendered below the stage on the input step only — the radar teaser.
   *
   * It lives in the page as CheckStage's sibling, so like the forwarding panel
   * nothing inside the flow can hide it, and it was still offering "here's what
   * is circulating" underneath a verdict about the very thing the reader had
   * just checked. Passing it through here lets the stage retire it along with
   * everything else that belongs to the question rather than the answer.
   */
  belowFold?: ReactNode;
  /**
   * Rendered last, on every step — the ways-in section.
   *
   * Unlike `belowFold` this survives a check, because it answers a different
   * moment: someone who has their verdict is exactly who might want the checker
   * somewhere other than this page. It is passed through the stage rather than
   * placed after it in the page so it shares the stage's width — the input step
   * caps at a readable measure, and a full-width strip underneath a 760px column
   * left the page with two different right edges.
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

      {/* One column, always.

          This was two side-by-side tracks while the forwarding panel was a card
          of comparable weight to the check box. It is now a single collapsed
          row, and a one-line disclosure given half the container reads as an
          empty column rather than an alternative — so the two stack, the box
          takes the readable measure it wants, and the row sits under it as the
          aside it actually is.

          The cap applies on the input step only, and everything on that step
          shares it: a full-width strip under a 760px column gives the page two
          different right edges. The verdict that replaces the input is not
          capped — it splits into an evidence sheet and a tactics rail, which
          divide the width between them, so each lands at a readable measure on
          its own and a cap only starves both.

          Keyed so React reconciles this by identity rather than by position.
          The strip and the notices above it are conditional, so the number of
          preceding siblings changes when a check runs — and matched by index
          the grid is reconciled against a different element, tearing down
          CheckFlow and taking its state with it. That emptied the box, so
          "Edit & check again" returned to a blank textarea instead of the
          message the reader had just checked. */}
      <div
        key="stage-grid"
        className={done ? "grid gap-5" : "grid gap-4 max-w-[760px]"}
      >
        <div className="min-w-0">
          <CheckFlow
            initialContent={initialContent}
            surface={surface}
            onStepChange={setStep}
            onChecked={(c) => setChecked(summarise(c))}
          />
        </div>
        {/* Unmounted rather than hidden once a check has run: it offers an
            alternative route to a verdict the reader now has, and leaving it on
            screen invites them to do the same work twice. */}
        {forward && !done && <ForwardPanel />}
      </div>

      {/* Both share the input step's measure, for the reason given on the grid
          above. `after` keeps it on the result step too: the stage goes full
          width there for the verdict, but a two-row aside stretched to 1180px
          reads as a banner rather than a footnote. */}
      {!done && belowFold && <div className="max-w-[760px]">{belowFold}</div>}
      {after && <div className="max-w-[760px]">{after}</div>}
    </>
  );
}
