"use client";

// Home-page strip for the other ways in.
//
// Sits below the fold, under the check box and the radar teaser, for the same
// reason the radar does: someone arriving mid-panic with a dodgy SMS needs the
// paste field first, and "you could also install an extension" is not what they
// came for. It earns its place further down, where a reader who has already got
// their answer is deciding whether to keep the tool around.

import Link from "next/link";
import { useLang } from "@/lib/lang";
import WaysGrid from "@/components/WaysGrid";

export default function WaysTeaser() {
  const { t } = useLang();
  return (
    <section className="pt-2">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
          {t("home.ways.heading")}
        </h2>
        <Link
          href="/ways"
          className="shrink-0 text-[13.5px] font-semibold text-[var(--clear)]"
        >
          {t("home.ways.more")}
        </Link>
      </div>
      {/* Compact: name and audience only. The full cards carry how it works and
          what it means for privacy, which is a page's worth of reading and
          belongs on the page rather than under the check box. */}
      <WaysGrid compact />
    </section>
  );
}
