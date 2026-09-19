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

    // Build a reply addressed back to the forwarder. message.reply() restricts
    // the recipient to the original sender, so this can't be redirected; the
    // From is the receiving address so Cloudflare DKIM-signs it for that domain.
    const mime = buildReplyMime(data.reply, {
      from: message.to,
      to: message.from,
      messageId: message.headers.get("Message-ID"),
      references: message.headers.get("References"),
    });

    try {
      await message.reply(new EmailMessage(message.to, message.from, mime));
    } catch (err) {
      // Cloudflare refused the reply. It reports several distinct causes
      // through one error — the forward failed DMARC, the message is "not
      // repliable", or a per-message reply limit is spent — so pass its own
      // wording through rather than naming a cause. An earlier version of this
      // line asserted DMARC, and when a Gmail forward was refused (Gmail
      // publishes p=none and passes its own DMARC, so that reading was almost
      // certainly wrong) the log actively pointed away from the real fault.
      //
      // Nothing to retry on the inbound transaction. No delivery confirmation
      // is sent, so this forward is correctly never counted as a check.
      console.warn("reply refused by the mail platform:", err);
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
