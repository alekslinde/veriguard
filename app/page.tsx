import { headers } from "next/headers";
import AddToHomeScreen from "@/components/AddToHomeScreen";
import CheckStage from "@/components/CheckStage";
import HomeHero from "@/components/HomeHero";
import RadarTeaser from "@/components/RadarTeaser";
import WaysTeaser from "@/components/WaysTeaser";
import { resolveRegion } from "@/lib/regionResolver";
import { getStats } from "@/lib/reportStore";

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
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <HomeHero stats={stats} />

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
      <CheckStage after={
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
      } />
    </main>
  );
}
