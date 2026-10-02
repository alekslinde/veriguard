// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Loads tracking pixel mock data from JSON file
import mockData from "./mock-data.json" assert { type: "json" };

export const MOCK_EMAILS_WITH_PIXELS = mockData.emailsWithTrackingPixels as Record<
  string,
  { description: string; content: string }
>;
