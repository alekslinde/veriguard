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
 *
 * COLLAPSED BY DEFAULT, and that is a space decision with a reason. Open, this
 * panel measured 326px on a phone against the paste box's 136px — the secondary
 * route rendering larger than the primary one, and on mobile stacked directly
 * under it, so everyone scrolling to the box scrolled through a fully dressed
 * alternative to it first. Six elements (heading, body, address, copy button, a
 * bordered warning, a footnote) to say "or email it to this address".
 *
 * A <details> keeps every one of them one click away and costs a single row
 * until someone wants it. The tracking-pixel warning is the part that most
 * deserved the scrutiny, and it loses nothing: it matters once you have decided
 * to forward, which is exactly when this is open.
 *
 * Native <details> rather than state, for the same reasons Collapsible gives —
 * keyboard support, screen-reader semantics, and find-in-page opening it to
 * reveal a match. The chevron is the shared one, so it reads as the same control
 * as every other disclosure in the app.
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
    // `id` so anything can link straight to the forwarding instructions rather
    // than restating the address — it is configured in one place, and a second
    // copy elsewhere is the one that goes stale after a change here.
    // `scroll-mt` keeps the heading clear of the sticky header on arrival.
    //
    // `open:` styling rather than a permanent card: closed, this is one row in
    // the page's own ground, so it reads as an aside to the check box. Opened,
    // it takes the card surface and border that its content needs to hold
    // together.
    <details
      id="forward"
      className="group scroll-mt-24 rounded-xl border border-[var(--rule)] open:bg-[var(--ink-2)] transition-colors"
    >
      <summary className="flex items-center gap-2.5 px-3.5 py-3 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden rounded-xl hover:bg-[var(--ink-2)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)]">
        <span className="shrink-0 text-[var(--faint)]">
          <ForwardIcon />
        </span>
        <span className="flex-1 min-w-0 text-sm font-semibold text-[var(--foreground)]">
          {t("check.forward.heading")}
        </span>
        {/* The payoff, on the closed row: without it the summary asks a question
            and promises nothing, and the reason to open it is precisely that a
            reply comes back. Hidden on the narrowest phones, where the heading
            alone already fills the row. */}
        <span className="hidden sm:inline shrink-0 text-[13px] text-[var(--text-dim)]">
          {t("check.forward.body")}
        </span>
        <svg
          className="shrink-0 w-[16px] h-[16px] text-[var(--faint)] transition-transform duration-200 group-open:rotate-180"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      {/* Padding lives here, not on <details>: a closed <details> renders only
          its summary, so this never affects the collapsed height. */}
      <div className="px-3.5 pb-3.5 flex flex-col gap-3">
        {/* On a phone the summary drops the payoff line for width, so it is
            restated here — opening the panel must not be the first time the
            reader learns what forwarding actually gets them. */}
        <p className="sm:hidden text-sm text-[var(--text-dim)]">{t("check.forward.body")}</p>

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

        {/* The app flags tracking pixels as a red flag, so it must not tell
            people to trigger one. Opening a scam email loads its pixel and
            confirms the address is live; forwarding from the message list
            doesn't. Guidance, not a prerequisite — someone who already opened it
            still needs the check.
            Keeps its caution styling: it is only ever on screen once the reader
            has opened this panel, so it no longer competes with the check box
            for attention the way it did when the panel was always open. */}
        <p className="text-xs text-[var(--caution)] bg-[var(--caution)]/10 border border-[var(--caution)]/35 rounded-lg px-3 py-2">
          {bold(t("check.forward.noopen"))}
        </p>

        <p className="text-[11px] text-[var(--faint)]">{t("check.forward.note")}</p>
      </div>
    </details>
  );
}
