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

describe("the phone's head is short enough to keep the box above the fold", () => {
  // The page HAS a title again — removing it left the desktop opening on an
  // unlabelled textarea with 500px of empty space beside it, which reads as a
  // broken page rather than a focused one. What must not come back is the
  // 50px headline ON A PHONE: at clamp(28px,5vw,50px) it put the paste box
  // ~300px down, below the fold, on the device most likely to need it first.
  //
  // So the guard is on the SIZE at each width, not on the presence of a
  // heading. Comments are stripped: this file explains the size it rejects,
  // and naming a value is not setting it.
  const hero = read("components/HomeHero.tsx")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("gives the page exactly one h1 at each width", () => {
    // Two <h1> elements, one hidden per breakpoint — never both visible.
    expect(hero).toMatch(/<h1[^>]*sm:hidden/);
    expect(hero).toMatch(/<h1[^>]*hidden sm:block/);
  });

  it("keeps the phone title to a single small line", () => {
    const phone = hero.slice(hero.indexOf("sm:hidden font-"), hero.indexOf("hidden sm:block font-"));
    expect(phone).toMatch(/text-\[20px\]/);
    // The clamp that pushed the box below the fold must not apply here.
    expect(phone).not.toMatch(/clamp\(/);
  });

  it("lets the desktop headline be a headline", () => {
    expect(hero).toMatch(/hidden sm:block[^"]*clamp\(30px/);
  });

  it("keeps the phone's top padding tight", () => {
    // This is how far down the screen the product starts on a phone.
    const page = read("app/page.tsx");
    expect(page).toMatch(/pt-3\b/);
    expect(page).not.toMatch(/className="[^"]*\bpy-8\b/);
  });
});

describe("every column holding a CheckStage is centred", () => {
  // CheckStage's post-verdict breakout applies a symmetric negative margin
  // sized for a centred column. Left-aligned, it pulls the left edge past
  // main's padding and outside the page gutter at wide widths — which is what
  // /share did, because it capped its column without centring it.
  it.each(["app/page.tsx", "app/share/page.tsx"])("%s centres the column", (file) => {
    const src = read(file);
    expect(src).toMatch(/max-w-\[760px\] mx-auto/);
  });

  it("the breakout still assumes a centred column", () => {
    // If this ever stops being symmetric, the rule above stops being required
    // and this block should be revisited rather than silently kept.
    expect(read("components/CheckStage.tsx")).toMatch(/lg:-mx-\[calc\(/);
  });
});

describe("the counters are mounted once", () => {
  // The caption owns a StatsBar, which listens for `veriguard:check-complete`.
  // It moves across the box by `order` — under it on a phone, above it from sm
  // — rather than being rendered twice with one copy hidden, which would mount
  // two listeners and paint the same number twice, once invisibly.
  it("renders a single HomeCaption", () => {
    const page = read("app/page.tsx");
    expect(page.match(/<HomeCaption/g) ?? []).toHaveLength(1);
  });

  it("moves it with order rather than a hidden duplicate", () => {
    expect(read("app/page.tsx")).toMatch(/order-last sm:order-none/);
  });

  it("keeps StatsBar out of the title component", () => {
    // HomeHero renders both titles; only one is visible. If StatsBar lived
    // there it would be mounted twice by that same duplication.
    const hero = read("components/HomeHero.tsx");
    const titleFn = hero.slice(
      hero.indexOf("export default function HomeHero"),
      hero.indexOf("export function HomeCaption"),
    );
    expect(titleFn).not.toContain("<StatsBar");
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

  it("is rendered as the page's own title again", () => {
    // The headline came back for desktop, where there is room above the fold
    // and an unlabelled textarea reads as a broken page. The phone gets the
    // short variant instead — see the fold block above.
    expect(messages["home.title"]).toBeTruthy();
    expect(messages["home.title.short"]).toBeTruthy();
  });

  it("keeps the short title short enough to sit on one line", () => {
    // The whole point of the phone variant. A second clause here and the box
    // starts sliding back down the screen.
    expect(messages["home.title.short"]).not.toContain("\n");
    expect(messages["home.title.short"].replace(/\*\*/g, "").length).toBeLessThanOrEqual(34);
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
