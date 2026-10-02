// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { headers } from "next/headers";
import ScamCalendar from "@/components/ScamCalendar";
import { resolveRegion } from "@/lib/regionResolver";
import { regionToday } from "@/lib/scamCalendar";

export const metadata: Metadata = {
  title: "Scam calendar — Veriguard",
  description:
    "When scams peak through the year — tax season, Black Friday, the Christmas parcel rush — and the lures to expect in each window, for your region.",
};

// Reads today's date, so it can't be prerendered at build time: a statically
// cached page would freeze on the build date and show the wrong season.
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  // The region bar writes its choice here. Same contract as the radar page: an
  // explicit pick beats the geo guess, survives a refresh, and can be linked to
  // someone in that region.
  searchParams: Promise<{ region?: string }>;
}) {
  const { region: requested } = await searchParams;
  const region = resolveRegion(await headers(), requested);
  // Resolved here rather than in the component: the component is a client
  // component (it needs the language preference), and the browser clock reflects the
  // device's timezone rather than the user's region. It also has to follow the
  // *chosen* region — reading a UK calendar against Australian local time would
  // put "today" on the wrong side of a season boundary for half the day.
  const today = regionToday(region);

  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
      <ScamCalendar region={region} today={today} />
    </main>
  );
}
