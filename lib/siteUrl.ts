// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Canonical production origin, used for metadataBase, canonical links, the
// sitemap and robots.txt. Resolution order:
//   1. NEXT_PUBLIC_SITE_URL      — explicit override (set this in prod)
//   2. VERCEL_PROJECT_PRODUCTION_URL — the stable production domain on Vercel
//   3. http://localhost:3000     — dev fallback
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");
