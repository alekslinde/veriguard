import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Static, crawlable routes. Each app/<path>/page.tsx that renders public,
// indexable content belongs here so Google can discover it without relying on
// internal-link crawling alone. API routes and the not-found page are excluded
// (the latter is noindex by design).
const ROUTES = ["", "about", "learn", "calendar", "radar", "submissions"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((path) => ({
    url: path ? `${SITE_URL}/${path}` : SITE_URL,
    lastModified,
    changeFrequency: path === "submissions" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
