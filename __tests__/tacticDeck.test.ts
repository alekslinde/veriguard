// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enMessages from "@/messages/en.json";
import { TACTIC_IDS } from "@/lib/signalTactics";

/**
 * The six tactics render as a deck on a phone and a list on a wide screen.
 *
 * Asserted on source text, with the limitation homeStats.test.ts records: the
 * suite runs under environment "node" with no DOM, so the component cannot be
 * mounted and scrolled. Brittle to renaming, and no substitute for opening it
 * — but the alternative here is no signal at all on properties that fail
 * silently.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const deck = read("components/TacticDeck.tsx");
// Comments stripped: the component explains the stride bug it no longer has,
// and naming a mistake is not making it. Without this, the assertion that the
// stride is gone matches the sentence describing its absence.
const deckCode = deck.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const messages = enMessages as Record<string, string>;

describe("the deck positions cards by measurement, not arithmetic", () => {
  // The bug this pins: cards sit at 20, 300, 580… because the rail bleeds to
  // the screen edge and its restored padding is part of every offset, while
  // `i * (CARD_W + GAP)` targeted 0, 280, 560. Rounding absorbed the 20px on
  // the way to the right dot, so the INDICATOR agreed while every scripted
  // scroll landed short — and the last card could never reach its position,
  // because the rail's maximum scrollLeft is below the computed target. The
  // deck could not be read to the end and nothing said so.
  it("reads each card's real offset from the DOM", () => {
    // Measured against CARD 0, not the rail. The rail carries the left padding
    // that restores its negative margin, so every card's offsetLeft includes
    // it — while `scroll-pl-5` moves the snap edge past that same padding,
    // making the first card's resting scrollLeft 0 rather than 20. Measuring
    // from the rail mixed the two origins and every scripted scroll landed
    // 20px short; the difference between two cards cancels the padding out.
    expect(deckCode).toMatch(/card\.offsetLeft - first\.offsetLeft/);
    expect(deckCode).not.toMatch(/card\.offsetLeft - rail\.offsetLeft/);
  });

  it("moves the snap edge past the padding that restores its bleed", () => {
    // Without scroll-pl the rail rests scrolled in by its own padding and the
    // first card sits outside the gutter everything around it respects. It was
    // visible on the Learn hub, whose rail bleeds to the screen edge.
    expect(deckCode).toMatch(/scroll-pl-5/);
  });

  it("does not compute a card's position from a stride", () => {
    expect(deckCode).not.toMatch(/\(CARD_W \+ GAP\)/);
  });

  it("picks the active card by nearest offset", () => {
    // A division by a uniform stride is also wrong at the END of the rail,
    // where the last card rests at the scroll maximum rather than at its own
    // offset.
    expect(deck).toMatch(/nearest/);
    expect(deckCode).not.toMatch(/Math\.round\(rail\.scrollLeft \//);
  });
});

describe("rapid presses accumulate", () => {
  // `active` is derived from scrollLeft and only catches up once a smooth
  // scroll has travelled far enough, so stepping from it made two quick
  // presses advance ONE card — the second read the same stale value as the
  // first and re-targeted the card already being scrolled to. Measured before
  // the fix: two rapid Next taps landed at 300 (card 1) instead of 580.
  it("steps from the card last asked for, not the one on screen", () => {
    expect(deckCode).toMatch(/targetRef/);
    expect(deckCode).toMatch(/scrollTo\(targetRef\.current \+ delta\)/);
  });

  it("does not step from the rendered position", () => {
    expect(deckCode).not.toMatch(/scrollTo\(active [+-]/);
  });

  it("lets a swipe re-anchor the next press", () => {
    // A swipe sets no intent, so the reader's real position has to become the
    // point the next press steps from.
    expect(deckCode).toMatch(/targetRef\.current = nearest/);
  });

  it("ignores the frames a scripted scroll produces", () => {
    // The first attempt at this fix wrote `nearest` back to the target on
    // EVERY scroll event. A smooth scrollTo fires one per animation frame, so
    // that walked the target back to wherever the animation currently was —
    // reintroducing the stale read one line below the ref meant to prevent it.
    // The source-text test passed; two rapid presses still advanced one card.
    // Only a browser caught it, which is why the guard is on the mechanism.
    expect(deckCode).toMatch(/if \(pendingRef\.current === null\)/);
    expect(deckCode).toMatch(/pendingRef\.current = clamped/);
  });

  it("cannot strand a pending target", () => {
    // A scroll interrupted mid-flight would otherwise leave pendingRef set
    // forever, and a stuck pending target means later swipes stop re-anchoring
    // — presses would keep stepping from a card the reader left long ago.
    expect(deckCode).toMatch(/settleRef/);
    expect(deckCode).toMatch(/clearTimeout\(settleRef\.current\)/);
  });

  it("does not rebind the key listener on every scroll frame", () => {
    // The handler closed over `active`, so the effect re-ran throughout every
    // animation. Depending on the stable `step` alone fixes that too.
    expect(deckCode).toMatch(/\}, \[step\]\);/);
  });
});

describe("the deck is operable without a touchscreen", () => {
  it("is a scroll container rather than a transform carousel", () => {
    // Works with no JS, with a trackpad, and with the browser's own keyboard
    // scrolling before any of this component's code runs.
    expect(deck).toMatch(/overflow-x-auto/);
    expect(deckCode).not.toMatch(/translateX|transform:/);
  });

  it("takes focus, so its arrow-key handler can apply", () => {
    expect(deck).toMatch(/tabIndex=\{0\}/);
  });

  it("moves a card at a time with the arrow keys", () => {
    expect(deck).toMatch(/ArrowLeft/);
    expect(deck).toMatch(/ArrowRight/);
  });

  it("binds the keys to the rail, not the document", () => {
    // Otherwise the deck steals arrow keys from the rest of the page.
    expect(deck).toMatch(/rail\.addEventListener\("keydown"/);
    expect(deckCode).not.toMatch(/document\.addEventListener\("keydown"/);
  });

  it("offers real buttons, labelled", () => {
    expect(messages["learn.tactics.prev"]).toBeTruthy();
    expect(messages["learn.tactics.next"]).toBeTruthy();
    expect(deck).toMatch(/disabled=\{atStart\}/);
    expect(deck).toMatch(/disabled=\{atEnd\}/);
  });

  it("honours a reduced-motion preference on scripted scrolls", () => {
    // scroll-behavior in CSS does not reach scrollTo's own `behavior` option,
    // so the preference has to be read here.
    expect(deck).toMatch(/prefers-reduced-motion/);
  });
});

describe("no card is hidden from anyone", () => {
  it("keeps every card in the DOM", () => {
    // A screen reader, a find-in-page and a printed page all read the whole
    // set regardless of what is scrolled into view.
    expect(deckCode).not.toMatch(/aria-hidden=\{[^}]*active/);
    expect(deck).toMatch(/TACTIC_IDS\.map/);
  });

  it("treats the dots as a readout rather than controls", () => {
    // They are too small to be reliable tap targets; the arrows and the swipe
    // already cover navigation.
    const dots = deckCode.slice(deckCode.indexOf("flex gap-1.5"));
    expect(dots).not.toMatch(/<button/);
  });

  it("announces the position once, not three times", () => {
    expect(deck).toMatch(/aria-live="polite"/);
  });
});

describe("the same six render at both widths", () => {
  it("shows the deck only on a phone", () => {
    expect(deck).toMatch(/className="sm:hidden"/);
  });

  it("shows the list only from sm up", () => {
    // A reader with room for all six should be given all six rather than made
    // to swipe through them.
    expect(read("components/LearnContent.tsx")).toMatch(/hidden sm:grid/);
  });

  it("draws both from the same keys, so they cannot drift", () => {
    for (const id of TACTIC_IDS) {
      expect(messages[`learn.tactics.${id}.title`], `title ${id}`).toBeTruthy();
      expect(messages[`learn.tactics.${id}.desc`], `desc ${id}`).toBeTruthy();
    }
    expect(deck).toMatch(/learn\.tactics\.\$\{id\}\.title/);
    expect(read("components/LearnContent.tsx")).toMatch(/learn\.tactics\.\$\{i \+ 1\}\.title/);
  });
});
