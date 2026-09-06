import { NextRequest, NextResponse } from "next/server";
import { analyzeContent } from "@veriguard/engine/scamDetector";
import { CHECK_RATE_LIMIT, checkAndRecordRateLimit, incrementCheckCount, recordTargetRegion } from "@/lib/reportStore";
import { inferTargetRegion } from "@/lib/targetRegion";
import { clientIpFromHeaders } from "@/lib/geo";
import { getUrlhausBlocklist } from "@/lib/urlhausBlocklist";
import { resolveRegion } from "@/lib/regionResolver";
import { corsHeaders, corsPreflightHeaders } from "@/lib/cors";

// IMPORTANT: This route performs ONLY string analysis on the submitted content.
// It must NEVER make an outbound HTTP request, DNS lookup, or socket connection
// to any URL contained in the input. Doing so would notify the scammer's
// infrastructure that their link is under investigation. The CSP header
// (connect-src 'self') in next.config.ts enforces this at the browser layer;
// this comment is the server-side contract.
//
// The URLhaus blocklist fetch below is to a fixed trusted endpoint (abuse.ch),
// NOT to any user-supplied URL — it does not violate the contract above.

/**
 * CORS preflight.
 *
 * A JSON POST is not a "simple" request — its Content-Type triggers a
 * preflight — so without this the browser's OPTIONS would 405 and the real
 * request would never be sent. An origin that is not allowlisted gets a bare
 * 204 with no CORS headers, which is what makes the browser refuse the
 * subsequent request.
 */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsPreflightHeaders(req.headers.get("origin"), ["POST"]),
  });
}

export async function POST(req: NextRequest) {
  // Computed once and attached to every exit path below. A cross-origin caller
  // that gets a 429 or a 400 without these headers sees an opaque network
  // failure instead of the message, which is a bad experience and a confusing
  // one to debug from inside an extension.
  const cors = corsHeaders(req.headers.get("origin"));

  try {
    // Throttle before parsing or analysing — this endpoint is public and
    // unauthenticated, and analysis is the expensive part. The IP is used as a
    // transient key only and is never stored.
    if (!checkAndRecordRateLimit(`check:${clientIpFromHeaders(req.headers)}`, CHECK_RATE_LIMIT)) {
      // `code` rather than only prose: the client distinguishes this from a
      // generic failure to tell the reader to wait rather than to retry, and
      // matching on a message string would break the moment it is reworded or
      // translated.
      return NextResponse.json(
        { error: "Too many checks — give it a minute and try again.", code: "rate_limited" },
        { status: 429, headers: cors },
      );
    }

    const { content, region, surface, shareRegion }: {
      content: string;
      region?: string;
      surface?: string;
      /**
       * Opt-out for target-region inference. Defaults to on: the inference is
       * aggregate-only — a day-bucketed counter with no per-check row, no IP
       * and no content — so there is no per-user record to withhold, and the
       * coverage question it answers is one the project cannot otherwise ask.
       * A client sending `false` is excluded from the aggregate entirely.
       */
      shareRegion?: boolean;
    } = await req.json();

    if (!content?.trim()) {
      return NextResponse.json({ error: "Missing content" }, { status: 400, headers: cors });
    }

    // Explicit choice wins over the platform geo header; falls back to the
    // default region when neither is available (e.g. local dev).
    const resolvedRegion = resolveRegion(req.headers, region);

    // Fetch the live blocklist in parallel with nothing else — it's cached for
    // 6 hours so this is effectively free on all but the first request per window.
    const blocklist = await getUrlhausBlocklist();

    // Pull each identifier out of the input and assess it on its own. All
    // analysis is pure string work — no outbound request is made to the input.
    // Expansion runs server-side so the shortener sees our infrastructure and
    // never the user's IP (see the transport contract in lib/urlExpander.ts).
    const results = await analyzeContent(content, blocklist, resolvedRegion, { fetcher: fetch });

    // The surface is client-supplied, so it is validated against an allowlist
    // rather than trusted: an unchecked value would let anyone write arbitrary
    // rows into the telemetry aggregate. Only the two surfaces that actually
    // reach this route are accepted; anything else — including a missing value
    // from an older client — records as `web`, which is what this endpoint
    // served before the share target existed.
    const checkSurface = surface === "share" ? "share" : "web";
    incrementCheckCount(checkSurface).catch(() => {});

    // Which country the content appeared to be AIMED at, which is not the same
    // as `resolvedRegion` — that records where this request connected from. The
    // two disagreeing is the whole point: an HMRC impersonation forwarded from
    // Sydney is a GB campaign seen from AU, and nothing else records that.
    //
    // The DB write is deliberately not awaited, matching the check counter
    // above: the caller is waiting on a verdict, and a telemetry write must not
    // add latency to it. The INFERENCE itself is synchronous and does run on
    // the response path — it is pure string matching against module-scope
    // regexes, with no allocation per suffix.
    //
    // `.catch()` rather than bare `void`: `recordTargetRegion` swallows its own
    // failures today, so this is belt-and-braces, but a floated promise with no
    // handler turns any future throw into an unhandled rejection that takes the
    // process down rather than dropping a telemetry row.
    if (shareRegion !== false) {
      const target = inferTargetRegion(content);
      recordTargetRegion(checkSurface, target.region, target.confidence).catch(() => {});
    }
    return NextResponse.json({ results, region: resolvedRegion }, { headers: cors });
  } catch {
    return NextResponse.json(
      { error: "Something went sideways on our end" },
      { status: 500, headers: cors },
    );
  }
}
