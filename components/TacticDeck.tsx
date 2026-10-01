"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang, type MessageKey } from "@/lib/lang";
import { TACTIC_IDS, type TacticId } from "@/lib/signalTactics";

/**
 * The six tactics, as a swipeable deck instead of a list of paragraphs.
 *
 * WHY A DECK. These six are the page's core teaching and they were six stacked
 * paragraphs — ~130 words a reader meets as one block and skims. One card at a
 * time is ~22 words: a title, a real lure in the words it arrives in, and the
 * reason it works. The content did not need rewriting to fit, which is the
 * tell that a list was the wrong shape for it rather than the copy being too
 * long.
 *
 * The deck also matches what these ARE. They are six alternatives, not six
 * steps — nothing here is read in order or builds on the card before it — and
 * a horizontal set says that where a vertical list implies a sequence.
 *
 * ACCESSIBILITY IS NOT OPTIONAL HERE, and this component exists for readers
 * who are not confident online. So:
 *   - it is a scroll container, not a transform carousel: it works with no JS,
 *     with a trackpad, with a touch swipe, and with the keyboard's own
 *     scrolling before any of this component's code runs;
 *   - arrow keys move between cards, and the buttons are real buttons;
 *   - every card is always in the DOM and none is aria-hidden, so a screen
 *     reader or a find-in-page reads all six regardless of what is on screen;
 *   - `motion-safe` gates the smooth scroll, so a reduced-motion preference
 *     gets an instant jump instead;
 *   - the dots are a status readout, not controls — they are too small to be
 *     reliable tap targets, and the arrows and the swipe already cover it.
 *
 * It is NOT the only way to read these. The page renders the same six as a
 * plain list on a wide screen (see Tactics), because a deck is a phone
 * affordance and a desktop reader with room for all six should simply be given
 * all six.
 */

/**
 * Card width, applied inline on each card.
 *
 * It is not paired with a CSS rule and nothing derives a scroll position from
 * it — `offsetOf` measures the rendered cards instead, for the reason recorded
 * there. This is the single place the width is set, so changing it here is the
 * whole change.
 */
const CARD_W = 268;

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      className="w-[17px] h-[17px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

export default function TacticDeck() {
  const { t } = useLang();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  /**
   * The card the reader has asked for, which is not always the one on screen.
   *
   * `active` is derived from scrollLeft and only catches up once a smooth
   * scroll has travelled far enough — so stepping from it made two quick
   * presses advance ONE card: the second read the same stale value as the
   * first and re-targeted the card already being scrolled to. Measured: two
   * rapid Next taps landed at 300 (card 1) instead of 580 (card 2).
   *
   * A ref rather than state because it must be correct for the very next
   * event, not the next render — and because nothing renders from it. The
   * scroll handler writes it back so a swipe, which sets no intent, still
   * leaves the next press stepping from where the reader actually is.
   */
  const targetRef = useRef(0);
  /**
   * The card a scripted scroll is currently travelling to, or null when the
   * rail is at rest or being scrolled by the reader.
   *
   * This is what tells the scroll handler whose frames it is looking at. A
   * smooth scrollTo fires `onScroll` continuously, and those frames must not
   * be mistaken for the reader repositioning the rail — otherwise the handler
   * overwrites the intent it is meant to preserve.
   */
  const pendingRef = useRef<number | null>(null);
  /** Timer that clears a pending target the arrival check never resolved. */
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Where card `i` sits, MEASURED rather than computed from the constants.
   *
   * Computing it as `i * (CARD_W + GAP)` was wrong, and wrong in a way the dots
   * hid. The rail bleeds to the screen edge (`-mx-5 px-5`) so a card can sit
   * flush against it, and the padding that bleed restores is part of every
   * card's scroll offset — the cards sit at 20, 300, 580… while the arithmetic
   * targeted 0, 280, 560. Rounding absorbed the 20px on the way to the right
   * dot, so the indicator agreed while every scripted scroll landed 20px short,
   * and the LAST card could not reach its position at all: the rail's maximum
   * scrollLeft is short of the computed target, so the final card stopped
   * partway and the deck could not be read to the end.
   *
   * Measuring also means the padding, the gap and the card width can change in
   * the class list without a constant here silently going stale.
   *
   * RELATIVE TO CARD 0, not to the rail. The rail carries left padding (the
   * `px-5` that restores its negative margin), so every card's offsetLeft
   * includes it — while `scroll-pl-5` moves the snap edge past that same
   * padding, making the resting scrollLeft of the first card 0, not 20. Taking
   * the difference between two cards cancels the padding out of both terms, so
   * this returns the scroll distance rather than a layout position and the two
   * cannot disagree again when either value changes.
   */
  const offsetOf = useCallback((i: number) => {
    const rail = railRef.current;
    if (!rail) return 0;
    const cards = rail.querySelectorAll("article");
    const card = cards[i] as HTMLElement | undefined;
    const first = cards[0] as HTMLElement | undefined;
    return card && first ? card.offsetLeft - first.offsetLeft : 0;
  }, []);

  // Which card is under the rail's left edge. Derived from scrollLeft rather
  // than tracked as state the buttons also write, so a swipe, an arrow key, a
  // trackpad and a button all produce the same answer through one path.
  //
  // Nearest measured offset rather than a division: the offsets are not a
  // uniform stride from zero (see offsetOf), and this also stays correct at the
  // end of the rail, where the last card's resting scrollLeft is clamped by the
  // scroll maximum rather than equal to its offset.
  const syncActive = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const { scrollLeft } = rail;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < TACTIC_IDS.length; i += 1) {
      const d = Math.abs(offsetOf(i) - scrollLeft);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    setActive(nearest);

    // Re-anchor the intent ONLY for a scroll the reader drove themselves.
    //
    // A scripted scroll fires this on every animation frame, so writing
    // `nearest` back unconditionally walked the target back to wherever the
    // animation currently was — which is precisely the stale read the ref
    // exists to prevent, reintroduced one line later. Two rapid presses still
    // advanced one card.
    //
    // `pendingRef` is cleared when a scripted scroll arrives, and until then
    // every frame it produces is ignored here. A swipe or a trackpad sets no
    // pending target, so it re-anchors immediately and the next press steps
    // from where the reader actually is.
    if (pendingRef.current === null) {
      targetRef.current = nearest;
    } else if (nearest === pendingRef.current) {
      // Arrived. Hand control back to the reader's own scrolling.
      pendingRef.current = null;
    }

    // A safety net for the case where the arrival above never fires.
    //
    // The last card rests at the rail's maximum scrollLeft, which is short of
    // its own offset — `nearest` still resolves to it, so that case is fine.
    // But a scroll interrupted mid-flight (the reader grabs the rail, or the
    // rail is resized) can leave `pendingRef` set forever, and a stuck pending
    // target means every later swipe stops re-anchoring: presses would keep
    // stepping from a card the reader left long ago.
    //
    // Clearing it once the rail has been still briefly costs nothing when the
    // arrival check already fired, and bounds the damage when it did not.
    if (settleRef.current) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      pendingRef.current = null;
      settleRef.current = null;
    }, 220);
  }, [offsetOf]);

  /** Scroll to an absolute card index. */
  const scrollTo = useCallback((i: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const clamped = Math.max(0, Math.min(TACTIC_IDS.length - 1, i));
    targetRef.current = clamped;
    pendingRef.current = clamped;
    rail.scrollTo({
      left: offsetOf(clamped),
      // Honours the reader's motion preference. matchMedia rather than a CSS
      // class because this is a scripted scroll, and `scroll-behavior` in CSS
      // does not reach scrollTo's own `behavior` option.
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }, [offsetOf]);

  /**
   * Move `delta` cards from the last card ASKED for, not the one on screen.
   *
   * This is what makes rapid presses accumulate: each one steps from the
   * pending target, so two Next taps in the same animation land two cards on.
   */
  const step = useCallback(
    (delta: number) => scrollTo(targetRef.current + delta),
    [scrollTo],
  );

  // The settle timer outlives the component if the reader navigates away
  // mid-scroll.
  useEffect(() => () => {
    if (settleRef.current) clearTimeout(settleRef.current);
  }, []);

  // Keyboard: left/right move a card at a time. Bound to the rail rather than
  // the document, so it only applies while the deck has focus and never steals
  // arrow keys from the page.
  //
  // Depends on `step` alone, which is stable — the handler no longer closes
  // over `active`, so the listener is not torn down and rebound on every
  // scroll frame.
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      step(e.key === "ArrowRight" ? 1 : -1);
    }
    rail.addEventListener("keydown", onKey);
    return () => rail.removeEventListener("keydown", onKey);
  }, [step]);

  const atStart = active <= 0;
  const atEnd = active >= TACTIC_IDS.length - 1;

  return (
    <div className="sm:hidden">
      {/* tabIndex makes the rail focusable, which is what lets the arrow-key
          handler above apply — and it is also how a keyboard-only reader
          reaches a scroll container at all. role="group" with a label names it
          as one thing rather than six loose articles. */}
      <div
        ref={railRef}
        tabIndex={0}
        role="group"
        aria-label={t("learn.tactics.heading")}
        onScroll={syncActive}
        // scroll-pl-5 matches the px-5 that restores the bleed.
        //
        // Without it `snap-start` snaps to the padding box, so the rail comes
        // to rest 20px scrolled in and the first card sits flush against the
        // edge it bled to, outside the inset everything around it respects.
        // LearnHub had the same defect and it was visible there, because that
        // rail bleeds to the SCREEN edge; this one bleeds only to the edge of
        // the collapsible card it sits in, which made the same 20px read as a
        // slightly tight card rather than a broken gutter.
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-pl-5 scroll-smooth motion-reduce:scroll-auto -mx-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--clear)] rounded-sm"
      >
        {TACTIC_IDS.map((id: TacticId, i) => (
          <article
            key={id}
            aria-label={`${i + 1} of ${TACTIC_IDS.length}`}
            style={{ width: CARD_W }}
            className="shrink-0 snap-start rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4"
          >
            {/* The number is the reader's place in the set, and it is the one
                thing a card carries that the list version does not need. */}
            <p className="font-[family-name:var(--font-mono-ui)] text-[10px] uppercase tracking-[0.1em] text-[var(--faint)]">
              {i + 1} / {TACTIC_IDS.length}
            </p>
            <h3 className="mt-2 font-[family-name:var(--font-display)] font-semibold text-[17px] leading-snug text-[var(--foreground)]">
              {t(`learn.tactics.${id}.title` as MessageKey)}
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--text-dim)]">
              {t(`learn.tactics.${id}.desc` as MessageKey)}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label={t("learn.tactics.prev")}
          className="shrink-0 rounded-lg border border-[var(--rule)] p-1.5 text-[var(--text-dim)] enabled:hover:border-[var(--clear)] enabled:hover:text-[var(--clear)] disabled:opacity-35 transition-colors"
        >
          <Arrow dir="prev" />
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label={t("learn.tactics.next")}
          className="shrink-0 rounded-lg border border-[var(--rule)] p-1.5 text-[var(--text-dim)] enabled:hover:border-[var(--clear)] enabled:hover:text-[var(--clear)] disabled:opacity-35 transition-colors"
        >
          <Arrow dir="next" />
        </button>

        {/* A readout, not a control — see the note at the top. aria-hidden
            because the position is already announced by each card's own label
            and by the live region beside it; three sources saying the same
            thing is noise. */}
        <div aria-hidden="true" className="flex gap-1.5">
          {TACTIC_IDS.map((id, i) => (
            <span
              key={id}
              className={`h-1.5 rounded-full transition-all ${
                i === active ? "w-4 bg-[var(--clear)]" : "w-1.5 bg-[var(--ink-3)]"
              }`}
            />
          ))}
        </div>

        <p aria-live="polite" className="sr-only">
          {active + 1} of {TACTIC_IDS.length}
        </p>
      </div>
    </div>
  );
}
