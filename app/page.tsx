import type { Metadata } from "next";
import { headers } from "next/headers";
import AddToHomeScreen from "@/components/AddToHomeScreen";
import CheckStage from "@/components/CheckStage";
import HomeHero, { HomeCaption } from "@/components/HomeHero";
import RadarTeaser from "@/components/RadarTeaser";
import WaysTeaser from "@/components/WaysTeaser";
import { resolveRegion } from "@/lib/regionResolver";
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

// Region comes from request headers, so this page is per-request regardless.
// The check flow is client-side, so little is served statically here in any
// case.
export const dynamic = "force-dynamic";

export default async function Home() {
  const region = resolveRegion(await headers());

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
              {/* The bottom margin is what separates it from the card on a
                  desktop, where it sits above. On a phone `order-last` puts it
                  after the card, so the same gap has to come off the top
                  instead — hence both, each width-scoped. */}
              <HomeCaption
                stats={stats}
                className="order-last sm:order-none mt-3 sm:mt-3 sm:mb-6 sm:max-w-[62ch] sm:mx-auto"
              />
            </>
          }
        />
      </div>

      {/* ── The control centre ──────────────────────────────────────────────
          Everything that is not the tool, in columns under it.

          These were a single stacked column: the ways-in shelf, then the
          radar, each capped at 760px and running down the left of the page.
          Stacked, they pushed the radar most of a screen below the fold and
          left the same dead margin as the box. Side by side they are what a
          reader scans once they have their answer — what else can do this,
          and what is going around — and they fill the width the page already
          has.

          Radar first on a wide screen and it takes the wider column: it is
          the one with real content rather than links. Below lg they stack,
          and the order flips so the channels — the shorter, more actionable
          block — come first rather than after four quotes.

          `items-start` so neither column stretches to the other's height. */}
      <div className="mt-8 sm:mt-12 grid gap-6 lg:gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start">
        <div className="order-2 lg:order-1 min-w-0">
          <RadarTeaser region={region} />
        </div>

        <div className="order-1 lg:order-2 min-w-0 space-y-6">
          {/* Renders nothing at all on a device that already has the app, or
              cannot install it — so on most desktops this column is just the
              channels. */}
          <AddToHomeScreen />
          <WaysTeaser />
        </div>
      </div>
    </main>
  );
}
