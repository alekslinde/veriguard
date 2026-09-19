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

      {/* Two columns while both are real options; one once the verdict exists.
          The check box takes the wider track: it is the primary action and the
          textarea needs the room. Forwarding is a narrow panel because it is
          three lines and an address.

          Keyed so React reconciles this by identity rather than by position.
          The strip and the notices above it are conditional, so the number of
          preceding siblings changes when a check runs — and matched by index
          the grid is reconciled against a different element, tearing down
          CheckFlow and taking its state with it. That emptied the box, so
          "Edit & check again" returned to a blank textarea instead of the
          message the reader had just checked. */}
      <div
        key="stage-grid"
        className={
          done
            ? "grid gap-5"
            : forward
              // 1fr/1fr rather than 1.15/0.85, and stretched rather than
              // top-aligned. The panel beside the box grows and shrinks with
              // what it has to say — a service notice appears, the
              // tracking-pixel warning wraps differently at each width — so a
              // split tuned against one of those states comes apart in the
              // others, and top-alignment left one card floating against the
              // other's lower edge. Equal columns that stretch stay square
              // across every combination, and the box is still a comfortable
              // measure to paste into at half the container.
              ? "grid gap-5 lg:grid-cols-2 lg:items-stretch"
              // Without a forwarding panel beside it the box would otherwise
              // stretch the full container, and a textarea spanning 1180px is
              // worse to paste into than one at a readable width.
              : "grid gap-5 max-w-[760px]"
        }
      >
        {/* Not capped once the fold has collapsed. The cap existed when the
            verdict was one column of prose — 1180px of unbroken text runs to
            ~140 characters a line. The results now split into an evidence sheet
            and a tactics rail, which divide the width between them, so each
            column lands at a readable measure on its own and the old 860px cap
            only starved both. */}
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

      {!done && belowFold}
    </>
  );
}
