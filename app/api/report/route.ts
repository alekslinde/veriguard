import { NextRequest, NextResponse } from "next/server";
import { guardSubmission } from "@/lib/submissionGuard";
import { generateReportId, storeReport, getStats } from "@/lib/reportStore";
import { stripTrackingParams } from "@veriguard/engine/urlSanitizer";
import { summariseAuth } from "@veriguard/engine/emailHeaders";
import { scrubPii } from "@/lib/piiScrubber";
import { distillEmailContent } from "@/lib/emailDistiller";
import { clientIpFromHeaders, locationFromHeaders } from "@/lib/geo";
import { resolveRegion } from "@/lib/regionResolver";
import { issueFormToken, verifyFormToken } from "@/lib/formToken";

// The client IP is used ONLY for transient, in-memory rate limiting inside
// guardSubmission. It is never written to the database — the only geographic
// trace a report carries is the coarse region string from locationFromHeaders.

// Same priority order as reportStore.getPrimaryIdentifier — a report only
// ever has one "accused" identifier, so the guard should cross-check the
// same one that will end up driving report_count aggregation.
function identifierFor(
  url: string,
  phone: string,
  email: string,
): { kind: "url" | "phone" | "email"; value: string } | undefined {
  if (url)   return { kind: "url",   value: url };
  if (phone) return { kind: "phone", value: phone };
  if (email) return { kind: "email", value: email };
  return undefined;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    // Malformed JSON — treat as bot
    return NextResponse.json({ success: true, reportId: generateReportId() });
  }

  const rawContent = String(body.content ?? "");
  const type = String(body.type ?? "");
  const rawScamUrl = String(body.scamUrl ?? "").slice(0, 2000);

  // For URL/QR reports strip tracking parameters before storing — keeping them
  // would let the scammer correlate which of their campaigns got reported.
  // For email reports, distil the raw RFC822 down to the legible scam content:
  // unwrap any forward to the original, keep only the human-meaningful headers
  // (From/Reply-To/To/Subject/Date) and the decoded body, dropping the
  // transport/auth header storm (ARC, DKIM, X-MS-Exchange-*), MIME boundaries,
  // quoted-printable encoding and the duplicate HTML part. Since we keep only an
  // allowlist of headers, the reporter's mailbox/delivery headers are dropped as
  // a side effect. After distillation, run PII scrubbing (emails, phones,
  // IPv4/IPv6, TFN/BSB/card) on the remaining content.
  const safeContent = scrubPii(
    (type === "url" || type === "qr")
      ? stripTrackingParams(rawContent)
      : type === "email"
        ? distillEmailContent(rawContent)
        : rawContent
  );
  const safeScamUrl = rawScamUrl ? stripTrackingParams(rawScamUrl) : "";

  // Email-authentication verdicts are submitted as raw tokens; summariseAuth
  // validates them against an allowlist and composes a defanged display string,
  // so nothing the client sends here reaches storage unchecked.
  const emailAuth = summariseAuth({
    spf:        String(body.spf ?? "").slice(0, 20),
    dkim:       String(body.dkim ?? "").slice(0, 20),
    dkimDomain: String(body.dkimDomain ?? "").slice(0, 255),
    dmarc:      String(body.dmarc ?? "").slice(0, 20),
  });

  // formToken carries a server-issued, signed render timestamp. When present
  // and valid it replaces the client-asserted loadedAt entirely — a value the
  // client can't choose is the only one worth timing against. Falls back to
  // the raw client timestamp only when REPORT_FORM_SECRET isn't configured
  // (local dev) or the token is missing/invalid, same as before.
  const verifiedIssuedAt = verifyFormToken(
    Number(body.formTokenIssuedAt ?? 0),
    String(body.formToken ?? ""),
  );

  const guardResult = guardSubmission({
    type,
    content: safeContent,
    description: String(body.description ?? "").slice(0, 1000),
    hp: String(body.hp ?? ""),
    loadedAt: verifiedIssuedAt ?? Number(body.loadedAt ?? 0),
    loadedAtVerified: verifiedIssuedAt !== null,
    ip: clientIpFromHeaders(req.headers),
    userAgent: req.headers.get("user-agent") ?? "",
    contentLength: rawContent.length,
    scamIdentifier: identifierFor(safeScamUrl, String(body.scamPhone ?? ""), String(body.scamEmail ?? "")),
  });

  // All verdicts return the same shape — the caller never learns which path was taken.
  const reportId = generateReportId();

  if (guardResult.verdict === "poison") {
    // Discard silently, return fake success
    return NextResponse.json({ success: true, reportId });
  }

  await storeReport(
    {
      id: reportId,
      type,
      content:     safeContent.slice(0, 2000),
      description: scrubPii(String(body.description ?? "").slice(0, 1000)),
      contact:     String(body.contact ?? "").slice(0, 200),
      submittedAt: Date.now(),
      location:    locationFromHeaders(req.headers),
      region:      resolveRegion(req.headers, body.region),
      scamUrl:     safeScamUrl,
      scamPhone:   String(body.scamPhone ?? "").slice(0, 50),
      scamEmail:   String(body.scamEmail ?? "").slice(0, 200),
      scamReplyTo: String(body.scamReplyTo ?? "").slice(0, 200),
      emailAuth,
    },
    guardResult.verdict === "suspect",
  );

  return NextResponse.json({ success: true, reportId });
}

export async function GET() {
  const { reports } = await getStats();
  const formToken = issueFormToken();
  return NextResponse.json({
    totalReports: reports,
    ...(formToken ? { formToken: formToken.token, formTokenIssuedAt: formToken.issuedAt } : {}),
  });
}
