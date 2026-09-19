// Reply MIME building — pure, no Cloudflare runtime imports, so it can be
// unit-tested under plain Node/vitest. The email() handler in index.ts uses it.

// Use the /browser entrypoint: the default (Node) build imports Node built-ins
// like "path", which the Cloudflare Workers runtime doesn't provide and which
// fails the build ("Could not resolve path"). The browser build is built for
// exactly this kind of runtime and avoids them.
import { createMimeMessage } from "mimetext/browser";

export interface ReplyContent {
  subject: string;
  text: string;
  html: string;
}

// A mail platform may refuse to reply to a message carrying more than 100
// References entries, as a reply-loop and abuse guard. Each forwarding hop adds
// one, and the forward-to-check flow is fed by exactly the kind of mail that has
// been passed around a group before it reaches us, so an unbounded chain walks a
// real thread into that ceiling. RFC 5322 §3.6.4 lets an implementation drop
// entries it cannot keep, so keep the root (what clients group the thread by)
// and the most recent few (what they use to nest the reply) and drop the middle.
const REFERENCES_KEEP_ROOT = 1;
const REFERENCES_KEEP_RECENT = 20;

export function truncateReferences(references: string): string {
  const ids = references.split(/\s+/).filter(Boolean);
  if (ids.length <= REFERENCES_KEEP_ROOT + REFERENCES_KEEP_RECENT) return ids.join(" ");
  return [...ids.slice(0, REFERENCES_KEEP_ROOT), ...ids.slice(-REFERENCES_KEEP_RECENT)].join(" ");
}

// Build the raw MIME for the verdict reply. Deliverability/threading notes:
//   • From = the address that RECEIVED the mail (the inbound `to`). Cloudflare
//     requires the reply's sender domain to match the receiving domain, and
//     DKIM-signs it automatically with that domain's key — so this From
//     alignment is what makes SPF/DKIM/DMARC pass and keeps the reply out of
//     spam. (Publish the SPF/DKIM/DMARC DNS records Cloudflare provides.)
//   • In-Reply-To + References thread the verdict under the user's forward in
//     their client, which also reads as a genuine reply, not a cold send.
//   • Auto-Submitted: auto-replied marks this as an automated response per
//     RFC 3834 so other auto-responders don't bounce-loop with us.
export function buildReplyMime(
  reply: ReplyContent,
  opts: { from: string; to: string; messageId?: string | null; references?: string | null },
  createMime: typeof createMimeMessage = createMimeMessage,
): string {
  const msg = createMime();
  msg.setSender({ name: "Veriguard", addr: opts.from });
  msg.setRecipient(opts.to);
  msg.setSubject(reply.subject);
  if (opts.messageId) msg.setHeader("In-Reply-To", opts.messageId);
  // Preserve any existing References chain and append the message we're replying
  // to, so the thread stays intact across clients, bounded by truncateReferences.
  const references = truncateReferences(
    [opts.references, opts.messageId].filter(Boolean).join(" ").trim(),
  );
  if (references) msg.setHeader("References", references);
  msg.setHeader("Auto-Submitted", "auto-replied");
  msg.addMessage({ contentType: "text/plain", data: reply.text });
  msg.addMessage({ contentType: "text/html", data: reply.html });
  return msg.asRaw();
}
