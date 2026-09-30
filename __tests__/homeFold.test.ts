import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enNormal from "@/messages/en.normal.json";

/**
 * The check box opens above the fold on a phone.
 *
 * This is the property the app-shell revision bought, and nothing else in the
 * suite can notice losing it: adding a heading, a lede or a banner above the
 * card renders correctly, type-checks, and silently pushes the product's one
 * job off a 390px screen. The regression is invisible until someone opens the
 * site on a phone — which is the device most likely to be holding the
 * suspicious message.
 *
 * Asserted on source text, with the same limitation homeStats.test.ts records:
 * the suite runs under environment "node" with no DOM, so the homepage cannot
 * be mounted and measured. Brittle to renaming, and would pass on a
 * semantically broken refactor that kept the strings. A brittle guard beats
 * none where the alternative is no signal at all.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const messages = enNormal as Record<string, string>;

describe("the check box is the first thing on the home page", () => {
  it("renders no heading element above the card", () => {
    // An <h1> here is what the 50px hero was. The page's accessible name comes
    // from the document title; CheckFlow renders its own sr-only step heading.
    //
    // Comments are stripped before matching: this file's own doc comment
    // explains what it no longer renders, and naming a tag is not rendering it.
    const src = read("components/HomeHero.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toMatch(/<h[1-6][\s>]/);
  });

  it("puts CheckStage first in the main element", () => {
    const page = read("app/page.tsx");
    const main = page.indexOf("<main");
    const stage = page.indexOf("<CheckStage");
    const hero = page.indexOf("<HomeHero");
    expect(main).toBeGreaterThan(-1);
    expect(stage).toBeGreaterThan(main);
    // HomeHero still renders — as the card's footnote, through `below` — so it
    // must appear AFTER CheckStage opens rather than before it.
    expect(hero).toBeGreaterThan(stage);
  });

  it("passes the hero through the input-step slot, not the page body", () => {
    expect(read("app/page.tsx")).toMatch(/below=\{<HomeHero/);
  });

  it("keeps the phone's top padding tight", () => {
    // pt-8 (32px) was sized to separate a headline from the header. With the
    // card first, this number is how far down the screen the product starts.
    const page = read("app/page.tsx");
    expect(page).toMatch(/pt-3\b/);
    expect(page).not.toMatch(/className="[^"]*\bpy-8\b/);
  });
});

describe("the caption is hidden on a verdict, not unmounted", () => {
  // The slot holds StatsBar, which listens for `veriguard:check-complete` to
  // refresh the counter the reader just moved. Unmounting it on `done` tore
  // that listener down at exactly the moment the event fires — so the one
  // person guaranteed to notice a stale number was the one guaranteed to see
  // it. Measured before the fix: 413 before a check, still 413 after.
  const stage = read("components/CheckStage.tsx");

  it("keeps the slot mounted across the swap", () => {
    expect(stage).not.toMatch(/\{!done && below/);
    expect(stage).toMatch(/done \? "hidden"/);
  });

  it("hides it from assistive technology while a verdict is up", () => {
    // It is a footnote on the input; the verdict carries its own provenance.
    expect(stage).toMatch(/aria-hidden=\{done \|\| undefined\}/);
  });
});

describe("the service notice cannot retake the fold", () => {
  // The notice is four lines of body copy — ~190px of standing chrome directly
  // above the check card on a phone, which is enough on its own to undo the
  // reason the hero was retired. It is also genuinely important (it tells
  // someone their forwarded email may get no reply), so the answer is to clamp
  // it, not to hide it.
  const src = read("components/ServiceNotice.tsx");

  it("clamps to one line below the sm breakpoint", () => {
    expect(src).toMatch(/line-clamp-1 sm:line-clamp-none/);
  });

  it("offers a way to read the rest on the width where it clamps", () => {
    expect(src).toMatch(/sm:hidden/);
    expect(messages["service.more"]).toBeTruthy();
  });

  it("keeps the full text in the DOM at every width", () => {
    // The clamp is a visual affordance. Rendering a truncated STRING instead
    // would hide the detail from assistive technology, which is a content
    // decision this is deliberately not making.
    expect(src).not.toMatch(/slice\(0|substring\(0|truncate\(/);
  });

  it("leaves the notice text selectable rather than making it a button", () => {
    // An earlier pass made the paragraph itself the toggle, which costs text
    // selection at every width — on a notice most likely to be quoted.
    expect(src).toMatch(/<p\s+className=\{`text-xs/);
  });
});

describe("the positioning copy moved rather than being deleted", () => {
  it("is in the page metadata, where a reader who has not arrived reads it", () => {
    const page = read("app/page.tsx");
    expect(page).toMatch(/export const metadata/);
    expect(page).toMatch(/Check before you click/);
  });

  it("no longer exists as a rendered message key", () => {
    // Both keys were the hero. Leaving either in the bundle invites a future
    // copy pass to render it back above the box.
    expect(messages["home.title"]).toBeUndefined();
    expect(messages["home.subtitle"]).toBeUndefined();
  });
});

describe("the privacy caption does not overstate where scoring happens", () => {
  it("does not claim web checks run on the reader's device", () => {
    // Web checks call /api/check. On-device scoring is the extension's
    // property and belongs to its store listing — the same class of error
    // StatsBar's doc comment warns about, where a claim true of one surface is
    // restated as a claim about the product.
    expect(messages["home.privacy"]).toBeTruthy();
    expect(messages["home.privacy"]).not.toMatch(/on your device/i);
  });

  it("still carries the two promises the hero used to make", () => {
    expect(messages["home.privacy"]).toMatch(/\b(isn't|not|nothing[^.]*\bis)\s+stored\b/i);
    expect(messages["home.privacy"]).toMatch(/never open/i);
  });
});
