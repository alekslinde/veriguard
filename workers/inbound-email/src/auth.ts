// Reading the authentication verdicts a forward arrives with.
//
// Two jobs, deliberately separate:
//
//   - `authSummary` describes a forward for the log. Diagnostic; gates nothing.
//   - `freshSendAllowed` decides whether a forward the platform REFUSED to
//     reply to may instead be answered by a fresh send. That one is a security
//     boundary — see its own comment.
//
// Both read only the verdicts. A forward's authentication never decides whether
// its contents are analysed: every forward goes to the engine whatever these
// say. A failing verdict on the mail SOMEONE FORWARDED is a scam signal, scored
// in the engine, never a gate here.

/**
 * The authentication verdicts recorded on the forward, grouped one bracket per
 * set as written and labelled by who wrote it:
 * "[receiver: dkim=pass dmarc=pass spf=pass] [other: dmarc=none spf=none]".
 *
 * The label is the point: a forward carries sets from several servers, and
 * unlabelled, the log could not say which set the receiving platform wrote.
 * Only whether the platform wrote a set is kept — the other server names are
 * often the forwarder's own mail host, which does not belong in a log.
 *
 * Only the mechanism=result pairs are kept, in the order written and
 * de-duplicated within a set but never across sets. The full header also
 * carries the sending host, envelope addresses and signature domains — a
 * correspondent's details, which answer nothing a verdict does not.
 */
export function authSummary(headers: Headers): string {
  const groups = [
    ...authSets(headers.get("Authentication-Results"), ""),
    // ARC copies of the same verdicts, which is where a platform records its
    // own when it does not write the plain header.
    ...authSets(headers.get("ARC-Authentication-Results"), "arc "),
  ];
  if (groups.length === 0) return "none recorded";
  // De-duplicated across sets too: an identical set repeated says nothing extra,
  // while two DIFFERENT sets are the finding.
  return [...new Set(groups)].map((g) => `[${g}]`).join(" ");
}

export function authSets(raw: string | null, prefix: string): string[] {
  if (!raw) return [];
  return (
    raw
      .toLowerCase()
      // Quoted strings are dropped before splitting: a DKIM signature value may
      // contain a comma, which would otherwise split one MTA's verdicts into two
      // and invent a second identity that was never there.
      .replace(/"[^"]*"/g, "")
      .split(",")
      .map((part) => {
        const found =
          part.match(
            /\b(?:dmarc|spf|dkim|compauth|arc)=(?:pass|fail|none|neutral|softfail|hardfail|temperror|permerror|bestguesspass)\b/g,
          ) ?? [];
        return found.length > 0
          ? `${prefix}${writerOf(part)}: ${[...new Set(found)].join(" ")}`
          : "";
      })
      .filter(Boolean)
  );
}

/**
 * Whether the receiving platform wrote this set, from the server name that
 * opens it. An ARC set opens with its instance number ("i=1; host; …"), so
 * that is skipped first.
 *
 * Anyone can put a header naming the platform into their own mail. For the log
 * that is harmless — it is diagnostic. `freshSendAllowed` does NOT trust this
 * alone; see there.
 */
export function writerOf(set: string): "receiver" | "other" {
  const fields = set.split(";").map((f) => f.trim());
  const host = /^i=\d+$/.test(fields[0] ?? "") ? fields[1] : fields[0];
  const name = (host ?? "").split(/\s+/)[0];
  return name.includes("cloudflare") ? "receiver" : "other";
}

/**
 * Whether a forward the platform refused to reply to may instead be answered
 * by a FRESH send — a message composed to the forwarder rather than a reply
 * riding the inbound transaction.
 *
 * WHY THIS IS A SECURITY BOUNDARY. `message.reply()` can only reach whoever
 * sent the forward, which is what makes the service impossible to aim at
 * anyone else. A fresh send has no such property: point it at a forged From
 * address and it mails a stranger, with our domain's signature on it, carrying
 * "here is the verdict on the email you sent us". That is a usable harassment
 * primitive and a usable phishing lure, funded by us.
 *
 * So the gate is not "did the forward look fine" but "did the RECEIVING
 * PLATFORM prove this forward really came from the domain it claims". Only a
 * DKIM pass does that — SPF passes for anyone who controls the connecting
 * host, and a From header is free to write. The signature must also be for the
 * sender's OWN domain: a valid signature from some other domain says only that
 * that domain sent something, not that this address did.
 *
 * Only Cloudflare's own verdict set is read. Anyone can add an
 * `Authentication-Results` header to their own mail claiming a pass, so a set
 * written by any other server is attacker-controlled input here, not evidence.
 * The receiver's is the first set on a message it accepted.
 *
 * Defaults closed: no readable verdict from the platform means no fresh send.
 *
 * NOT a prediction of whether reply() will be refused. The platform's own
 * header reports `dmarc=pass` on forwards it goes on to refuse, so the refusal
 * cannot be anticipated from the headers — it is observed by catching it, and
 * this function only decides what may happen next.
 */
export function freshSendAllowed(headers: Headers, from: string): boolean {
  const sender = domainOf(from);
  if (!sender) return false;

  for (const raw of [
    headers.get("Authentication-Results"),
    headers.get("ARC-Authentication-Results"),
  ]) {
    if (!raw) continue;
    // Same quote-stripping as authSets, and for the same reason: a signature
    // value may contain a comma and would otherwise split one set into two.
    for (const set of raw.toLowerCase().replace(/"[^"]*"/g, "").split(",")) {
      if (writerOf(set) !== "receiver") continue;
      for (const signing of dkimPassDomains(set)) {
        if (aligned(sender, signing)) return true;
      }
    }
  }
  return false;
}

/**
 * The domains of every `dkim=pass` in one verdict set.
 *
 * A set can carry several DKIM results — a forwarded message routinely holds
 * the forwarder's signature and the original sender's — so a pass is paired
 * with the `header.d` that FOLLOWS it, not with any `header.d` in the set. The
 * scan walks the set's fields in order and pairs each pass with the next
 * signing domain it sees, which is how the header is written.
 */
function dkimPassDomains(set: string): string[] {
  const domains: string[] = [];
  let awaitingDomain = false;
  // Split on whitespace only: field separators inside one set are spaces, and
  // a bounded split cannot backtrack on a hostile header.
  for (const field of set.split(/\s+/)) {
    if (field.startsWith("dkim=")) {
      // A later mechanism ends a pass that never named its domain.
      awaitingDomain = field === "dkim=pass";
      continue;
    }
    if (!awaitingDomain) continue;
    if (field.startsWith("header.d=")) {
      const d = field.slice("header.d=".length).replace(/[;>]+$/, "").trim();
      if (d) domains.push(d);
      awaitingDomain = false;
    } else if (field.includes("=") && !field.startsWith("header.")) {
      // Another mechanism's verdict — the unnamed pass is over.
      awaitingDomain = false;
    }
  }
  return domains;
}

/**
 * Whether a signing domain covers a sender's domain.
 *
 * Exact match, or the signing domain is a parent of the sender's — the
 * relaxed alignment DMARC itself allows, so mail from a subdomain signed at
 * the organisational domain still counts. Never the reverse: a signature from
 * a subdomain does not vouch for the parent, which anyone able to create a
 * subdomain could otherwise use.
 */
function aligned(sender: string, signing: string): boolean {
  return sender === signing || sender.endsWith(`.${signing}`);
}

/** The domain of an address, lowercased. Empty when there isn't one. */
function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at === -1) return "";
  return address
    .slice(at + 1)
    .replace(/[>\s]+$/, "")
    .trim()
    .toLowerCase();
}
