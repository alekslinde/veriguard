// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextResponse } from "next/server";
import { getFeedStats } from "@/lib/reportStore";
import { MOCK_FEED_STATS, shouldUseDevFixtures } from "@/lib/fixtures/mockReports";

export async function GET() {
  const stats = await getFeedStats();

  // In development, fall back to mock data when the DB is empty.
  if (shouldUseDevFixtures(stats.total)) {
    return NextResponse.json(MOCK_FEED_STATS, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  return NextResponse.json(stats, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
