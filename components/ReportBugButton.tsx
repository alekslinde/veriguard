// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// The bug report, as a button wherever one is wanted.
//
// It was an inline item in the site footer, which was the only place on the
// site that offered it. The footer is gone — a persistent chrome strip under
// every page is a website's shape, not an app's — so this exists to put the
// same control where its explanation already lives: the about page's "Bug
// reports & tracking" section, which is the one block of prose that tells a
// reader what sending a report does and does not include.
//
// A component rather than the markup inlined there, because /about is a server
// component with no message keys (see the note at the top of that page) and
// this needs both the client boundary and the shared modal's context.

import { useBugReport, BugIcon } from "@/components/BugReportProvider";

export default function ReportBugButton({ label }: { label: string }) {
  const { openManual } = useBugReport();

  return (
    <button
      type="button"
      onClick={openManual}
      aria-haspopup="dialog"
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--rule)] px-3.5 py-2 text-[13.5px] font-medium text-[var(--text-dim)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--foreground)]"
    >
      <BugIcon />
      {label}
    </button>
  );
}
