// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Where a message's real body starts — the one answer, in one place.
//
// Two wrappers sit in front of the text a user actually received. A mail client
// adds a header block; forwarding adds scaffolding, and forwarding a forward
// quote-marks the scaffolding too. Any rule that anchors on the *start* of a
// message has to see past both, and today exactly one does: the
// family-impersonation gate, whose opener anchor is the thing that distinguishes
// "Mum, send me $400" from "I'll ask mum about the weekend".
//
// It lived in `scamDetector.ts` while its only caller did. That gate's move into
// the signal registry is what separated them, and the choice at that point was
// the one `bareHost.ts` faced: re-export the guard from the entry point — which
// a signal module importing the scorer would make a cycle — or give it the module
// it should always have had. The third option, a local approximation, is the move
// this repo has paid for eight times across three rules, and both functions here
// are built from measured counter-examples rather than from a rule of thumb:
// `stripForwardingPrefix` strips a closed list of recognised shapes because
// skipping "anything before the first blank line" destroys the anchor it exists
// to protect, and `bodyAfterHeaders` checks that what precedes the blank line
// really looks like headers because a body whose second paragraph follows a
// blank line is not a header block. An approximation of either reproduces the
// false negative each guard was written to close.
//
// Both are re-exported from `scamDetector.ts`, which is where they were already
// reachable from and where the tests and one external caller import them.

/**
 * An RFC 5322-shaped header line.
 *
 * Broader than a named list, which missed "Cc:", "Bcc:" and every "X-" header a
 * client adds — and one unmatched line stops the scaffold loop, so an ordinary
 * Gmail forward left "Cc: …" in front of the body and the family anchor failed
 * on exactly the case the stripper exists for.
 *
 * Only counted after a forwarding marker, because this shape cannot be told
 * from prose: "Note: they told me to check this" matches it exactly. See the
 * guard in stripForwardingPrefix.
 */
const HEADER_LINE = /^\s*(?:[A-Za-z][A-Za-z0-9-]{1,40})\s*:\s.*$/;

/**
 * Scaffolding a forwarded or quoted message carries ahead of its real body.
 *
 * Each entry matches a whole line, except the inline forms (Fwd:, a chat
 * export's timestamp) which prefix the body on the same line and are stripped
 * in place. A closed list of recognised shapes rather than "skip anything
 * before the first blank line": arbitrary prose must NOT be skipped, or the
 * family gate's opener anchor stops meaning anything.
 */
const FORWARD_SCAFFOLD: RegExp[] = [
  /^\s*-{2,}\s*forwarded message\s*-{2,}\s*$/i,
  /^\s*begin forwarded message:?\s*$/i,
  /^\s*(?:fwd|fw|re)\s*:\s*/i,
  HEADER_LINE,
  /^\s*on .+ wrote:\s*$/i,
  // Chat-export line: "02/09/2026, 10:42 - Unknown: <body>"
  /^\s*\[?\d{1,2}[:/]\d{2}.*?\]?\s*[-–]\s*[^:]{0,40}:\s*/i,
];

/**
 * How many scaffold lines to skip before giving up and treating it as body.
 *
 * An ordinary Gmail forward runs to nine or more — marker, From, Date, Subject,
 * To, Cc, Reply-To, X-Mailer, Sent — and at 8 the leftovers stayed in front of
 * the body, so the family anchor failed on exactly the forwards this was built
 * to handle. Raised with room to spare; the loop stops at the first line that is
 * not recognised scaffolding, so the cap only bounds the pathological case
 * rather than deciding the common one.
 */
const MAX_SCAFFOLD_LINES = 25;

/**
 * Strip forwarding and quoting scaffolding from the front of a message.
 *
 * Forwarding is how people ask "is this real?", so a rule that anchors on the
 * start of a message has to see past the wrapper the forward added. Before
 * this, "---------- Forwarded message ----------" ahead of the "Hi Mum" script
 * took it from likely_scam to safe — the single most likely way for that text
 * to arrive here was also the one way it went unscored.
 *
 * Only leading scaffolding is removed, and only shapes on the list above. A
 * message that opens with ordinary prose is returned untouched.
 */
export function stripForwardingPrefix(text: string): string {
  // Quote markers come off first and per-line, because the two wrappers nest:
  // forwarding a message someone already forwarded you quote-marks the whole
  // thing, so the scaffold lines arrive as "> ---------- Forwarded message ---".
  // Stripping quotes only at the end left that shape unmatched, and each
  // wrapper worked alone while the pair — the commonest real case — did not.
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[ \t]*(?:>[ \t]?)+/, ""));
  let i = 0;
  let sawForwardMarker = false;
  let headersSeen = 0;
  while (i < lines.length && i < MAX_SCAFFOLD_LINES) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const hit = FORWARD_SCAFFOLD.find((re) => re.test(line));
    if (!hit) break;
    // A lone header-shaped line is not scaffolding. "Note: they told me to
    // check this" and "Warning: this looks dodgy" match the header pattern
    // exactly — syntax cannot separate them — so stripping on one line would let
    // any scam buy immunity by opening with a word and a colon. What a real
    // forward always has is a RUN: either an explicit marker/attribution, or
    // several consecutive headers. One line of either is ambiguous; two is not.
    if (hit === HEADER_LINE && !sawForwardMarker) {
      // Part of a run, looking either way: the last header in a block has no
      // header after it, so a forward-only test stripped every line but that
      // one and left it in front of the body.
      const next = lines[i + 1];
      const inRun =
        headersSeen > 0 || (next !== undefined && HEADER_LINE.test(next));
      if (!inRun) break;
      headersSeen++;
    }
    if (hit !== HEADER_LINE) sawForwardMarker = true;
    // An inline prefix leaves the body on the same line; a whole-line one does
    // not. Stripping in place keeps "Fwd: Hi Mum, …" anchorable.
    const remainder = line.replace(hit, "").trim();
    if (remainder) {
      lines[i] = remainder;
      break;
    }
    i++;
  }
  return lines.slice(i).join("\n").replace(/^\s+/, "");
}

/**
 * The body of an RFC 5322-ish message, or the whole string if it has no header
 * block. Used only for signals that care WHERE in the message something sits.
 *
 * Deliberately minimal — the real MIME walk lives in lib/emailDistiller, which
 * the engine cannot import and which prepends the headers it keeps anyway. All
 * this does is find the blank line ending the header block, and only when what
 * precedes it actually looks like headers, so a plain body whose second
 * paragraph follows a blank line is left alone.
 */
export function bodyAfterHeaders(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/);
  if (split === -1) return raw;
  const head = raw.slice(0, split);
  const looksLikeHeaders = head
    .split(/\r?\n/)
    .some((line) => /^[A-Za-z][A-Za-z0-9-]{1,40}:\s/.test(line));
  return looksLikeHeaders ? raw.slice(split).replace(/^\s+/, "") : raw;
}

/**
 * The text a start-of-message anchor should be tested against.
 *
 * Both wrappers, in the one order that works, named once so the two callers
 * cannot disagree about what "the start of the message" means. The header block
 * comes off first and only on the email channel, because that is the channel
 * where the caller hands us the headers: on the email path the first line is
 * "From:", so an anchor on the raw text can never match, and the family gate
 * silently did nothing for every real email until this step ran.
 *
 * Trimmed, because an anchor asserting `^` against leading whitespace fails for
 * a reason that has nothing to do with what the message says.
 */
export function anchorText(text: string, channel: string): string {
  return stripForwardingPrefix(channel === "email" ? bodyAfterHeaders(text) : text).trim();
}
