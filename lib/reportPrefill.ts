// Report-form prefill, carried entirely in the URL.
//
// The forward-to-us reply email ends with a CTA inviting the forwarder to lodge
// the scam in the public database. That link has to arrive at a report form that
// already knows what the scam was — otherwise the CTA asks someone to retype
// details we just analysed for them.
//
// PRIVACY: the params carry only the extracted IDENTIFIERS (the scammer's
// sender address, reply-to, the scam link, a phone number) plus the report type.
// The forwarded email itself is never stored server-side and never travels in
// the link — that would contradict the "we don't keep a copy" promise the same
// reply makes. The message body stays empty for the reporter to describe in
// their own words, which is also the field most likely to contain their own
// personal details.
//
// Pure module: no React, no I/O. Shared by lib/verdictSummary.ts (builds the
// link) and app/report/page.tsx (reads it).

import type { ScamType } from "@veriguard/engine/scamDetector";

export interface ReportPrefill {
  type?: ScamType;
  scamUrl?: string;
  scamEmail?: string;
  scamReplyTo?: string;
  scamPhone?: string;
  /** Which surface sent the reporter here. See `REPORT_SOURCES`. */
  source?: ReportSource;
}

/**
 * Where a prefilled report link came from.
 *
 * This exists because the WebExtension is otherwise unmeasurable: it scores
 * on-device and never calls our API, so a report it prompted is the ONE
 * extension outcome that reaches us at all. Without this the report arrives
 * indistinguishable from someone who typed the URL.
 *
 * **This is not a tracking parameter and must never become one.** It names a
 * surface, not a person, a session or a campaign — the values are a closed list
 * below, so the field cannot carry an identifier even if something tried to put
 * one there. It rides a link the USER clicks, which is why it does not touch
 * the extension's "exactly one network request" property: that claim is about
 * requests the extension makes on its own, and a navigation the reader chose is
 * a different thing entirely. Nothing here is stored against a report row
 * unless a caller does so deliberately.
 *
 * `email` is the forward-to-us reply CTA, which predates this field and was
 * previously unattributed for the same reason.
 */
export type ReportSource = "ext-chromium" | "ext-firefox" | "ext-safari" | "email";

export const REPORT_SOURCES: readonly ReportSource[] = [
  "ext-chromium",
  "ext-firefox",
  "ext-safari",
  "email",
];

const SCAM_TYPES: ScamType[] = ["url", "sms", "email", "phone", "qr", "custom"];

// Longest identifier we will carry. Long enough for a real URL with a tracking
// path, short enough that a crafted link can't be used to stuff the form (or
// blow past a mail client's URL length limit and break the CTA).
const MAX_PARAM_LEN = 300;

function clean(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_PARAM_LEN) return undefined;
  return trimmed;
}

/**
 * Build the query string for a prefilled report link. Returns "" when there is
 * nothing worth carrying, so callers can fall back to the bare /report URL.
 */
export function buildReportQuery(prefill: ReportPrefill): string {
  const params = new URLSearchParams();
  if (prefill.type && SCAM_TYPES.includes(prefill.type)) params.set("type", prefill.type);
  for (const key of ["scamUrl", "scamEmail", "scamReplyTo", "scamPhone"] as const) {
    const value = clean(prefill[key]);
    if (value) params.set(key, value);
  }
  // Added LAST, and only when there is something for it to label.
  //
  // A source alone is not worth a link: it says how someone arrived at a form
  // carrying nothing, which is the bare /report page with extra characters.
  // Written before the identifiers it would also defeat the documented
  // "returns '' when there is nothing worth carrying" contract, since callers
  // fall back to the bare URL on an empty string and would instead emit
  // `/report?source=…`.
  //
  // Allowlisted on the way out as well as the way in: a caller passing
  // something arbitrary gets it dropped rather than reflected into a link we
  // then publish in an email or an extension popup.
  if (
    params.toString() &&
    prefill.source &&
    REPORT_SOURCES.includes(prefill.source)
  ) {
    params.set("source", prefill.source);
  }
  return params.toString();
}

/**
 * Read a prefill back out of query params. Everything is validated: an unknown
 * type is dropped rather than trusted, and over-long values are ignored. The
 * params arrive from an emailed link, so treat them as untrusted input — the
 * form renders them into fields the reporter can see and edit before submitting.
 */
export function parseReportPrefill(params: URLSearchParams | Record<string, string | string[] | undefined>): ReportPrefill {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  const rawType = get("type");
  const type = SCAM_TYPES.find((t) => t === rawType);
  // An unrecognised source is DROPPED, not bucketed as "unknown". Unlike the
  // surface enum in reportStore — where a miswired first-party client should
  // show up as unattributed volume — this value arrives from a link anyone can
  // edit, so a catch-all bucket would fill with whatever strangers typed and
  // read as if it meant something.
  const source = REPORT_SOURCES.find((s) => s === get("source"));

  return {
    ...(type ? { type } : {}),
    ...(source ? { source } : {}),
    ...(clean(get("scamUrl")) ? { scamUrl: clean(get("scamUrl")) } : {}),
    ...(clean(get("scamEmail")) ? { scamEmail: clean(get("scamEmail")) } : {}),
    ...(clean(get("scamReplyTo")) ? { scamReplyTo: clean(get("scamReplyTo")) } : {}),
    ...(clean(get("scamPhone")) ? { scamPhone: clean(get("scamPhone")) } : {}),
  };
}
