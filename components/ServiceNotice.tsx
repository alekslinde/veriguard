"use client";

import { useState, useSyncExternalStore } from "react";
import { useLang } from "@/lib/lang";
import { bold } from "@/lib/richText";
import type { MessageKey } from "@/lib/i18n";
import enNormal from "@/messages/en.normal.json";

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
 * DISMISSAL is per-viewer and per-notice. The key carries a revision plus a
 * hash of the body text, so a NEW notice — or a re-raised one, via the
 * revision — reappears for someone who dismissed the previous one. A dismissal
 * is "I have read this", not "never show me service notices". It is stored in
 * localStorage, which a browser may not provide (private windows, blocked site
 * data), so every access is guarded and a failure simply means the strip
 * shows.
 */

const ENABLED = process.env.NEXT_PUBLIC_SERVICE_NOTICE === "true";

const DEFAULT_KEY = "service.inboundDelayed";

/**
 * Which notice to show. A key into the message bundle rather than free text,
 * so the copy is translatable and reviewable like everything else the user
 * reads — and so an env var can never inject markup into the page.
 *
 * Checked against the bundle rather than cast. `translate` falls back to
 * returning the key itself when it resolves to nothing, so a typo'd or renamed
 * variable would print the literal "service.inboundDelyed" across every page —
 * failing loudest at exactly the moment the notice matters. An unknown key
 * falls back to the default notice instead, and a misconfiguration costs the
 * right wording rather than the whole page.
 */
export function resolveNoticeKey(configured: string | undefined): MessageKey {
  const key = configured ?? DEFAULT_KEY;
  return (key in (enNormal as Record<string, string>) ? key : DEFAULT_KEY) as MessageKey;
}

const NOTICE_KEY = resolveNoticeKey(process.env.NEXT_PUBLIC_SERVICE_NOTICE_KEY);

const STORAGE_PREFIX = "veriguard:service-notice:";

/**
 * Bumped by hand to re-raise a notice whose wording has not changed.
 *
 * The dismissal key fingerprints the body, so re-enabling an incident that
 * someone already dismissed would stay hidden for exactly the people it
 * affected last time. Changing this makes the strip reappear for everyone
 * without touching the copy.
 */
const NOTICE_REVISION = process.env.NEXT_PUBLIC_SERVICE_NOTICE_REVISION ?? "1";

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
  const storageKey = `${STORAGE_PREFIX}${NOTICE_REVISION}:${fingerprint(body)}`;

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
    // Deliberately NOT a live region. This is a standing condition that is
    // present from the moment the page renders, not something that happens
    // while the reader is on it — and because the strip mounts after
    // hydration, a role="status"/aria-live region here would be empty through
    // the first paint and gain content immediately after. Assistive technology
    // reads that as an update and announces it on every single page view,
    // interrupting whatever was being read, which is the opposite of what a
    // polite live region is for.
    //
    // As a plain landmark it is reached in document order, right after the
    // header, and read once like any other content.
    <aside
      aria-label={t("service.label")}
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
    </aside>
  );
}
