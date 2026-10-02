// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Metadata } from "next";
import { Suspense } from "react";
import SubmissionsBrowser from "@/components/SubmissionsBrowser";

export const metadata: Metadata = {
  title: "Community Submissions — Veriguard",
  description: "Scams reported by the community — browse and search submitted scam reports.",
};

// All filter/search/page state lives in the URL (shareable, survives refresh,
// steps through browser history), so the browser itself is a client component
// behind Suspense for useSearchParams.
export default function SubmissionsPage() {
  return (
    <Suspense>
      <SubmissionsBrowser />
    </Suspense>
  );
}
