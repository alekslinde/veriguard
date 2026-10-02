// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// The check changes shape three times — the panel replacing the textarea, the
// stage rows advancing, and the verdict replacing the whole flow — and each one
// happened in a single frame. The card jumped 25px the moment someone pressed
// Check, which reads as a flinch at exactly the point they are waiting to be
// told whether they have been scammed.
//
// These assert the two properties that make the smoothing trustworthy rather
// than decorative: it is opt-in for people who have asked for less motion, and
// the height animation is driven by measurement rather than a guessed constant.

const CSS = readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
const SRC = readFileSync(path.join(process.cwd(), "components/CheckFlow.tsx"), "utf8");

describe("check transitions — reduced motion", () => {
  it("gates every check animation behind a motion preference", () => {
    // Each animation/transition this feature adds must either sit inside a
    // no-preference block or be switched off in a reduce block. A new one that
    // does neither plays for someone who asked for stillness.
    for (const name of ["check-fade-in", "check-result-in"]) {
      const reduce = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
      expect(reduce, `${name} must be disabled under reduced motion`).toMatch(
        new RegExp(`\\.${name}[^}]*|\\.${name},`),
      );
    }
  });

  it("puts the height transition behind a no-preference query", () => {
    const swap = CSS.slice(CSS.indexOf(".check-swap"));
    const guard = CSS.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(guard).toBeGreaterThan(-1);
    // The transition itself is inside the query; the height variable outside it,
    // so the layout is identical either way and only the easing is conditional.
    expect(swap).toMatch(/height: var\(--swap-h, auto\)/);
    const noPref = CSS.slice(guard);
    expect(noPref).toMatch(/transition:\s*height/);
  });

  it("skips the animation in JS too, not only in CSS", () => {
    // The hook writes inline styles, which a CSS media query cannot undo — so
    // it has to check the preference itself or it would animate regardless.
    const hook = SRC.slice(SRC.indexOf("function useSwapHeight"));
    expect(hook.slice(0, hook.indexOf("\n}"))).toMatch(
      /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/,
    );
  });
});

describe("check transitions — height animation", () => {
  it("measures both heights rather than hardcoding the difference", () => {
    const hook = SRC.slice(SRC.indexOf("function useSwapHeight"));
    const body = hook.slice(0, hook.indexOf("\n  return ref;"));
    // Two measurements: the height being left and the height being arrived at.
    expect(body.match(/getBoundingClientRect\(\)\.height/g)?.length).toBeGreaterThanOrEqual(2);
    // A pixel constant here would break the moment the copy or the stage count
    // changed, and would be wrong on every viewport but the one it was read on.
    expect(body).not.toMatch(/--swap-h`?,\s*`?\d+px/);
  });

  it("captures the outgoing height before the DOM is repainted", () => {
    // useLayoutEffect, not useEffect: a passive effect runs after paint, so the
    // measurement would already be the new height and the card would animate
    // from where it had just jumped to — the jump this removes.
    const hook = SRC.slice(SRC.indexOf("function useSwapHeight"));
    const body = hook.slice(0, hook.indexOf("\n  return ref;"));
    expect(body).toMatch(/useLayoutEffect/);
    // Both passes must be layout effects — the one that animates and the one
    // that records the height being left behind.
    expect(body.match(/useLayoutEffect\(/g)?.length).toBe(2);
    expect(body).not.toMatch(/\buseEffect\(/);
  });

  it("hands the height back to the content once it lands", () => {
    // A height left pinned would clip the panel if its content reflowed, and
    // would fight the textarea's own resize handle.
    const hook = SRC.slice(SRC.indexOf("function useSwapHeight"));
    expect(hook).toMatch(/removeProperty\("--swap-h"\)/);
    expect(hook).toMatch(/transitioncancel/);
  });

  it("animates the element whose size actually changes", () => {
    // The panel replaces the textarea and adds a footer below the button row,
    // so the change is spread across the whole card. Animating a single inner
    // row left the jump exactly where it was.
    const swapIdx = SRC.indexOf("ref={swapRef}");
    expect(swapIdx).toBeGreaterThan(-1);
    expect(SRC.slice(swapIdx, swapIdx + 400)).toMatch(/check-swap[^"]*rounded-2xl|rounded-2xl[^"]*check-swap/);
  });
});

// ── The tool's resting position ──────────────────────────────────────────────
//
// The home page centres the check box in the viewport while it is empty and
// lets it rise to the normal top-aligned position when a verdict replaces it.
//
// Three pieces have to agree for that to work, in three files, and none of them
// fails a build alone: the page marks itself, the stage says when a check is
// done, and the CSS joins the two. Any one of them renamed in isolation leaves
// the page silently stuck in whichever position it happened to start in.

describe("the home page's centred tool", () => {
  const PAGE = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");
  const STAGE = readFileSync(path.join(process.cwd(), "components/CheckStage.tsx"), "utf8");

  it("marks the page and the finished check for the CSS to find", () => {
    expect(PAGE).toMatch(/data-home/);
    expect(STAGE).toMatch(/data-check-done=\{done \|\| undefined\}/);
    // `|| undefined` and not `{done}`: React renders data-check-done="false"
    // for the boolean, and an attribute selector matches on presence — so the
    // page would read every input step as finished and never centre at all.
    expect(STAGE).not.toMatch(/data-check-done=\{done\}/);

    expect(PAGE).toMatch(/data-home-tool/);
    expect(CSS).toMatch(/\[data-home-tool\]/);
    expect(CSS).toMatch(/main\[data-home\]:has\(\[data-check-done\]\) \[data-home-tool\]/);
  });

  it("centres the tool, not the page", () => {
    // The bug this replaces: <main> was padded by half the leftover viewport,
    // with the tool's height written in as a constant. <main> also holds the
    // ways-in rows, so the padding pushed the tool down by half the height of
    // everything BELOW it too — and the constant (320px) was a guess against a
    // real ~470px. The tool landed near the bottom of the screen.
    //
    // The wrapper around the tool is what fills the viewport and centres its
    // own contents, so no height needs to be known at all.
    // Specifically: <main> must not be padded by a CENTRING calculation. It is
    // still padded — to 0, cancelling its own pt-10 so the centred region
    // starts flush under the header — and that is not the bug. The bug was a
    // computed half-viewport value on the element that also holds the rows.
    const mainRule = CSS.slice(CSS.indexOf("main[data-home] {"));
    expect(mainRule.slice(0, mainRule.indexOf("}"))).not.toMatch(/padding-top:\s*(max|calc|min)\(/);

    const rule = CSS.slice(CSS.indexOf("[data-home-tool] {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toMatch(/justify-content:\s*center/);
    expect(body).toMatch(/min-height:\s*calc\(100vh/);
  });

  it("moves with a transition rather than a snap", () => {
    // min-height, because justify-content/align-items/margin:auto cannot be
    // interpolated — a layout switch would jump the tool up in one frame, which
    // is the flinch the rest of this file exists to remove.
    expect(CSS).toMatch(/transition:\s*min-height/);

    // And it collapses to 0, not auto: `auto` is a keyword, so it would snap to
    // the content height in one frame and lose the rise. A flex column with no
    // room to distribute already sits at its content's height.
    const done = CSS.slice(CSS.indexOf("main[data-home]:has([data-check-done])"));
    expect(done.slice(0, done.indexOf("}"))).toMatch(/min-height:\s*0/);
  });

  it("centres only where there is room for it", () => {
    // On a phone the box is already most of the screen, and on a short laptop
    // window centring pushes it toward the fold — the regression HomeHero's
    // short mobile title exists to prevent.
    // Asserted as "the rule is inside the guarded block" rather than by slicing
    // a fixed number of characters back from it — the first version did that
    // and broke the moment another rule was added between the @media line and
    // this one, which says nothing about whether the guard still holds.
    const guard = "@media (min-width: 640px) and (min-height: 720px) {";
    const start = CSS.indexOf(guard);
    expect(start, "the centring guard is gone").toBeGreaterThan(-1);

    // To the end of that block: count braces from the opening one.
    let depth = 0;
    let end = start + guard.length - 1;
    for (let i = start + guard.length - 1; i < CSS.length; i++) {
      if (CSS[i] === "{") depth++;
      else if (CSS[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    expect(CSS.slice(start, end)).toMatch(/\[data-home-tool\]\s*\{/);
  });

  it("does not travel for a reader who asked for less motion", () => {
    // Excluded rather than shortened: both positions are correct, and it is the
    // journey between them that this reader has opted out of.
    const at = CSS.indexOf("transition: min-height");
    expect(CSS.slice(at - 400, at)).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });
});

// ── The ways-in rows ─────────────────────────────────────────────────────────
//
// A <details> snaps: the browser toggles content-visibility, which nothing can
// transition. These rows sit directly under the check card on the home page, so
// a row that jumps while the card above it animates is the one inconsistency
// the reader can see without looking for it.

describe("the ways-in rows open and close smoothly", () => {
  const GRID = readFileSync(path.join(process.cwd(), "components/WaysGrid.tsx"), "utf8");

  it("animates a grid row rather than a height", () => {
    // grid-template-rows interpolates where `height: auto` does not, so this
    // needs no measurement — no ResizeObserver, no JS-set property, and no
    // stale height when the body reflows (the install buttons wrap, and the
    // forwarding body's copy button changes label).
    expect(CSS).toMatch(/details\s*>\s*\.ways-body\s*\{[^}]*grid-template-rows:\s*0fr/);
    expect(CSS).toMatch(/details\[open\]\s*>\s*\.ways-body\s*\{[^}]*grid-template-rows:\s*1fr/);
    expect(CSS).toMatch(/transition:\s*grid-template-rows/);
  });

  it("keeps the closed body renderable so there is something to animate", () => {
    // A closed <details> applies content-visibility: hidden to everything after
    // the summary — there is nothing to animate from. Overriding that is what
    // makes the row animatable, and it is why the clip has to be ours.
    expect(CSS).toMatch(/details:not\(\[open\]\)\s*>\s*\.ways-body\s*\{[^}]*content-visibility:\s*visible/);
    expect(GRID).toMatch(/min-h-0 overflow-hidden/);
  });

  it("separates the animating row from the padded content", () => {
    // Padding on a clipped row still occupies height when that row is
    // collapsed, so a single element would never shut completely. The outer
    // element owns the transition and the clip; the inner owns the padding.
    const body = GRID.slice(GRID.indexOf('className="ways-body"'));
    const open = body.slice(0, body.indexOf("<p "));
    expect(open).toMatch(/ways-body[\s\S]*min-h-0 overflow-hidden[\s\S]*px-3\.5/);
    // The row that animates carries no padding of its own.
    expect(open).not.toMatch(/ways-body[^"]*p[xytb]?-\d/);
  });

  it("does not animate for a reader who asked for less motion", () => {
    // The row still opens and closes; it simply arrives. Same rule as every
    // other transition in this file.
    const at = CSS.indexOf("transition: grid-template-rows");
    expect(CSS.slice(at - 500, at)).toMatch(/prefers-reduced-motion:\s*no-preference/);
  });
});
