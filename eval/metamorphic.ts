// Metamorphic relations over the detection engine.
//
// The corpus eval answers "how often is the engine right", which needs labels
// and is therefore capped by how much labelled content exists — currently tens
// of cases, with confidence intervals the README is honest about. This file
// answers a different question that needs no labels at all: "is the engine
// SELF-CONSISTENT".
//
// A metamorphic relation is a rule about how a verdict must respond to a
// transformation of its input, expressed without knowing the right answer for
// either side. If "0412 345 678" and "+61 412 345 678" are the same number,
// they must score the same — whatever that score is. When they don't, the
// difference is a bug, and no one had to label anything to find it.
//
// This matters most exactly where the corpus is weakest. Nine benign cases
// cannot measure a false-positive rate, but every case in the corpus (and any
// string at all) can be transformed, so each relation multiplies the existing
// corpus into hundreds of consistency checks. It also probes the surface an
// evader actually attacks: a scammer does not write new scams to beat the
// detector, they rewrite the one they have until it slips through, which is
// precisely a metamorphic transformation.
//
// What a violation is NOT: proof the original verdict was correct. These
// relations police consistency, not accuracy. A relation holding across a
// transformation of a case the engine already scores wrongly keeps it wrong.
// The two harnesses are complements — the corpus says whether the engine is
// right, this says whether it can be talked out of it.

import type { EvalCase } from "./schema";

/**
 * How a transformed input's verdict must relate to the original's.
 *
 * `equal` is for transformations that preserve meaning exactly — a phone number
 * reformatted, a hostname recased. Anything but an identical verdict is a bug.
 *
 * `noWeaker` is for transformations that add obfuscation or padding. The engine
 * may legitimately score these HIGHER (obfuscation is itself a signal, and
 * several packs treat it as one), but scoring lower means the trick worked.
 * Asserting equality here would file every correct obfuscation penalty as a
 * failure, which would train everyone to ignore the output.
 */
export type Relation = "equal" | "noWeaker";

export interface Transform {
  /** Stable id, printed in violations and used to filter a run. */
  id: string;
  /** What an evader is doing, in one line. Printed in the report. */
  intent: string;
  relation: Relation;
  /**
   * Which cases this applies to. A phone reformatter has nothing to say about
   * a URL-only case, and running it anyway produces noise that hides real
   * violations behind a wall of no-ops.
   *
   * Some transforms are also label-scoped. `noWeaker` asks "did the trick
   * work", which is only a question about content that SHOULD score — a benign
   * case scoring lower is a false positive getting better, and reporting that
   * as a violation buries the real ones. Scope with `c.label === "scam"` where
   * the relation only makes sense in that direction.
   */
  applies: (c: EvalCase) => boolean;
  /**
   * Rewrite the content. Returning null means "not applicable after all" —
   * `applies` is a cheap pre-filter and some transforms only discover mid-way
   * that there was nothing to change (no ASCII letter to swap, no digit run to
   * reformat). Returning the input unchanged is treated the same way, so a
   * no-op never counts as a passing check.
   */
  apply: (content: string) => string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// An Australian number as written in the wild: leading 0, a valid prefix digit,
// then 8 more digits with separators anywhere. Matching the digit run rather
// than a fixed 4-4 layout is deliberate — mobiles group 04XX XXX XXX and
// landlines 0X XXXX XXXX, and a pattern encoding either one silently skips the
// other, halving the checks while reporting a clean run.
//
// A fresh RegExp per call rather than one shared /g instance: a global regex
// carries a mutable lastIndex between calls, so reusing it for both .test() and
// .replace() makes applies() alternate on identical input.
const AU_PHONE = String.raw`\b0([234789])[\s.-]?(\d[\d\s.-]{5,10}\d)\b`;

/** Digits only, so a match can be length-checked and regrouped at will. */
const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Rewrite every AU number, handing the callback the normalised digit string.
 *
 * The length guard is what keeps this from mangling non-phone digit runs: a
 * reference number or a card-shaped string can satisfy the loose separator
 * pattern, and rewriting one would produce a "transformed" input that is not
 * the same message — a violation reported against it would be the harness's
 * fault, not the engine's.
 */
function mapAuPhones(content: string, fn: (d: string) => string): string | null {
  let changed = false;
  const out = content.replace(new RegExp(AU_PHONE, "g"), (m) => {
    const d = digits(m);
    if (d.length !== 10) return m;
    const next = fn(d);
    if (next !== m) changed = true;
    return next;
  });
  return changed ? out : null;
}

const hasAuPhone = (c: string) => {
  const m = c.match(new RegExp(AU_PHONE));
  return m !== null && digits(m[0]).length === 10;
};

const hasUrl = (c: string) => /https?:\/\/\S+|\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(c);

/**
 * Apply fn to the host of each URL, leaving the rest of the string alone.
 *
 * Transformations aimed at the hostname must not touch surrounding prose: a
 * homoglyph swapped into the message body tests keyword matching, which is a
 * different relation with a different expected outcome, and mixing the two
 * makes a violation impossible to attribute.
 */
function mapUrlHosts(content: string, fn: (host: string) => string): string | null {
  let changed = false;
  const out = content.replace(
    /(https?:\/\/)([^/\s?#]+)/gi,
    (_m, scheme: string, host: string) => {
      const next = fn(host);
      if (next !== host) changed = true;
      return scheme + next;
    },
  );
  return changed ? out : null;
}

/**
 * Lure families whose score comes from keyword frequency rather than a gated
 * composite, so the email channel's discount legitimately lowers them.
 *
 * Listed rather than detected because the harness cannot see inside a verdict:
 * it has the score and the label, not which rule produced them. Naming the
 * families keeps the exclusion reviewable — an entry here is a claim that this
 * lure is scored by keywords, which a reader can check against a run's signal
 * rows.
 */
const KEYWORD_CARRIED_CATEGORIES = new Set(["parcel-delivery", "toll", "government"]);

// ── Transformations ──────────────────────────────────────────────────────────

export const TRANSFORMS: Transform[] = [
  // ── Meaning-preserving: verdict must not move at all ──────────────────────

  {
    id: "phone-e164",
    intent: "Write an AU number in +61 international form instead of 0-prefixed",
    relation: "equal",
    applies: (c) => hasAuPhone(c.content),
    // +61 form drops the trunk 0: 0412 345 678 → +61 412 345 678.
    apply: (content) => mapAuPhones(content, (d) => `+61 ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`),
  },
  {
    id: "phone-spacing",
    intent: "Regroup a phone number's digits with different separators",
    relation: "equal",
    applies: (c) => hasAuPhone(c.content),
    // Same digits, different grouping and separator.
    apply: (content) => mapAuPhones(content, (d) => `${d.slice(0, 4)}-${d.slice(4, 7)}-${d.slice(7)}`),
  },
  {
    id: "host-case",
    intent: "Recase the hostname — DNS is case-insensitive, so this is the same host",
    relation: "equal",
    applies: (c) => hasUrl(c.content),
    apply: (content) =>
      mapUrlHosts(content, (h) =>
        h
          .split("")
          .map((ch, i) => (i % 2 === 0 ? ch.toUpperCase() : ch.toLowerCase()))
          .join(""),
      ),
  },
  {
    id: "host-trailing-dot",
    intent: "Append the FQDN root dot, which resolves to the identical host",
    relation: "equal",
    applies: (c) => hasUrl(c.content),
    apply: (content) =>
      mapUrlHosts(content, (h) => (h.includes(":") || h.endsWith(".") ? h : `${h}.`)),
  },
  {
    id: "url-tracking-params",
    intent: "Append marketing tracking parameters, which do not change the destination",
    relation: "equal",
    applies: (c) => /https?:\/\//i.test(c.content),
    apply: (content) => {
      const out = content.replace(/(https?:\/\/[^\s]+)/gi, (u) =>
        u.includes("?") ? `${u}&utm_source=email&utm_medium=cpc` : `${u}?utm_source=email`,
      );
      return out === content ? null : out;
    },
  },
  {
    id: "whitespace-collapse",
    intent: "Reflow the message — double spaces and hard wraps, as a mail client would",
    relation: "equal",
    applies: (c) => /\s/.test(c.content) && c.type !== "phone",
    apply: (content) => {
      const out = content.replace(/ /g, "  ");
      return out === content ? null : out;
    },
  },

  // ── Obfuscation: verdict must not get WEAKER ──────────────────────────────

  {
    id: "zero-width",
    intent: "Insert zero-width spaces inside keywords to break literal matching",
    relation: "noWeaker",
    // Aimed at the message body, so URL-only cases are out of scope: the same
    // insertion inside a hostname is a different mechanism (IDN handling).
    applies: (c) => c.type !== "url" && /\b\w{6,}\b/.test(c.content),
    apply: (content) => {
      let done = false;
      const out = content.replace(/\b(\w{3})(\w{3,})\b/g, (m, a: string, b: string) => {
        if (done) return m;
        done = true;
        return `${a}​${b}`;
      });
      return done ? out : null;
    },
  },
  {
    id: "cyrillic-homoglyph",
    intent: "Swap Latin letters in the hostname for identical-looking Cyrillic ones",
    relation: "noWeaker",
    applies: (c) => hasUrl(c.content),
    apply: (content) => {
      const MAP: Record<string, string> = { a: "а", e: "е", o: "о", c: "с", p: "р" };
      return mapUrlHosts(content, (h) => {
        // One substitution only. A wholesale swap produces a host that shares
        // no ASCII with the original, which any allowlist would miss for the
        // trivial reason that it is a different string — that tests nothing.
        // A single character is the realistic attack and the sharper probe.
        for (const [latin, cyr] of Object.entries(MAP)) {
          const i = h.indexOf(latin);
          if (i !== -1) return h.slice(0, i) + cyr + h.slice(i + 1);
        }
        return h;
      });
    },
  },
  {
    id: "fullwidth-digits",
    intent: "Write phone digits as full-width Unicode forms",
    relation: "noWeaker",
    // Phone numbers only. Rewriting every digit also mutated hostnames and paths
    // ("bit.ly/3xYz9"), so a violation could not be attributed — the transformed
    // input differed from the original in more ways than the one under test.
    applies: (c) => hasAuPhone(c.content),
    apply: (content) =>
      mapAuPhones(content, (d) =>
        [...d].map((ch) => String.fromCharCode(0xff10 + ch.charCodeAt(0) - 48)).join(""),
      ),
  },
  {
    id: "benign-padding",
    intent: "Bury the scam in ordinary prose to dilute a ratio-based score",
    relation: "noWeaker",
    // Not on a case whose content carries email headers: prose above a "From:"
    // line means the text is no longer an email, and the header-derived signals
    // it loses were correctly earned. That is the harness changing the input's
    // kind, not an evasion working.
    //
    // Multiline, and specific to the headers the email path actually keys on.
    // A start-anchored test was the original form and it is not enough under
    // composition: `forwarded-prefix` puts a "---------- Forwarded message"
    // banner above the block, so the headers no longer sit at index 0 and the
    // guard waved the case through. The composite then padded above a From:
    // line after all, dropped the impersonation signal with it, and reported
    // eight violations that were all this artefact rather than an evasion.
    // Composition is what surfaced it: no single transform can construct the
    // input the guard was written to exclude.
    applies: (c) =>
      c.type !== "url" && c.type !== "phone" && !/^(?:From|Reply-To|Return-Path|Sender):\s/im.test(c.content),
    apply: (content) =>
      `Hi there, hope you had a good weekend. Just passing this along, ` +
      `let me know what you think when you get a chance.\n\n${content}\n\n` +
      `Thanks again, and no rush on this at all. Talk soon.`,
  },
  {
    id: "forwarded-prefix",
    intent: "Forward the message, wrapping it in a mail client's scaffolding",
    relation: "noWeaker",
    // The most likely way a scam text reaches a checker is forwarded, not
    // pasted bare — "is this real?" is the whole reason someone forwards it.
    // A rule anchored to the start of a message stops firing when the forward
    // adds a wrapper, so this is the evasion nobody has to invent.
    // Scam SMS only, and deliberately not every scam.
    //
    // The wrapper routes the text down the email path, and two things there are
    // correct rather than evasion: channel-specific rules stop applying (the
    // "these senders removed links from their SMS" signal is SMS-only, because
    // their real email does carry links), and the keyword discount softens
    // frequency-based hits that a longer message genuinely makes weaker. On a
    // benign case the same drop is a false positive improving.
    //
    // What this transform is for is the composites — a gated rule needing
    // several halves to line up does not get less certain because the text
    // arrived by email, and those are the ones an evader could otherwise defuse
    // by forwarding. Cases whose score is carried by keyword signals are
    // excluded by category rather than by weakening the relation, so a real
    // composite regression still fails loudly.
    applies: (c) =>
      c.label === "scam" &&
      c.type !== "url" &&
      c.type !== "phone" &&
      !KEYWORD_CARRIED_CATEGORIES.has(c.category ?? ""),
    apply: (content) => `---------- Forwarded message ----------\nFrom: Unknown <unknown@example.invalid>\nDate: 2 Sep 2026\nSubject: Fwd: hi\n\n${content}`,
  },
  {
    id: "quoted-reply",
    intent: "Quote the message in a reply, as forwarding to a family member would",
    relation: "noWeaker",
    applies: (c) => c.label === "scam" && c.type !== "url" && c.type !== "phone",
    apply: (content) => content.split("\n").map((l) => `> ${l}`).join("\n"),
  },
  {
    id: "defanged",
    intent: "Defang the link, as a cautious forwarder would — refang must recover it",
    relation: "equal",
    applies: (c) => /https?:\/\//i.test(c.content),
    apply: (content) => {
      // The scheme's own s is preserved. Rewriting http:// as hxxps:// asks
      // refang to restore a DIFFERENT url — one carrying TLS where the
      // original had none — and the engine is right to score those apart,
      // since "No HTTPS" is a real signal about the plain-http original. The
      // relation only holds if the two strings mean the same thing, and an
      // upgraded scheme does not.
      // Dots inside the URL only. A blanket replace also defanged sentence
      // periods — "Pay at hxxp://a[.]tk/x[.] Then call us[.]" — which corrupts
      // the prose an equal relation is asserting about.
      const out = content.replace(
        /(https?):\/\/([^\s<>"']+)/gi,
        (_m, scheme: string, rest: string) => {
          const defangedScheme = scheme.toLowerCase() === "https" ? "hxxps" : "hxxp";
          // Trailing sentence punctuation is not part of the URL.
          const trailing = rest.match(/[.,;:!?)]+$/)?.[0] ?? "";
          const body = trailing ? rest.slice(0, -trailing.length) : rest;
          return `${defangedScheme}://${body.replace(/\./g, "[.]")}${trailing}`;
        },
      );
      return out === content ? null : out;
    },
  },
  {
    id: "unicode-punctuation",
    intent: "Use typographic quotes and dashes, as a phone keyboard autocorrects to",
    relation: "noWeaker",
    applies: (c) => /['"-]/.test(c.content),
    apply: (content) => {
      const out = content.replace(/'/g, "’").replace(/"/g, "”").replace(/-/g, "–");
      return out === content ? null : out;
    },
  },
];
