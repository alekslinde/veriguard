// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Loads report mock data from JSON file and computes derived stats
import mockData from "./mock-data.json" assert { type: "json" };
import { FeedStats, PublicReport } from "@/lib/reportStore";

const NOW = Date.now();

// Convert relative time units to milliseconds timestamp
function getSubmittedAt(item: {
  minutesAgo?: number;
  hoursAgo?: number;
  daysAgo?: number;
}): number {
  if (item.minutesAgo) return NOW - item.minutesAgo * 60_000;
  if (item.hoursAgo) return NOW - item.hoursAgo * 3_600_000;
  if (item.daysAgo) return NOW - item.daysAgo * 86_400_000;
  return NOW;
}

// Build MOCK_REPORTS from JSON + computed locations
const RAW_MOCKS = mockData.reportMocks.map((item) => ({
  id: item.id,
  type: item.type,
  content: item.content,
  description: item.description,
  submittedAt: getSubmittedAt(item),
  scamUrl: item.scamUrl,
  scamPhone: item.scamPhone,
  scamEmail: item.scamEmail,
  scamReplyTo: item.scamReplyTo,
  emailAuth: item.emailAuth,
  matchCount: item.matchCount,
}));

const MOCK_LOCATIONS = mockData.mockLocations;

export const MOCK_REPORTS: PublicReport[] = RAW_MOCKS.map((r, i) => ({
  ...r,
  location: MOCK_LOCATIONS[i % MOCK_LOCATIONS.length],
}));

// ── Mock feed stats ───────────────────────────────────────────────────────────

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function buildMockFeedStats(): FeedStats {
  // byType — count raw mocks per type
  const typeCounts = new Map<string, number>();
  for (const r of RAW_MOCKS) typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1);
  const byType = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ type, count }));

  // byDay — count raw mocks per calendar day
  const dayCounts = new Map<string, number>();
  for (const r of RAW_MOCKS) {
    const d = isoDate(r.submittedAt);
    dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
  }
  const byDay = [...dayCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, count]) => ({ date, count }));

  return { total: RAW_MOCKS.length, byDay, byType };
}

export const MOCK_FEED_STATS: FeedStats = buildMockFeedStats();
