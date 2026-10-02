// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { MetadataRoute } from "next";

// Installability decision (see scripts/generate-icons.mjs for the icon set):
// the app is deliberately online-only — checking uses a live blocklist and
// reporting writes to the shared database — so there is no service worker /
// offline mode. (OCR moved client-side in #201, but that alone doesn't make the
// app offline-capable.) The PWA value here is the home-screen icon, the
// standalone window, and the share-sheet entry below.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veriguard",
    short_name: "Veriguard",
    description: "Free, open-source scam checker for links, texts, emails and phone numbers. Check before you act.",
    start_url: "/",
    display: "standalone",
    // Puts the app in the Android/iOS share sheet: share a suspicious message
    // from Messages, WhatsApp, Mail or a browser and it opens /share with the
    // content already in the check box.
    //
    // GET with url-encoded params, not POST/multipart: we accept text only, so
    // there is no file to receive, and a GET target needs no server handler —
    // the payload is read client-side and the address bar is cleaned
    // immediately (see components/ShareTargetSeed.tsx). Adding `files` here
    // later would mean a POST handler and a server round trip for the image,
    // which is the opposite of the client-side-first OCR that shipped in #201.
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    background_color: "#141C2B",
    theme_color: "#141C2B",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
