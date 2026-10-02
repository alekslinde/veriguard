// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// The report page's header. A thin client component purely because the copy is
// translated and PageHeader reads the language context — app/report/page.tsx
// stays a server component around it.

import PageHeader from "@/components/PageHeader";
import { useLang } from "@/lib/lang";

export default function ReportPageHeader() {
  const { t } = useLang();
  return (
    <PageHeader
      eyebrow={t("report.eyebrow")}
      title={t("report.headline")}
      lede={t("report.lede")}
    />
  );
}
