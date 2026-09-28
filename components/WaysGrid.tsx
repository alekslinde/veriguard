"use client";

// The ways to take the checker with you, as two rows.
//
// There used to be a /ways page and a home-page strip of the same four cards,
// and the strip repeated the two things already on the fold — one card linked
// to the page it sat on. Cutting to the two surfaces a reader cannot see from
// here left a set small enough to state in place, so the page retired; cutting
// those from cards to rows left a section that reads as the aside it is rather
// than a second offer competing with the check box.

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

  // One row, not a card.
  //
  // These were cards of four paragraphs on a page of their own, then cards of
  // one paragraph here. At 456px on a phone the section was still 24% of the
  // page — a quarter of the primary surface spent on content whose own framing
  // is "for later". A row states the same thing in a line: what it is, what it
  // costs you to get it, and whether it is available.
  const body = (
    <>
      <span className="flex-1 min-w-0">
        <span className="font-semibold text-[var(--foreground)] text-[14.5px]">
          {t(way.name)}
        </span>
        <span className="text-[var(--text-dim)] text-[13.5px]"> — {t(way.how)}</span>
      </span>

      {/* Right-aligned and never wrapping: the two rows' statuses line up, so
          "which of these can I actually get" is one glance down the edge rather
          than a hunt through two paragraphs. */}
      <span className="shrink-0 text-[13px] font-semibold self-start sm:self-center">
        {pending ? (
          <span className="text-[var(--faint)] font-normal">{t(way.unavailable!)}</span>
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
      </span>
    </>
  );

  // Rows in one bordered group rather than two separate cards: two of anything
  // side by side reads as a choice between them, and these are not alternatives
  // — most people want neither, and anyone who wants one knows which.
  const shell =
    "flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3 transition-colors";

  if (!href) return <div className={shell}>{body}</div>;

  return external ? (
    <a
      className={`${shell} hover:bg-[var(--ink-2)]`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {body}
    </a>
  ) : (
    <Link className={`${shell} hover:bg-[var(--ink-2)]`} href={href}>
      {body}
    </Link>
  );
}

export default function WaysGrid() {
  return (
    <div className="rounded-xl border border-[var(--rule)] divide-y divide-[var(--rule)] overflow-hidden">
      {WAYS_IN.map((way) => (
        <Card key={way.id} way={way} />
      ))}
    </div>
  );
}
