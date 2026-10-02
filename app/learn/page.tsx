// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { headers } from "next/headers";
import LearnContent from "@/components/LearnContent";
import { resolveRegion } from "@/lib/regionResolver";
import { regionToday, activeSeasons } from "@/lib/scamCalendar";

export const metadata: Metadata = {
  title: "How scammers work — Veriguard",
  description: "Understand how scammers work, where scams come from, how to handle one, and what to do if you've already clicked or shared details — plus how to capture a scam so we can check it.",
};

// The calendar link card names the seasons that are active today, so this can't
// be prerendered at build time without eventually naming the wrong ones.
export const dynamic = "force-dynamic";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  // ?region= is the reader correcting the geo guess (see RegionBar), exactly as
  // the radar and calendar do. It matters more here than on either of those:
  // this page's regional content is where to report a crime, so an uncorrectable
  // wrong guess sends someone to an agency that will not take their report.
  const { region: requested } = await searchParams;
  const region = resolveRegion(await headers(), requested);
  // Resolved server-side: the browser clock reflects the device's timezone
  // rather than the user's region.
  const today = regionToday(region);

  return (
    <LearnContent
      activeSeasons={activeSeasons(region, today).map((s) => s.title)}
      region={region}
    />
  );
}
