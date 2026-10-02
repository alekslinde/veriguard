// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import PackagesDocs from "@/components/PackagesDocs";
import { NPM_PACKAGE, MCP_PACKAGE } from "@/lib/npmPackage";

export const metadata: Metadata = {
  title: "Packages — Veriguard",
  description:
    `Run Veriguard's scam detection yourself. ${NPM_PACKAGE} scores messages inside your own ` +
    `product; ${MCP_PACKAGE} gives your AI assistant the same checks as tools. Rule-based, ` +
    "local, no API key. Install, quickstart, the tools, and the coverage caveat.",
};

export default function PackagesPage() {
  return (
    // The site's container, as every other page uses. An earlier version
    // narrowed this to 860px, which produced a column width that exists
    // nowhere else on the site — the header, footer and nav still aligned to
    // 1180px, so the page read as misaligned rather than as a narrower one.
    //
    // Reading measure is the content's job, not the container's: see the note
    // in LearnContent, which caps its own body copy at 62ch inside the same
    // 1180px shell.
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <PackagesDocs />
    </main>
  );
}
