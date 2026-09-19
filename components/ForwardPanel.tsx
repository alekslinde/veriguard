"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import { bold } from "@/lib/richText";

const INBOUND_ENABLED = process.env.NEXT_PUBLIC_INBOUND_ENABLED === "true";
const INBOUND_ADDRESS = process.env.NEXT_PUBLIC_INBOUND_ADDRESS ?? "check@veriguard.app";

/**
 * Set while the emailed verdict is unreliable, to say so before someone waits
 * on one that may not arrive.
 *
 * Separate from INBOUND_ENABLED, and deliberately not the same lever. Disabling
 * would hide the address entirely and lose the forwards that DO get answered,
 * along with the analysis every forward still receives. Saying "this may be
 * slow, here is the instant route" keeps the feature honest without withdrawing
 * it — the failure mode to avoid is someone forwarding a scam, hearing nothing,
 * and reading the silence as "probably fine".
 *
 * A flag rather than a hardcoded banner so it clears without a deploy.
 */
const REPLIES_DELAYED = process.env.NEXT_PUBLIC_INBOUND_DELAYED === "true";

function ForwardIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 17a9 9 0 0 1 9-9h6" />
      <path d="m15 4 4 4-4 4" />
    </svg>
  );
}

/**
 * Forward-to-us, lifted out of CheckFlow so it can stand beside the check box
 * as its own column rather than sitting underneath it inside the same card.
 *
 * It is not another way to fill in the box: you act in your MAIL APP, not on
 * this page, and the verdict comes back by email rather than appearing here.
 * Grouping it with the upload options implied an equivalence that misled, which
 * is why it keeps its own surface.
 *
 * There is no mailto here on purpose. A mailto opens a blank compose window,
 * but forwarding is an action on a message the user already has — no web API
 * can reach into a mailbox and do it. A button promising "Forward" that opens
 * an empty email is worse than no button, so the page does the one thing it
 * genuinely can (copy the address) and says plainly where the rest happens.
 *
 * Returns null when inbound mail is disabled, so callers can place it
 * unconditionally.
 */
export default function ForwardPanel() {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);

  if (!INBOUND_ENABLED) return null;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(INBOUND_ADDRESS);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard unavailable (older browser, insecure origin). The address is
      // rendered as selectable text beside the button, so there is still a way
      // through without it.
    }
  }

  return (
    // Fills its grid track rather than sizing to content, so the two cards end
    // level whatever this one is currently saying. The trailing note is pushed
    // to the bottom (mt-auto) so the slack lands there rather than as a gap
    // under the last box.
    <aside className="rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)] p-5 flex flex-col gap-3 h-full">
      <p className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
        <span className="shrink-0 text-[var(--faint)]">
          <ForwardIcon />
        </span>
        <span>{t("check.forward.heading")}</span>
      </p>
      <p className="text-sm text-[var(--text-dim)]">{t("check.forward.body")}</p>

      {/* Above the address, not below it: the point is to be read BEFORE
          someone forwards and starts waiting. role="status" rather than
          "alert" — it is a caveat on a working feature, not an error, and
          should not interrupt a screen reader mid-sentence.

          Deliberately NOT styled like the tracking-pixel warning below, though
          both are advisories. That one is permanent safety guidance; this is
          transient service status that gets deleted in days. Giving them the
          same amber treatment taught the eye to skim both, and the safety one
          is the one that must never be skimmed. Muted surface, no colour, and
          a rule down the side marks it as an aside on the feature rather than
          a hazard in the message. */}
      {REPLIES_DELAYED && (
        <p
          role="status"
          className="text-xs leading-relaxed text-[var(--text-dim)] bg-[var(--ink)] border-l-2 border-[var(--faint)] rounded-r-md pl-3 pr-3 py-2"
        >
          {bold(t("check.forward.delay"))}
        </p>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-[var(--rule)] bg-[var(--ink)] px-3 py-2">
        {/* Selectable text, so the address is usable even when the clipboard
            API isn't. */}
        <code className="flex-1 min-w-0 truncate text-sm text-[var(--clear)] select-all">
          {INBOUND_ADDRESS}
        </code>
        <button
          type="button"
          onClick={copyAddress}
          className="shrink-0 rounded-md border border-[var(--rule)] px-2.5 py-1 text-xs font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
        >
          {copied ? t("check.forward.copied") : t("check.forward.copy")}
        </button>
      </div>

      {/* The app flags tracking pixels as a red flag, so it must not tell people
          to trigger one. Opening a scam email loads its pixel and confirms the
          address is live; forwarding from the message list doesn't. Guidance,
          not a prerequisite — someone who already opened it still needs the
          check. */}
      <p className="text-xs text-[var(--caution)] bg-[var(--caution)]/10 border border-[var(--caution)]/35 rounded-lg px-3 py-2">
        {bold(t("check.forward.noopen"))}
      </p>

      <p className="text-[11px] text-[var(--faint)] mt-auto">{t("check.forward.note")}</p>
    </aside>
  );
}
