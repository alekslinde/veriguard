// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { headers } from "next/headers";
import ThreatRadar from "@/components/ThreatRadar";
import { resolveRegion } from "@/lib/regionResolver";

export const metadata: Metadata = {
  title: "Threat radar — Veriguard",
  description:
    "Scam campaigns circulating in your region right now — the texts, emails and calls in the wild, what they look like, and whether we catch them yet.",
};

// Region comes from request headers, so this can't be prerendered at build time
// — a statically cached page would serve one region's radar to everyone. The
// radar content itself is static data and carries no date logic (see
// components/ThreatRadar.tsx), so this is the only reason.
export const dynamic = "force-dynamic";

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  // ?region= is the reader correcting the geo guess (see RegionBar). It takes
  // precedence inside resolveRegion, which validates it and falls back to the
  // header rather than trusting the query string.
  const { region: requested } = await searchParams;
  const region = resolveRegion(await headers(), requested);

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <ThreatRadar region={region} />
    </main>
  );
}
