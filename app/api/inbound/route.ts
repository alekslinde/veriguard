import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { analyzeContent } from "@veriguard/engine/scamDetector";
import { getUrlhausBlocklist } from "@/lib/urlhausBlocklist";
import { analyseEmailSource } from "@/lib/emailSource";
import { formatVerdictEmail } from "@/lib/verdictSummary";
import { checkAndRecordRateLimit, incrementCheckCount, recordCheckEvent, recordTargetRegion } from "@/lib/reportStore";
import { inferTargetRegion } from "@/lib/targetRegion";
import { SITE_URL } from "@/lib/siteUrl";

// Inbound webhook for the forward-to-us flow. A Cloudflare Email Worker (see
// workers/inbound-email/) receives a forwarded suspicious email, POSTs the raw
// RFC822 here, and sends the verdict we return back to the forwarder. It then
// POSTs `{ delivered: true }` here once that reply has actually gone out, which
// is what increments the public "scams checked" counter — see that branch.
//
// PRIVACY: we analyse the raw email entirely in memory and return a verdict.
// The raw email is NEVER stored — only an anonymous aggregate counter is
// incremented. This mirrors the client-side-only posture of /api/check.
//
// SECURITY: this route is the trust boundary. Only the Worker knows
// INBOUND_SECRET, so a constant-time check on the shared header gates entry.
// We always return 200 (even on rate-limit / bad input) so the Worker never
// bounces mail back to a possibly-spoofed sender.
//
// Like /api/check, analysis here makes NO outbound request to any URL in the
// email — the only network calls are the trusted abuse.ch blocklist fetch.

const MAX_RAW_BYTES = 1_000_000; // 1 MB — defence in depth; Worker also caps.

function secretOk(req: NextRequest): boolean {
  const expected = process.env.INBOUND_SECRET;
  if (!expected) return false; // not configured → closed by default
  const got = req.headers.get("x-inbound-secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual requires equal length; length mismatch is itself a fail.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { raw?: string; from?: string; delivered?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true, skip: "bad-json" });
  }

  const raw = typeof body.raw === "string" ? body.raw : "";
  const from = typeof body.from === "string" ? body.from.trim().toLowerCase() : "";

  // Delivery confirmation. The Worker calls back here once message.reply() has
  // actually succeeded, and that — not the analysis — is when a person has a
  // verdict in hand. Counting at analysis time would inflate "scams checked"
  // with replies Cloudflare rejected (it refuses to reply on a transaction whose
  // incoming forward failed DMARC), so the increment lives here instead.
  //
  // A confirmation carries ONLY `delivered` and `from`. Rejecting a body that
  // also carries `raw` keeps the two request kinds unambiguous: piggybacking a
  // confirmation onto an analysis POST would otherwise count the check while
  // returning no reply, so the Worker would send nothing and the counter would
  // climb anyway. Fail loudly here rather than let that be a silent trap.
  if (body.delivered === true) {
    if (raw) {
      return NextResponse.json({ ok: true, skip: "delivered-with-raw" });
    }
    // Rate-limited on the same per-sender budget as the analysis path, under
    // its own key namespace so the two don't starve each other. Without this
    // the increment is unbounded: the analysis path's limiter used to bound it
    // structurally, and a secret-holder (or a Cloudflare retry of email() after
    // a successful reply) could otherwise inflate a number we publish.
    if (from && !checkAndRecordRateLimit(`delivered:${from}`)) {
      return NextResponse.json({ ok: true, skip: "rate-limited" });
    }
    await incrementCheckCount("email").catch(() => {});
    return NextResponse.json({ ok: true, counted: true });
  }

  if (!raw || raw.length > MAX_RAW_BYTES) {
    return NextResponse.json({ ok: true, skip: "empty-or-too-large" });
  }

  // Per-sender throttle (reuses the in-memory limiter keyed on the forwarder).
  // On limit we no-op with 200 so we never auto-reply in a tight loop or become
  // a reflector — the Worker simply sends nothing.
  if (from && !checkAndRecordRateLimit(`inbound:${from}`)) {
    return NextResponse.json({ ok: true, skip: "rate-limited" });
  }

  try {
    // Record the attempt BEFORE the work that can throw. Recording after a
    // successful analysis would drop every crash from the `analysed` volume,
    // making the email path look healthiest exactly when it is failing most.
    // This counts forwards we accepted and tried to analyse — not successes.
    void recordCheckEvent("email", "analysed");

    // Reach the ORIGINAL scam inside the forward and run the shared analysis —
    // the top-level headers belong to the forwarder, not the scammer.
    const { source, original, headers, identityFlags, tracking } = analyseEmailSource(raw);

    const blocklist = await getUrlhausBlocklist();
    // No region argument: this request originates from the inbound-email
    // Worker, so geo headers describe the Worker's edge location, not the
    // forwarder's. Guessing from them would be worse than the default. If
    // per-region email checking is wanted later, derive it from the
    // forwarding address, not the connection.
    // Server-side expansion, as in /api/check — the forwarder's IP is never
    // exposed to a shortener.
    const results = await analyzeContent(original, blocklist, undefined, { fetcher: fetch });

    // Which country the scam was aimed at — the same aggregate /api/check
    // writes, on the surface that carries the traffic. Without this the
    // aggregate silently describes web and share only while presenting as
    // "checks", and forward-to-check is the surface most likely to carry a
    // CROSS-BORDER campaign, which is the disagreement the data exists to
    // record. The evidence is discarded with this request and cannot be
    // backfilled, so an unwired path loses it permanently.
    //
    // Inferred from `original` — the extracted scam — not `raw`: the top-level
    // headers belong to the forwarder, so inferring from those would attribute
    // the campaign to whoever reported it.
    //
    // Aggregate-only, exactly as on the web path: a day-bucketed counter keyed
    // on (day, surface, region, confidence), with no per-message row and no
    // fragment of the content that produced it. There is no `shareRegion`
    // signal on this path to honour — a forwarding mail client cannot send one.
    //
    // Not awaited, and `.catch()` rather than bare `void`: a telemetry write
    // must never add latency to a reply or fail a check, and a floated promise
    // with no handler turns a future throw into an unhandled rejection.
    const target = inferTargetRegion(original);
    recordTargetRegion("email", target.region, target.confidence).catch(() => {});

    const pixelReport = tracking.pixelReport.hasTrackingPixels ? tracking.pixelReport : null;

    const reply = formatVerdictEmail({
      results,
      emailFlags: identityFlags,
      pixelReport,
      trackingFindings: tracking.findings,
      // Lets the reply end with a one-tap link to a prefilled report form. Only
      // the extracted identifiers travel in that link — the raw email is still
      // discarded with this request. See lib/reportPrefill.ts.
      siteUrl: SITE_URL,
      senderAddress: headers.fromAddress,
      replyToAddress: headers.replyTo,
    });

    // NOT counted here: the Worker confirms delivery with a `delivered` POST
    // once the reply is actually sent. See the branch at the top of this route.

    // Return the formatted reply for the Worker to send. `source` lets the
    // Worker (or logs) know whether we got a high-fidelity attachment or a
    // lower-fidelity inline quote. The raw email is now out of scope and
    // discarded with this request.
    return NextResponse.json({ ok: true, source, reply });
  } catch {
    // Never bounce — acknowledge and send nothing.
    return NextResponse.json({ ok: true, skip: "analysis-error" });
  }
}

// Only POST is meaningful; anything else is a probe.
export async function GET() {
  return NextResponse.json({ error: "method not allowed" }, { status: 405 });
}
