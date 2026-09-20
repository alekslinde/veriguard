"use client";

import { useState } from "react";
import { useLang } from "@/lib/lang";
import { bold } from "@/lib/richText";

const INBOUND_ENABLED = process.env.NEXT_PUBLIC_INBOUND_ENABLED === "true";
const INBOUND_ADDRESS = process.env.NEXT_PUBLIC_INBOUND_ADDRESS ?? "check@veriguard.app";


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
