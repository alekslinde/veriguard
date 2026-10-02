// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Allow all crawlers over the public site, but keep them out of the API
// route handlers (they return JSON, not pages, and shouldn't be indexed).
// Pointing at the sitemap is the main win: it tells Google exactly which
// URLs exist instead of leaving discovery to link-following.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
