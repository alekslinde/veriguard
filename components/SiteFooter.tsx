"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang";
import { useBugReport, BugIcon } from "./BugReportProvider";

export default function SiteFooter() {
  const { t } = useLang();
  const { openManual } = useBugReport();
  return (
    <footer
      className="border-t border-[var(--rule)] bg-[var(--ink)] mt-auto"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="max-w-[1180px] mx-auto px-5 sm:px-8 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-[var(--text-dim)] leading-relaxed">
        <span className="text-[var(--foreground)]">
          {t("footer.built")}{" "}
          <a
            href="https://alekslinde.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--clear)] font-semibold hover:underline underline-offset-2"
          >
            Aleks Linde<span className="sr-only"> ({t("a11y.newTab")})</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        {/* The reach claim, stated honestly: universal checks everywhere, full
            rule packs only where the groundwork exists. */}
        <span className="hidden sm:inline text-[var(--faint)]">{t("footer.scope")}</span>
        <span aria-hidden="true" className="hidden sm:inline text-[var(--ink-3)]">
          ·
        </span>
        <Link
          href="/about"
          className="underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          {t("footer.about")}
        </Link>
        <span aria-hidden="true" className="text-[var(--ink-3)]">
          ·
        </span>
        {/* Bug reporting is an inline footer item now, not a floating chip that
            sat over the check input on a phone. Same modal, reached through the
            shared context's openManual. */}
        <button
          type="button"
          onClick={openManual}
          aria-haspopup="dialog"
          className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:text-[var(--foreground)] transition-colors"
        >
          <BugIcon />
          {t("bug.button")}
        </button>
      </div>
    </footer>
  );
}
