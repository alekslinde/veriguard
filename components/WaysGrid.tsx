"use client";

// The ways to take the checker with you, as cards.
//
// One density, one placement — the home page section. There used to be a
// separate /ways page and a compact home-page strip of the same four cards, and
// the strip repeated the two things already on the fold. Cutting to the two
// surfaces a reader cannot see from here left a set small enough to state fully
// in place, so the page it linked to had nothing left to add.

import Link from "next/link";
import { useLang } from "@/lib/lang";
import { WAYS_IN, type WayIn } from "@/lib/waysIn";
import { EXTENSION_LISTINGS } from "@/lib/extensionInstalls";

/**
 * Where the extension card points.
 *
 * Resolved here rather than stored in WAYS_IN, because it depends on which
 * listings are actually published — that is tracked in lib/extensionInstalls.ts
 * and changes when a store goes live, which must not require editing a second
 * file to keep a link working.
 *
 * Null when nothing is published anywhere. The card then states that rather
 * than offering a dead link, which is the honest rendering of "built but not
 * submitted" and avoids sending someone to a store page that 404s.
 */
function extensionHref(): string | null {
  return EXTENSION_LISTINGS.find((l) => l.url)?.url ?? null;
}

function hrefFor(way: WayIn): string | null {
  return way.id === "extension" ? extensionHref() : way.href;
}

function Card({ way }: { way: WayIn }) {
  const { t } = useLang();
  const href = hrefFor(way);
  const external = Boolean(href && href.startsWith("http"));

  // A surface that is built but not distributed. The card still renders in
  // full — it is real, and saying so is the point — but it leads with the
  // status rather than a call to action, and the link below it goes to what
  // actually exists today.
  const pending = Boolean(way.unavailable);

  const body = (
    <>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-[var(--foreground)] text-[15px]">{t(way.name)}</h3>
        {/* Only the on-device surfaces carry this. Labelling the server-side
            ones "server" too would read as a warning; a badge earns its place
            by marking the exception. */}
        {way.runs === "device" && (
          <span className="shrink-0 rounded-md border border-[var(--clear)]/35 bg-[var(--clear)]/10 px-2 py-0.5 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--clear)]">
            {t("ways.badge.onDevice")}
          </span>
        )}
        {pending && (
          <span className="shrink-0 rounded-md border border-[var(--rule)] px-2 py-0.5 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--faint)]">
            {t("ways.badge.soon")}
          </span>
        )}
      </div>
      {/* One paragraph, not three. The old /ways page gave each card an
          audience line, a how-it-works line and a privacy line, which is a
          page's worth of reading; stacked two-up under the check box it made
          the section taller than the four-card strip it replaced. The section
          lede carries the privacy claim for both, and the badge says it again —
          a third statement per card was the easiest thing on the page to cut. */}
      <p className="mt-1.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
        {t(way.how)}
      </p>

      <p className="mt-2.5 text-[13.5px] font-semibold">
        {pending ? (
          <>
            <span className="text-[var(--faint)] font-normal">{t(way.unavailable!)}</span>
            {href && way.fallbackCta && (
              <>
                {" "}
                <span className="text-[var(--clear)]">
                  {t(way.fallbackCta)}
                  <span aria-hidden="true"> →</span>
                </span>
              </>
            )}
          </>
        ) : href ? (
          <span className="text-[var(--clear)]">
            {t(way.cta)}
            <span aria-hidden="true"> →</span>
          </span>
        ) : (
          // Built, but no listing for any browser yet. Says so rather than
          // rendering a link to nowhere.
          <span className="text-[var(--faint)] font-normal">{t("ways.ext.unavailable")}</span>
        )}
      </p>
    </>
  );

  const shell =
    "block rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)] p-4 sm:p-5 h-full transition-colors hover:border-[var(--clear)]/50";

  if (!href) return <div className={shell}>{body}</div>;

  return external ? (
    <a className={shell} href={href} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    <Link className={shell} href={href}>
      {body}
    </Link>
  );
}

export default function WaysGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {WAYS_IN.map((way) => (
        <Card key={way.id} way={way} />
      ))}
    </div>
  );
}
