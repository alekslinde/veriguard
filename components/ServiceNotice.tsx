"use client";

import { useState, useSyncExternalStore } from "react";
import { useLang } from "@/lib/lang";
import { bold } from "@/lib/richText";
import type { MessageKey } from "@/lib/i18n";

/**
 * Site-wide strip for the state of the service itself: maintenance, a degraded
 * feature, an incident being worked on.
 *
 * One notice, configured rather than coded. A future incident sets the env
 * vars and the strip appears on every page; unsetting them removes it. Nothing
 * about the affected feature needs editing, which is what keeps an outage
 * notice from becoming a scatter of bespoke banners that each have to be found
 * again when the incident ends.
 *
 * WHY NOT A STATUS COLOUR. The palette already assigns its two loud hues:
 * red belongs to a verdict about the user's message, amber to a statement
 * about our detection coverage (see VerdictBadge and CoverageNotice, which
 * spell this out). A service notice is neither — it is about our plumbing, and
 * borrowing either hue would make "we have a mail problem" look like a finding
 * about the thing they just pasted. So this runs on the neutral surface tokens
 * with a single small dot carrying the signal, and stays legible without
 * competing with anything that matters more.
 *
 * DISMISSAL is per-viewer and per-message. The key includes a hash of the body
 * text, so a NEW notice reappears for someone who dismissed the previous one —
 * a dismissal is "I have read this", not "never show me service notices". It
 * is stored in localStorage, which an artifact of this kind may not have
 * (private windows, blocked site data), so every access is guarded and a
 * failure simply means the strip shows.
 */

const ENABLED = process.env.NEXT_PUBLIC_SERVICE_NOTICE === "true";

/**
 * Which notice to show. A key into the message bundle rather than free text,
 * so the copy is translatable and reviewable like everything else the user
 * reads — and so an env var can never inject markup into the page.
 */
const NOTICE_KEY = (process.env.NEXT_PUBLIC_SERVICE_NOTICE_KEY ??
  "service.inboundDelayed") as MessageKey;

const STORAGE_PREFIX = "veriguard:service-notice:";

/** Nothing else in this tab writes the key, so there is nothing to subscribe to. */
const subscribeNever = () => () => {};

/** Cheap, stable identity for a string. Not security — just change detection. */
function fingerprint(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) {
    h = (h * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export default function ServiceNotice() {
  const { t } = useLang();
  const body = ENABLED ? t(NOTICE_KEY) : "";
  const storageKey = `${STORAGE_PREFIX}${fingerprint(body)}`;

  // Read during render, via useSyncExternalStore, rather than in an effect.
  //
  // Two constraints meet here. The server has no localStorage, so the value it
  // renders must come from a separate server snapshot or hydration mismatches.
  // And React 19 rejects setState called from an effect body, which rules out
  // the usual "read it after mount and set state" shape.
  //
  // useSyncExternalStore is built for exactly this: getServerSnapshot returns
  // the dismissed state the server must assume, getSnapshot reads the real
  // one on the client, and React reconciles them without a manual mount flag.
  // The subscribe callback is a no-op because nothing else in this tab writes
  // the key — dismissal re-renders through its own setState.
  const dismissed = useSyncExternalStore(
    subscribeNever,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === "dismissed";
      } catch {
        // No storage available. Showing is the safe failure: a notice that
        // cannot be dismissed is a much smaller problem than one that never
        // appears.
        return false;
      }
    },
    // The server cannot know, and rendering the strip there would make it
    // flash for someone who has already dismissed it. Hidden until the client
    // says otherwise.
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);

  if (!ENABLED || dismissed || dismissedNow) return null;

  function dismiss() {
    setDismissedNow(true);
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      // Dismissed for this page view only. Nothing else to do.
    }
  }

  return (
    // role="status" and aria-live="polite": this is a standing condition, not
    // an event needing interruption. A screen reader reaches it in document
    // order rather than being pulled out of whatever it was reading.
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[var(--rule)] bg-[var(--ink-2)]"
    >
      <div className="mx-auto max-w-[1180px] px-4 py-2.5 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-[0.35rem] h-2 w-2 shrink-0 rounded-full bg-[var(--faint)]"
        />
        <p className="flex-1 min-w-0 text-xs leading-relaxed text-[var(--text-dim)]">
          {bold(body)}
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("service.dismiss")}
          className="shrink-0 -mr-1 rounded-md px-2 py-0.5 text-xs text-[var(--faint)] hover:text-[var(--foreground)] transition-colors"
        >
          {/* A glyph, not an icon font: one character that renders the same
              everywhere and needs no asset. The accessible name is on the
              button. */}
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </div>
  );
}
