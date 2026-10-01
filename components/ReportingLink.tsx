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
 */
export default function ReportingLink({ link }: { link: ReportingLinkData }) {
  if (!link.url) return <>{link.label}</>;
  return (
    <ExternalLink href={link.url} className="text-[var(--clear)]">
      {link.label}
    </ExternalLink>
  );
}
