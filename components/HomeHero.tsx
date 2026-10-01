"use client";

import { useLang } from "@/lib/lang";
import { accent } from "@/lib/richText";
import StatsBar from "./StatsBar";

/**
 * The head above the check box.
 *
 * TWO TITLES, ONE COMPONENT, chosen by width — because the two widths are
 * answering different questions.
 *
 * A desktop reader arrives with the whole page in view and no urgency the
 * layout can see. There is room above the fold for a headline, and removing it
 * left the screen opening on an unlabelled textarea with 500px of empty space
 * beside it — which reads as a broken page, not a focused one. Desktop gets the
 * full headline it always had.
 *
 * A phone reader is holding the suspicious message. The same headline at
 * clamp(28px,5vw,50px) put the paste box ~300px down, below the fold, on the
 * device most likely to need it first. So the phone gets a short title — one
 * line, small, enough to say which app this is and what it does — and the box
 * directly under it.
 *
 * Both are rendered, one is hidden. `sm:hidden` / `hidden sm:block` rather than
 * a JS width check: the server cannot know the viewport, and a hydration-time
 * swap would flash the wrong one. They are plain text, so rendering both costs
 * nothing — unlike the privacy caption, which owns a StatsBar and therefore
 * lives in its own component (see HomeCaption) so it can be placed once.
 */
export default function HomeHero() {
  const { t } = useLang();

  return (
    // Centred from sm, left-aligned on a phone.
    //
    // The box is the page's axis on a desktop, so a head left-aligned against
    // it reads as misaligned rather than as a column — the eye takes the
    // headline's left edge and the card's centre as two different verticals.
    // On a phone the card is the full width of the screen, so there is no axis
    // to centre on and a short title reads better ranged left, the way every
    // other page's header does.
    // A flex item in the stage's column (its wrapper is display:contents), so
    // this margin is the gap between the title and the card on a phone — where
    // the caption has moved below and nothing else separates them.
    <div className="mb-3 sm:mb-0 sm:text-center">
      {/* Phone: one short line. It is an <h1> because the page needs exactly
          one, and this is the visible name of the screen — the desktop
          headline below is the same heading at a different size, so only one
          of the two is ever visible. */}
      <h1 className="sm:hidden font-[family-name:var(--font-display)] font-semibold text-[20px] leading-tight tracking-[-0.015em] text-[var(--foreground)]">
        {accent(t("home.title.short"))}
      </h1>

      {/* Desktop: the full headline. It carries its own line break, so the
          break is part of the copy rather than a width accident. */}
      <h1 className="hidden sm:block font-[family-name:var(--font-display)] font-semibold text-[clamp(30px,3.6vw,44px)] leading-[1.08] tracking-[-0.02em] text-[var(--foreground)] text-balance">
        {t("home.title").split("\n").map((line, i) => (
          <span key={i} className="block">
            {accent(line)}
          </span>
        ))}
      </h1>
    </div>
  );
}

/**
 * The privacy promise and the counters.
 *
 * A separate export, and separate for a concrete reason: it owns a StatsBar,
 * which listens for `veriguard:check-complete` to refresh the counter the
 * reader just moved. Rendering it twice — once above the box for desktop, once
 * below for phones, with one hidden — would mount two listeners and paint the
 * same number in two places, one of them invisible. So it is placed ONCE, and
 * the page decides where: above the box from sm, under it on a phone.
 *
 * Why it moves at all: three lines of caption between the title and the paste
 * field is most of the distance to the fold on a 390px screen, spent on a
 * promise the reader has not asked for yet. Under the box it is the card's
 * footnote. Above it on a desktop, where there is room, it qualifies the
 * headline it follows.
 *
 * The claim is "scored against open-source rules", NOT "checked on your
 * device". Web checks call /api/check; on-device scoring is the extension's
 * property and belongs to its listing. Widening it here would restate a claim
 * true of one surface as a claim about the product — see StatsBar's own note
 * on the same trap.
 *
 * `stats` is required rather than optional, deliberately: an optional prop
 * would let a future caller render this bare, type-check cleanly, and silently
 * fall back to a client fetch with nothing failing. `null` says the server
 * tried and could not.
 */
export function HomeCaption({
  stats,
  className = "",
}: {
  stats: { checks: number; reports: number } | null;
  className?: string;
}) {
  const { t } = useLang();
  return (
    <p
      className={`text-[12px] sm:text-[13.5px] leading-[1.5] text-[var(--faint)] text-pretty ${className}`}
    >
      {t("home.privacy")}
      <StatsBar initial={stats} />
    </p>
  );
}
