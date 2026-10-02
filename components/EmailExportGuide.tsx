// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import { useState } from "react";
import { useLang, MessageKey } from "@/lib/lang";
import { bold } from "@/lib/richText";

// Tabbed, per-client guide for getting an email's raw source / .eml export.
// Replaces the old generic "how do I find these on my phone" note: the real
// friction is reaching the source, which differs by mail client. Each tab is a
// short ordered list; the steps are translatable strings rendered with **bold**.
type Client = "apple" | "gmail" | "outlook";

const CLIENTS: { id: Client; tabKey: MessageKey; stepKeys: MessageKey[] }[] = [
  {
    id: "apple",
    tabKey: "report.email.guide.tab.apple",
    stepKeys: ["report.email.guide.apple.1", "report.email.guide.apple.2", "report.email.guide.apple.3"],
  },
  {
    id: "gmail",
    tabKey: "report.email.guide.tab.gmail",
    stepKeys: ["report.email.guide.gmail.1", "report.email.guide.gmail.2", "report.email.guide.gmail.3"],
  },
  {
    id: "outlook",
    tabKey: "report.email.guide.tab.outlook",
    stepKeys: ["report.email.guide.outlook.1", "report.email.guide.outlook.2", "report.email.guide.outlook.3"],
  },
];

// `expandable` (default) wraps the guide in a <details> with the "How do I get
// the email source?" summary — used inline next to the paste field where it must
// stay out of the way. Set expandable={false} to render the guide open, e.g. on
// the Learn page where it already sits under its own section heading.
export default function EmailExportGuide({ expandable = true }: { expandable?: boolean }) {
  const { t } = useLang();
  const [active, setActive] = useState<Client>("apple");
  const current = CLIENTS.find((c) => c.id === active)!;

  const body = (
    <div className={expandable ? "mt-2 space-y-2" : "space-y-2"}>
      <p className="text-gray-400">{t("report.email.guide.intro")}</p>

      {/* Tabs — native buttons in a tablist so arrow-key/AT semantics hold. */}
      <div role="tablist" aria-label={t("report.email.guide.summary")} className="flex flex-wrap gap-1.5">
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={active === c.id}
            id={`email-guide-tab-${c.id}`}
            aria-controls={`email-guide-panel-${c.id}`}
            onClick={() => setActive(c.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active === c.id
                ? "bg-emerald-500 text-gray-900"
                : "bg-[var(--ink-3)] text-gray-300 hover:bg-gray-700"
            }`}
          >
            {t(c.tabKey)}
          </button>
        ))}
      </div>

      <ol
        role="tabpanel"
        id={`email-guide-panel-${current.id}`}
        aria-labelledby={`email-guide-tab-${current.id}`}
        className="space-y-1.5 list-decimal pl-5 text-gray-400"
      >
        {current.stepKeys.map((k) => (
          <li key={k}>{bold(t(k))}</li>
        ))}
      </ol>

      <p className="text-gray-500">{t("report.email.guide.fallback")}</p>
    </div>
  );

  if (!expandable) {
    return <div className="text-xs text-gray-400">{body}</div>;
  }

  return (
    <details className="text-xs text-gray-400">
      <summary className="cursor-pointer text-emerald-400/90 hover:text-emerald-300">
        {t("report.email.guide.summary")}
      </summary>
      {body}
    </details>
  );
}
