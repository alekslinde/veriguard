"use client";

// The four ways into the detection engine, as cards.
//
// One component rather than two, because the homepage strip and the /ways page
// are the same four things at different densities — and when a fifth arrives,
// or a store listing goes live, a second copy would be the one nobody updates.
// `compact` picks the density.

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

/** Marks which surfaces never transmit what you are checking. */
function RunsBadge({ way }: { way: WayIn }) {
  const { t } = useLang();
  // Only the on-device surfaces get a badge. Labelling the server-side ones
  // "server" too would read as a warning next to the primary action, when the
  // actual claim — content is scored and not kept — is already in the card's
  // privacy line. A badge earns its place by marking the exception.
  if (way.runs !== "device") return null;
  return (
    <span className="shrink-0 rounded-md border border-[var(--clear)]/35 bg-[var(--clear)]/10 px-2 py-0.5 font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.08em] text-[var(--clear)]">
      {t("ways.badge.onDevice")}
    </span>
  );
}

function Card({ way, compact }: { way: WayIn; compact: boolean }) {
  const { t } = useLang();
  const href = hrefFor(way);
  const external = Boolean(href && href.startsWith("http"));

  const body = (
    <>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-[var(--foreground)] text-[15px]">{t(way.name)}</h3>
        <RunsBadge way={way} />
      </div>
      <p className="mt-1.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
        {t(way.audience)}
      </p>
      {!compact && (
        <>
          <p className="mt-2.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
            {t(way.how)}
          </p>
          {/* Privacy per surface, not once for the page: what happens to your
              message genuinely differs between forwarding an email and running
              the engine in your own process, and a single global claim would
              have to be either vague or wrong for two of the four. */}
          <p className="mt-2.5 text-[13px] text-[var(--faint)] leading-relaxed">
            {t(way.privacy)}
          </p>
        </>
      )}
      <p className="mt-3 text-[13.5px] font-semibold text-[var(--clear)]">
        {href ? (
          <>
            {t(way.cta)}
            <span aria-hidden="true"> →</span>
          </>
        ) : (
          // No listing for any browser yet. Says so rather than rendering a
          // link to nowhere.
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

export default function WaysGrid({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          : "grid gap-4 sm:grid-cols-2"
      }
    >
      {WAYS_IN.map((way) => (
        <Card key={way.id} way={way} compact={compact} />
      ))}
    </div>
  );
}
