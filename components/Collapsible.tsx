// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import type { ReactNode } from "react";

// A card-styled disclosure: a heading you click to reveal its content.
//
// The Learn page's answer to the same wall-of-text problem the threat radar and
// scam calendar already solved — reference and secondary material collapses
// behind a summary instead of rendering in full, so the page opens on what
// matters rather than everything at once.
//
// Native <details>/<summary> rather than state: it brings keyboard support, the
// right screen-reader semantics, and find-in-page for free (a browser opens a
// closed <details> to reveal a Ctrl+F match), none of which a div-and-state
// version gets without work. The chevron is the same inline SVG ThreatCard and
// SeasonRow draw — a downward V, rotated 180° on open — so every disclosure in
// the app reads as the same control.
//
// The id lands on the <details> itself so a table-of-contents link can target
// it; LearnContent additionally opens the matching section on navigation, since
// scrolling to a collapsed header would otherwise hide the very content the link
// promised.
export default function Collapsible({
  id,
  title,
  defaultOpen = false,
  children,
}: {
  id?: string;
  /** The clickable heading. Rendered as an <h2> to keep the document outline. */
  title: string;
  /** Open on first paint. Reserve for content that is read, not consulted. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      open={defaultOpen}
      className="group scroll-mt-24 bg-[var(--ink-2)] border border-[var(--rule)] rounded-xl"
    >
      {/* marker:hidden + the webkit rule drop the platform triangle so the SVG
          chevron can sit on the right where the layout wants it. */}
      {/* The hover tint is on the CLOSED state only. A summary's bottom padding
          sits inside its tinted box, so on an open section the highlight ran to
          16px below the heading and the body began at exactly that edge — a hard
          colour boundary against the text it introduces. An open section does
          not need the affordance anyway: hover says "clickable", which matters
          while the section is a closed thing to open and reads as noise once it
          is a heading over its own content. */}
      <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden rounded-xl hover:bg-[var(--ink-3)]/50 group-open:hover:bg-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)]">
        {/* The display face at reading size, not a small uppercase label: these
            are section headings on a long page, and uppercase tracking is harder
            to scan the longer the string gets — several of these run to six
            words. */}
        <h2 className="font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug tracking-[-0.01em] text-[var(--foreground)]">
          {title}
        </h2>
        <svg
          className="shrink-0 w-[18px] h-[18px] text-[var(--faint)] transition-transform duration-200 group-open:rotate-180"
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
          its summary, so the body's padding never affects the collapsed height.
          pt-1 on top of the summary's own 16px — the summary's padding is inside
          its hover box and cannot be relied on to separate anything from what
          follows it. */}
      <div className="px-5 pt-1 pb-5">{children}</div>
    </details>
  );
}
