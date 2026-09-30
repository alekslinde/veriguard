import type { Metadata } from "next";
import { headers } from "next/headers";
import AddToHomeScreen from "@/components/AddToHomeScreen";
import CheckStage from "@/components/CheckStage";
import HomeHero from "@/components/HomeHero";
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
    // Top padding is deliberately small on a phone and only opens up from sm.
    // The check card is the first thing in the layout now, so this number is
    // literally how far down the screen the product starts — py-8 (32px) was
    // sized for a page that had a headline to separate from the header, and
    // there is nothing above the card left to separate it from.
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 pt-3 pb-8 sm:pt-8 sm:pb-10 space-y-6">
      {/* The fold is the box. Forwarding used to sit beside it as a second card,
          then under it as a collapsed row; it is one of the ways-in rows now, so
          nothing competes with the box for the fold. Once a check has run the
          stage takes the full width, because the verdict splits into an evidence
          sheet and a tactics rail that need it. See CheckStage for why the step
          lives there rather than inside the flow.

          Everything else is below the fold on purpose: someone arriving
          mid-panic with a dodgy SMS needs the paste field first, and background
          information pushing it down the page would trade their urgent need for
          ours.

          Both trailing sections survive a check, and that is the change from
          before — the radar used to retire with the input, on the reasoning that
          "what's circulating" was context for a question not yet asked. It is
          the opposite: a reader who has just been told their message looks clean
          is exactly who should see what is going around, and retiring it there
          removed it at the moment it started being useful.

          Ways first, radar last. Ways answers "can I keep this?", which follows
          directly from having just used it; the radar is reading material, and
          reading material goes at the bottom. */}
      <CheckStage
        below={<HomeHero stats={stats} />}
        after={
        <>
          {/* Above the ways-in rows, and for the same reason they sit here: a
              reader who has their answer is the one deciding whether to keep
              the tool around. It leads that group because a home-screen icon is
              the one option needing no store, no browser choice and no
              developer — but it renders nothing at all on a device that already
              has it, or cannot do it, so on a desktop this group is unchanged. */}
          <AddToHomeScreen variant="card" />
          <WaysTeaser />
          <RadarTeaser region={region} />
        </>
        }
      />
    </main>
  );
}
