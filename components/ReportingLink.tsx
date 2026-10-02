// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

import type { ReportingLink as ReportingLinkData } from "@/lib/reportingResources";
import ExternalLink from "@/components/ExternalLink";

/**
 * A reporting-body reference: linked where the pack carries a URL, plain
 * text where it doesn't (rest-of-world).
 *
 * The arrow, the new-tab note and the focus ring come from ExternalLink, which
 * is where every external link in the app gets them. This one previously used
 * `hover:opacity-80` — one of five hover treatments across the app, and the
 * only one that dimmed rather than brightened.
 *
 * No colour override. It carried `text-[var(--clear)]`, which is the colour the
 * default variant hovers TO — so the link sat at its own hover colour and
 * pointing at it changed nothing. `strong` is the variant for a link that
 * should read as clear in dim surrounding copy, and it hovers to an underline
 * instead, which is a change the reader can see.
 */
export default function ReportingLink({ link }: { link: ReportingLinkData }) {
  if (!link.url) return <>{link.label}</>;
  return (
    <ExternalLink href={link.url} variant="strong">
      {link.label}
    </ExternalLink>
  );
}
