// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Region-aware "where to report this" advice for the UI.
//
// The engine packs own the data (RegionDefinition.reportingUrl); this module
// owns the presentation rule: how a body name + optional URL becomes the link
// (or plain text) the verdict steps and report-success footer render.
//
// The label rule: bodies that already name their host ("the FTC
// (reportfraud.ftc.gov)") link as-is; bodies that don't ("Scamwatch") gain
// the host in parens, matching the long-standing "Name (host)" pattern. A
// pack with no URL (rest-of-world) renders its generic body as plain text
// rather than linking nowhere.

import { resolveRegionPack, type RegionInput } from "@veriguard/detect/regions";

export interface ReportingLink {
  /** Pack's reporting body, e.g. "Scamwatch". */
  body: string;
  /** Report-a-scam URL, or null where the pack carries none. */
  url: string | null;
  /** What to render: the body, plus the host where the body doesn't name it. */
  label: string;
}

export function reportingFor(region?: RegionInput): ReportingLink {
  const pack = resolveRegionPack(region);
  const url = pack.reportingUrl ?? null;
  let label = pack.reportingBody;
  if (url) {
    // Display host without a www prefix, matching the long-standing "Name
    // (host)" pattern ("Scamwatch (scamwatch.gov.au)"). The href keeps the
    // full URL.
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (!pack.reportingBody.includes(host)) label = `${pack.reportingBody} (${host})`;
  }
  return { body: pack.reportingBody, url, label };
}

/** Whether this region has a victim-support helpline we can name. Only AU:
 * IDCARE on 1800 595 160. Other regions get the reporting link alone —
 * inventing helplines would be worse than omitting one. */
export function victimHelpline(region?: RegionInput): { number: string; label: string } | null {
  const pack = resolveRegionPack(region);
  if (pack.code !== "AU") return null;
  return { number: "1800595160", label: "IDCARE on 1800 595 160" };
}

/**
 * Extra reporting destinations beyond the pack's primary body.
 *
 * Only AU has these today, and that is a data limit rather than a design one:
 * the packs carry one `reportingBody` each, and the ReportCyber / IDCARE / ACSC
 * set was hardcoded on the Learn page back when the app was Australia-only.
 * Every other region gets the primary body alone — same rule as
 * `victimHelpline`, and for the same reason: naming a body that does not take
 * reports in that jurisdiction sends someone to the wrong place at the worst
 * possible moment, which is worse than naming none.
 *
 * Adding a region here means adding real, verified destinations for it — not
 * translating Australia's.
 */
export interface ReportingAgency {
  name: string;
  /** Expansion for an acronym, rendered as an <abbr> title. */
  abbr: string | null;
  /** Host shown under the name. */
  site: string;
  href: string;
}

const AU_AGENCIES: ReportingAgency[] = [
  { name: "Scamwatch (ACCC)", abbr: null, site: "scamwatch.gov.au", href: "https://www.scamwatch.gov.au" },
  { name: "ReportCyber", abbr: "Australian Signals Directorate", site: "cyber.gov.au/report", href: "https://www.cyber.gov.au/report" },
  { name: "IDCARE (ID theft)", abbr: null, site: "idcare.org", href: "https://www.idcare.org" },
  { name: "ACSC", abbr: "Australian Cyber Security Centre", site: "cyber.gov.au", href: "https://www.cyber.gov.au" },
];

/**
 * The agency cards to show for a region. AU keeps its full set; every other
 * region gets its pack's own reporting body, as a single card where the pack
 * carries a URL to link to. Rest-of-world carries no URL, so it gets no cards
 * and the surrounding copy names the body as plain text instead.
 */
export function reportingAgencies(region?: RegionInput): ReportingAgency[] {
  const pack = resolveRegionPack(region);
  if (pack.code === "AU") return AU_AGENCIES;

  const url = pack.reportingUrl;
  if (!url) return [];

  return [
    {
      name: pack.reportingBody,
      abbr: null,
      site: new URL(url).hostname.replace(/^www\./, ""),
      href: url,
    },
  ];
}

/**
 * Whether this region has a free SMS-forwarding shortcode for scam texts.
 * Only AU: Scamwatch on 0429 999 888.
 *
 * Separate from `victimHelpline` even though both are AU-only today, because
 * they are different facts: a region could gain one without the other, and
 * gating the shortcode on the helpline would quietly show Australia's number
 * to the first region that added a helpline of its own.
 */
export function scamTextForwarding(region?: RegionInput): boolean {
  return resolveRegionPack(region).code === "AU";
}
