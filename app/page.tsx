import { headers } from "next/headers";
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

      {/* The fold is the box, with forwarding collapsed beneath it as an aside.
          Those were two side-by-side cards until the forwarding panel — six
          elements to offer an email address — measured taller than the check box
          itself; it is one row now, and a row does not want half the page. Once
          a check has run the stage takes the full width, because the verdict
          splits into an evidence sheet and a tactics rail that need it. See
          CheckStage for why the step lives there rather than inside the flow.

          Below the fold on purpose: someone arriving mid-panic with a dodgy SMS
          needs the paste field first, and background information pushing it down
          the page would trade their urgent need for ours. The radar is handed to
          the stage rather than placed after it so it retires when the verdict
          arrives — "what's circulating" is context for the question, not the
          answer.

          Ways sits outside the stage, so it survives a check instead: it answers
          a different moment. "What's circulating" is context for a question not
          yet asked, while "take it with you" is for someone who has just had
          their answer and is deciding whether to keep the tool to hand. */}
      <CheckStage belowFold={<RadarTeaser region={region} />} after={<WaysTeaser />} />
    </main>
  );
}
