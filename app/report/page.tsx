// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { Suspense } from "react";
import ReportPrefillForm from "@/components/ReportPrefillForm";
import ReportPageHeader from "@/components/ReportPageHeader";

export const metadata: Metadata = {
  title: "Report a scam — Veriguard",
  description: "Lodge a scam in the public database so other people can look it up.",
  // A form target reached from a link we emailed, not a content page — keep it
  // out of search results (and out of the sitemap for the same reason).
  robots: { index: false, follow: true },
};

// Prefill arrives in the query string, so this reads searchParams and is
// therefore dynamic. See lib/reportPrefill.ts for what the params may carry and
// why the email body itself is never among them.
export default function ReportPage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      {/* The header needs translated copy, so it is a client component — the
          page itself stays a server component around it. */}
      <ReportPageHeader />

      {/* The container matches every other page, but the form does not fill it:
          a text input stretched to 1180px gives a 1100px-long line to type into,
          which is harder to use, not easier. No card around it either — the
          form's own fieldsets already group it, and a box around a box was one
          border too many. */}
      <div className="max-w-[680px]">
        <Suspense>
          <ReportPrefillForm />
        </Suspense>
      </div>
    </main>
  );
}
