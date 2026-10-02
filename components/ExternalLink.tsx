"use client";

// A link that leaves the site.
//
// Every external link in the app was built by hand, and they had drifted into
// five hover treatments, two glyphs (→ and ↗), one hardcoded English string
// where the rest use the message bundle, and no focus ring on any of them —
// so a keyboard user got whatever the browser drew by default while every
// other interactive surface in the app had an explicit one.
//
// Three things this guarantees, and each was missing somewhere:
//
//  1. `rel="noopener noreferrer"` with `target="_blank"`. Omitting noopener
//     hands the opened page a handle on this one; it is the kind of thing that
//     is correct in seven places and forgotten in the eighth.
//  2. The arrow is ↗, not →. They mean different things: ↗ is "this leaves",
//     → is "this continues". Mixing them teaches the reader nothing.
//  3. The destination is announced. The glyph is aria-hidden, because a screen
//     reader saying "north east arrow" is noise, so the information has to
//     arrive as text — hence the sr-only note, from the bundle so it
//     translates with everything else.
//
// `variant` exists because two shapes are both legitimate: prose links read as
// underlined text, and the card-shaped links on the Learn page and in WaysGrid
// are whole blocks whose border reacts instead. What does not vary is the
// arrow, the note, the rel, and the focus ring.

import { useLang } from "@/lib/lang";

/** The focus ring every other interactive surface in the app uses. */
const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--clear)] rounded-sm";

const VARIANTS = {
  /** Prose. The dominant treatment before this component existed. */
  text: `underline underline-offset-2 hover:text-[var(--clear)] transition-colors ${FOCUS}`,
  /** Prose, where the surrounding text is already dim and the link carries weight. */
  strong: `text-[var(--clear)] font-semibold hover:underline underline-offset-2 transition-colors ${FOCUS}`,
  /** A standalone action, as in the docs link lists. */
  action: `font-semibold text-[var(--clear)] hover:underline underline-offset-2 transition-colors ${FOCUS}`,
  /**
   * A secondary action beside something louder — the "npm" link next to a
   * package name, where `action`'s clear would compete with the name itself.
   *
   * It exists so that case stops being hand-rolled. It was `bare` plus a
   * className doing exactly this, which is how a component meant to end five
   * hover treatments grows a sixth: `bare` suppresses all styling, so every
   * caller reaching for it reinvents one.
   */
  quiet: `font-semibold text-[var(--text-dim)] hover:text-[var(--clear)] transition-colors ${FOCUS}`,
  /**
   * A card or row that is itself the link — the caller supplies the shell.
   *
   * For a link whose whole BOX is the control (an agency card, an install
   * button). Not an escape hatch for a prose link that wants a different
   * colour: that is what the variants above are for, and three callers used it
   * that way before this note existed.
   */
  bare: FOCUS,
} as const;

export type ExternalLinkVariant = keyof typeof VARIANTS;

export default function ExternalLink({
  href,
  children,
  variant = "text",
  className = "",
  arrow = true,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ExternalLinkVariant;
  className?: string;
  /**
   * Whether to draw the arrow inline after the label.
   *
   * Off for a card whose arrow belongs in its own corner rather than running on
   * from a heading — the new-tab note is still announced either way, because
   * that is the part a reader cannot see.
   */
  arrow?: boolean;
}) {
  const { t } = useLang();

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`${VARIANTS[variant]} ${className}`.trim()}
    >
      {children}
      <span className="sr-only"> ({t("a11y.newTab")})</span>
      {arrow && <span aria-hidden="true"> ↗</span>}
    </a>
  );
}
