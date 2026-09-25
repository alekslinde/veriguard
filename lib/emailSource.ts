// Single entry point for analysing a pasted/forwarded email's source.
//
// Three surfaces analyse email source — the Check page, the report form, and the
// inbound forward-to-us webhook. They must agree, so the chain lives here once:
//
//   unwrapForwarded → parseEmailHeaders → analyseEmailIdentities → analyseEmailTracking
//
// Every caller goes through analyseEmailSource so they can't drift (e.g. one
// forgetting to unwrap a forwarded email and analysing the forwarder instead of
// the original scammer). Pure string work — no I/O, no fetching of any URL.

import { parseEmailHeaders, analyseEmailIdentities, EmailHeaders } from "@veriguard/engine/emailHeaders";
import { analyseEmailTracking, EmailTrackingReport } from "@/lib/emailTracking";
import { unwrapForwarded, ForwardSource, UnwrapOptions } from "@/lib/forwardedEmail";

export interface EmailSourceAnalysis {
  // How the original was located inside the (possibly forwarded) input.
  source: ForwardSource;
  // The unwrapped original message source (headers + body), fed to every step.
  original: string;
  // Parsed headers of the original (From/Reply-To/auth/…).
  headers: EmailHeaders;
  // Sender-spoofing flags (display-name masking, From≠Reply-To, auth fails, …).
  // Empty when there's no From address to analyse.
  identityFlags: string[];
  // Broad tracking surface (pixels, click redirects, CSS beacons, read receipts…).
  tracking: EmailTrackingReport;
}

// Pass `{ forwarded: true }` when the input is someone forwarding a suspect
// email to us, so nothing about the forwarder is analysed — see UnwrapOptions.
export function analyseEmailSource(raw: string, opts: UnwrapOptions = {}): EmailSourceAnalysis {
  const { raw: original, markup, source } = unwrapForwarded(raw, opts);
  const headers = parseEmailHeaders(original);
  const identityFlags = headers.fromAddress ? analyseEmailIdentities(headers).flags : [];
  // The original's decoded HTML is read here and nowhere else: it is where
  // pixels and beacons live, and only tracking analysis looks for them.
  const tracking = analyseEmailTracking(markup ? `${original}\n\n${markup}` : original);
  return { source, original, headers, identityFlags, tracking };
}
