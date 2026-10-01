import type { Metadata } from "next";
import AddToHomeScreen from "@/components/AddToHomeScreen";
import CheckStage from "@/components/CheckStage";
import HomeHero, { HomeCaption } from "@/components/HomeHero";
import WaysTeaser from "@/components/WaysTeaser";
import { getStats } from "@/lib/reportStore";

// The positioning line the page used to render as an <h1>.
//
// It is metadata rather than markup because of who reads it. "Check before you
// click — see exactly what we found" is addressed to someone deciding whether
// to come here: a search result, a shared link, a store listing. Someone who
// has already arrived does not need to be sold the page they are looking at,
// and on a phone that headline cost ~300px above the paste box — pushing the
// product's one job below the fold to make an argument its reader had already
// accepted.
//
// So the claim still exists, indexed and previewed, where it does that work.
// The screen itself opens on the box.
export const metadata: Metadata = {
  title: "Check before you click — Veriguard",
  description:
    "Paste a suspicious link, text, email or phone number and see exactly what we found. Scored against open-source rules; nothing you paste is stored.",
};

// Per-request for the counters below, which are read on this render rather
// than fetched on mount. Nothing else here needs it — the check flow is
// client-side, and the region lookup this also used to carry left with the
// radar section.
export const dynamic = "force-dynamic";

export default async function Home() {
  // Resolved here rather than fetched by StatsBar on mount. This render is
  // already happening per visit, so reading two counter rows inside it costs
  // nothing extra — while the client fetch it replaces was a second serverless
  // invocation per homepage view, which is the free tier's binding limit.
  //
  // Failure is non-fatal by design: the bar renders empty and the page is
  // unaffected. A stats widget must never be able to take the check flow down
  // with it, which is the actual product.
  let stats: { checks: number; reports: number } | null = null;
  try {
    stats = await getStats();
  } catch {
    stats = null;
  }

  return (
    // Top padding stays tight on a phone, where the short title plus the box
    // has to clear the fold, and opens up from sm where there is room.
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 pt-3 pb-8 sm:pt-10 sm:pb-12">
      {/* ── The tool ────────────────────────────────────────────────────────
          One centred column, and the only thing on its row.

          It was left-aligned in a 760px column inside a 1180px page, which
          left ~500px of empty space beside the single most important control
          on the site — a layout that reads as unfinished rather than focused.
          Centred, the box is the page's axis and the width either side is
          margin rather than a gap where something is missing.

          Once a check has run the stage releases the cap itself: the verdict
          splits into an evidence sheet and a tactics rail that need the room.
          See CheckStage. */}
      <div className="max-w-[760px] mx-auto">
        {/* The head goes in the stage's slot, not the page, because the stage
            owns the step: both the title and the caption retire when a verdict
            replaces the input, and only the stage knows when that happened.

            The caption is ONE instance, moved by `order` rather than
            duplicated — it owns a StatsBar, and two copies would mount two
            `veriguard:check-complete` listeners and paint the same counter
            twice, once invisibly. `order-last` drops it under the box on a
            phone, where three lines above would eat most of the distance to
            the fold; from sm it sits between the headline and the card. The
            stage renders this slot as a flex column for exactly that. */}
        <CheckStage
          above={
            <>
              <HomeHero />
              {/* Centred from sm, with the headline it follows — `mx-auto`
                  centres the paragraph's box, `text-center` centres the lines
                  inside it, and without the second the text ranges left
                  against a centred title.

                  Left-aligned on a phone, where it sits under the card as its
                  footnote and there is no axis to centre on.

                  The bottom margin separates it from the card on a desktop,
                  where it sits above; on a phone `order-last` puts it after
                  the card, so that gap comes off the top instead. */}
              <HomeCaption
                stats={stats}
                className="order-last sm:order-none mt-3 sm:mb-6 sm:max-w-[62ch] sm:mx-auto sm:text-center"
              />
            </>
          }
        />
      </div>

      {/* ── Under the tool ──────────────────────────────────────────────────
          What a reader scans once they have their answer: the other ways in,
          and the install prompt.

          This was two columns, the radar's four quoted lures beside these.
          The radar is gone from the home page — it is a browsing surface, and
          this screen has one job. It stays a destination (the Learn tab's
          sub-nav, the Learn hub and the about page all reach /radar), so
          nothing was removed from the product, only from the screen that
          should open on the paste box and little else.

          One column at the tool's own width, so the page reads as a single
          axis rather than a tool with a sidebar of things to read. */}
      <div className="mt-8 sm:mt-12 max-w-[760px] mx-auto space-y-6">
        {/* Renders nothing at all on a device that already has the app, or
            cannot install it — so on most desktops this is just the channels. */}
        <AddToHomeScreen />
        <WaysTeaser />
      </div>
    </main>
  );
}
