// Cloudflare Email Worker for the forward-to-us flow.
//
// Flow: a user forwards a suspicious email to check@<domain> → Cloudflare Email
// Routing invokes this Worker's email() handler → we stream the raw RFC822,
// POST it to the Next app's /api/inbound (which analyses in memory and returns
// a plain-English verdict) → we reply to the forwarder with that verdict.
//
// Why reply via message.reply() rather than a fresh send: replying to the
// inbound message is the one outbound path Cloudflare allows without verifying
// each destination, and it can ONLY go back to the original sender. That makes
// abusing us as an open relay impossible — we can email the forwarder and no
// one else. (We still rate-limit per sender on the API side as defence depth.)

import { EmailMessage } from "cloudflare:email";
// Extension-ful: wrangler resolves either, but bare Node (which runs this
// Worker's tests) only resolves the explicit form.
import { buildReplyMime } from "./reply.ts";

export interface Env {
  // Set via `wrangler secret put` — must match the Next app's INBOUND_SECRET.
  INBOUND_SECRET: string;
  // Full URL of the Next webhook, e.g. https://veriguard.app/api/inbound
  INBOUND_WEBHOOK_URL: string;
}

/**
 * The authentication verdicts recorded on the forward, grouped one bracket per
 * set as written: "[dkim=pass dmarc=pass spf=pass] [dmarc=none spf=none]".
 *
 * MEASURED: these do NOT discriminate a refused forward from an answered one.
 * Forwards that were answered carried the same "dmarc=none spf=none" tokens as
 * forwards that were refused, and forwarding an airline notice and a bank
 * notice — both from domains publishing DMARC — produced verdicts identical to
 * forwarding a scam email. The tokens describe how the forwarding provider
 * relays, not the mail being forwarded, and not whether a reply is possible.
 *
 * Kept because a per-message authentication fault would still show up here, and
 * ruling it out on every forward is what let it be ruled out at all. Not
 * because it explains the refusals seen so far — it does not.
 *
 * A forward's authentication has no bearing on whether its contents are
 * analysed: every forward goes to the engine whatever these say. A failing
 * verdict on the mail SOMEONE FORWARDED is a scam signal, scored there (see
 * emailHeaders.ts), never a gate here.
 *
 * Only the mechanism=result pairs are kept, in the order written and
 * de-duplicated within a set but never across sets. The full header also
 * carries the sending host, envelope addresses and signature domains — a
 * correspondent's details, which answer nothing a verdict does not and do not
 * belong in a log.
 */
function authSummary(headers: Headers): string {
  const raw = headers.get("Authentication-Results");
  if (!raw) return "none recorded";
  const groups = raw
    .toLowerCase()
    // Quoted strings are dropped before splitting: a DKIM signature value may
    // contain a comma, which would otherwise split one MTA's verdicts into two
    // and invent a second identity that was never there.
    .replace(/"[^"]*"/g, "")
    .split(",")
    .map(
      (part) =>
        part.match(
          /\b(?:dmarc|spf|dkim|compauth|arc)=(?:pass|fail|none|neutral|softfail|hardfail|temperror|permerror|bestguesspass)\b/g,
        ) ?? [],
    )
    .filter((found) => found.length > 0)
    .map((found) => [...new Set(found)].join(" "));

  if (groups.length === 0) return "none recorded";
  // De-duplicated across sets too: an identical set repeated says nothing extra,
  // while two DIFFERENT sets are the finding.
  return [...new Set(groups)].map((g) => `[${g}]`).join(" ");
}

/**
 * The SHAPE of the forward's envelope: which headers are present, and how the
 * addresses in them relate to each other — never the addresses themselves.
 *
 * Why this exists: two accounts are answered on every forward and two are
 * refused on every forward, whatever they send. Content, size, chain length and
 * authentication are all ruled out — measured identical across both outcomes —
 * so whatever separates them is not yet visible in the log. The envelope is
 * where a difference between two plain accounts can still hide: a display name,
 * a Reply-To, a Return-Path that disagrees with From, a Sender header.
 *
 * Booleans and relations only. "from=addr-only replyto=absent envelope=matches"
 * says everything a comparison needs; the addresses themselves would put the
 * forwarder's correspondents in a log to answer a question about our own
 * configuration.
 *
 * Diagnostic. Remove once the refusals are explained.
 */
function envelopeShape(headers: Headers, from: string, to: string): string {
  const addrOf = (v: string | null) => (v ?? "").match(/<([^>]+)>/)?.[1] ?? (v ?? "").trim();
  const bare = (v: string) => v.toLowerCase().replace(/^.*</, "").replace(/>.*$/, "").trim();

  const fromHeader = headers.get("From");
  const replyTo = headers.get("Reply-To");
  const returnPath = headers.get("Return-Path");
  const sender = headers.get("Sender");

  const parts = [
    // Did the From header carry a display name, or just an address?
    `from=${fromHeader ? (/</.test(fromHeader) ? "name+addr" : "addr-only") : "absent"}`,
    // A Reply-To pointing somewhere other than the sender changes who a reply
    // would reach, which is the one thing message.reply() is strict about.
    `replyto=${
      replyTo ? (bare(addrOf(replyTo)) === bare(from) ? "same-as-from" : "differs") : "absent"
    }`,
    // The envelope sender is what SPF is checked against, and a mismatch with
    // the header From is the ordinary signature of a relayed or forwarded send.
    `envelope=${
      returnPath
        ? bare(addrOf(returnPath)) === bare(from)
          ? "matches-from"
          : "differs-from"
        : "absent"
    }`,
    `sender-hdr=${sender ? "present" : "absent"}`,
    // The address we received on decides the reply's From, and must be a domain
    // the platform will sign for.
    `rcpt=${to.includes("@") ? "ok" : "malformed"}`,
  ];
  return parts.join(" ");
}

const MAX_RAW_BYTES = 1_000_000; // drop anything larger before calling the API

interface VerdictReply {
  ok: boolean;
  skip?: string;
  source?: string;
  reply?: { subject: string; text: string; html: string };
}

async function streamToString(stream: ReadableStream, maxBytes: number): Promise<string | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      reader.cancel();
      return null; // too large — bail
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(merged);
}

const handler = {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const raw = await streamToString(message.raw, MAX_RAW_BYTES);
    if (!raw) {
      // Over MAX_RAW_BYTES or unreadable. Still a forward someone is waiting on,
      // so say so rather than dropping in silence.
      console.warn(`inbound dropped: raw unreadable or over ${MAX_RAW_BYTES} bytes`);
      return;
    }

    let data: VerdictReply;
    try {
      const res = await fetch(env.INBOUND_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-inbound-secret": env.INBOUND_SECRET,
        },
        body: JSON.stringify({ raw, from: message.from, to: message.to }),
      });

      // A non-2xx RESOLVES — it does not throw — so without this check the
      // error body falls through to the `!data.reply` return below and a hard
      // failure becomes indistinguishable from the API deciding not to reply.
      // That is not hypothetical: a stale INBOUND_SECRET 401s every call, and
      // the whole forward-to-check path went down with nothing logged anywhere
      // until someone noticed replies had stopped arriving. 401 and 403 are
      // called out by name because they mean the shared secret has drifted
      // between the Worker and the app — a configuration fault that no amount
      // of retrying fixes, and the first thing to check when mail goes quiet.
      if (!res.ok) {
        const hint =
          res.status === 401 || res.status === 403
            ? " — INBOUND_SECRET likely does not match the app's; re-run the worker deploy after rotating it"
            : "";
        console.error(`inbound webhook rejected: HTTP ${res.status}${hint}`);
        return;
      }

      data = (await res.json()) as VerdictReply;
    } catch (err) {
      console.error("inbound webhook unreachable:", err);
      return; // drop rather than bounce
    }

    // No reply means the API deliberately skipped — rate-limited, empty, or an
    // analysis error it already accounted for. `skip` carries which, so log it
    // rather than inferring; this is the one quiet path that is working as
    // intended, and naming the reason keeps it distinguishable from the
    // failures above.
    if (!data.reply) {
      console.warn(`inbound skipped by API: ${data.skip ?? "no reason given"}`);
      return;
    }

    const inboundReferences = message.headers.get("References");

    // The platform refuses a reply for several distinct reasons behind one error
    // string, and the refusal names none of them. Everything measurable here is
    // therefore recorded on EVERY forward, refused or not: a refusal says
    // nothing on its own, and only becomes readable against the same figures
    // from forwards that were answered. Four candidate causes have been ruled
    // out exactly that way, by coming back identical on both sides.
    //
    // Counts, bare verdict tokens and envelope shape — no message IDs, no
    // correspondent addresses, no sending hosts.
    const referenceCount = inboundReferences ? inboundReferences.trim().split(/\s+/).length : 0;
    const auth = authSummary(message.headers);
    const envelope = envelopeShape(message.headers, message.from, message.to);
    console.log(
      `inbound References entries: ${referenceCount}, auth: ${auth}, envelope: ${envelope}`,
    );

    // Build a reply addressed back to the forwarder. message.reply() restricts
    // the recipient to the original sender, so this can't be redirected; the
    // From is the receiving address so Cloudflare DKIM-signs it for that domain.
    const mime = buildReplyMime(data.reply, {
      from: message.to,
      to: message.from,
      messageId: message.headers.get("Message-ID"),
      references: inboundReferences,
    });

    try {
      await message.reply(new EmailMessage(message.to, message.from, mime));
    } catch (err) {
      // Cloudflare refused the reply. It reports several distinct causes
      // through one error, so pass its own wording through rather than naming
      // one. Naming a cause here has been wrong every time it was tried: this
      // line once asserted DMARC, which sent an investigation away from the
      // real fault — a duplicated entry in the References header we built,
      // which refused every forward until it was fixed. The authentication
      // reading that replaced it was disproved the same way, by forwards that
      // were answered carrying identical verdicts to forwards that were not.
      //
      // Everything measured rides along, because a refusal is only readable
      // against the same figures from forwards that were answered.
      //
      // Nothing to retry on the inbound transaction. No delivery confirmation
      // is sent, so this forward is correctly never counted as a check.
      console.warn(
        `reply refused by the mail platform (inbound References entries: ${referenceCount}, ` +
          `auth: ${auth}, envelope: ${envelope}):`,
        err,
      );
      return;
    }

    // The reply is out — only now has someone actually received a verdict, so
    // this is what increments the public counter. Best-effort: a failed
    // confirmation costs us a count, which is the right way to be wrong for a
    // number we publish. `from` lets the API rate-limit confirmations per
    // sender; no `raw` is sent, which is how the API tells the two request
    // kinds apart.
    try {
      const res = await fetch(env.INBOUND_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-inbound-secret": env.INBOUND_SECRET,
        },
        body: JSON.stringify({ delivered: true, from: message.from }),
      });
      // A non-2xx resolves rather than throwing, so without this a rotated
      // secret (401) or a 500 would silently stop counting every delivered
      // reply — the same black hole the DMARC warn above exists to prevent.
      if (!res.ok) {
        console.warn("delivery confirmation rejected:", res.status);
      }
    } catch (err) {
      // Undercounting is acceptable; retrying is not worth a second failure
      // mode. Still log it so a persistent outage is visible.
      console.warn("delivery confirmation failed:", err);
    }
  },
};

// The Email Routing runtime consumes this default export's `email` method.
// Named before exporting to satisfy import/no-anonymous-default-export; the
// exported shape is unchanged.
export default handler;

// Minimal ambient type for the Email Routing handler argument. The full type
// ships with @cloudflare/workers-types; declared here so the file type-checks
// standalone without pulling that into the Next tsconfig.
interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  reply(message: EmailMessage): Promise<void>;
}
