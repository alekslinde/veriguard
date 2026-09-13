// Email header parsing and sender-identity analysis.
//
// Scammers spoof the visible From with a friendly display-name alias while the
// real address — and especially the Reply-To — give the game away. This module
// extracts those identities from raw email source (or a pasted/forwarded blob)
// and flags the two strongest signals: display-name masking and From≠Reply-To.
//
// Pure string logic only. The raw email is parsed client-side; only the
// extracted scammer identities are ever submitted (see ReportForm).

export interface EmailHeaders {
  fromDisplay: string; // display name shown to the user, e.g. "myGov"
  fromAddress: string; // real address behind the From, e.g. x@evil.tk
  replyTo: string; // Reply-To address, if present
  returnPath: string; // Return-Path / envelope sender, if present
  sender: string; // Sender header address, if present
  subject: string; // Subject line, if present

  // Receiving-server authentication verdicts (from Authentication-Results /
  // Received-SPF). Lowercased single words: "pass" | "fail" | "softfail" |
  // "neutral" | "none" | "" (absent). These reflect what the recipient's mail
  // provider concluded, NOT the sender's own ARC claims, which scammers control.
  spf: string;
  dkim: string;
  dkimDomain: string; // DKIM signing domain (header.d), e.g. tenant.onmicrosoft.com
  dmarc: string;
  originIp: string; // sending server IP (Received-SPF client-ip)
  acceptLanguage: string; // first locale the message was composed in, e.g. "sv-SE"
}

// Brand/identity words that, when they appear in a display name but not in the
// actual sending domain, indicate impersonation. Mirrors the lists used in
// scamDetector (kept local here to avoid a circular import).
const IMPERSONATED_BRANDS = [
  "ato", "mygov", "centrelink", "medicare", "services australia",
  "commbank", "commonwealth bank", "westpac", "anz", "nab", "paypal",
  "auspost", "australia post", "telstra", "optus", "amazon", "netflix",
  "apple", "microsoft", "google", "linkt", "etoll",
  // Loyalty programs targeted by points-expiry phishing (D5 / #46, #57)
  "qantas", "frequent flyer", "flybuys", "everyday rewards",
  "velocity", "telstra plus",
  // Food delivery platforms (D6 / #66)
  "doordash", "uber eats", "ubereats", "menulog", "deliveroo",
  // Super funds targeted by SMSF / early-access phishing (D3/D4 / #64)
  "australiansuper", "unisuper", "rest super", "hesta", "sunsuper",
  "cbus", "amp super", "mlc super",
  // Energy retailers (D3 / #121). Matched against the From display name only,
  // which is a far narrower surface than free text — short entries like "agl"
  // are safe here in a way they are not in the SMS/URL checkers.
  "agl", "origin energy", "energy australia", "energyaustralia",
  "alinta energy", "alintaenergy",
  // AU crypto exchanges (D6 / #123)
  "coinspot", "swyftx", "binance", "binance au",
];

// Domain of an email address: lowercased, everything after the last '@'.
export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at === -1) return "";
  return address.slice(at + 1).trim().toLowerCase().replace(/[>)\].,;:]{0,64}$/, "");
}

// Every quantifier here is bounded, and deliberately so. The unbounded form of
// this pattern backtracks quadratically on input that ends up not matching: a
// 40KB display name took ~57s to reject, and free-text content reaches this
// from an unauthenticated request. The bounds are RFC 5321's — 64 octets of
// local part, 255 of domain — so they cost no real address anything. Keep them
// bounded; see the address-shaped patterns below, which are bounded for the
// same reason.
const ADDRESS_RE = /[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]{1,255}\.[a-zA-Z]{2,24}/;

/**
 * The actual address from a header value.
 *
 * When angle brackets are present RFC 5322 says the address inside them is the
 * real one and everything before it is a display name — so that is where we
 * look first. Taking the first address anywhere in the value instead is an
 * evasion: `From: "noreply@ato.gov.au" <attacker@evil.tk>` renders in a mail
 * client as the attacker's address with a reassuring label, but scored as
 * though it came from ato.gov.au. Measured at the time of the fix, that dropped
 * a phishing email from 37/suspicious to 17/safe — the verdict flipped, and the
 * user was told a scam was safe.
 *
 * Falls back to a scan of the whole value for a bare address with no brackets.
 */
function addressIn(value: string): string {
  const angled = value.match(/<([^<>]*)>/);
  if (angled) {
    const inner = angled[1].match(ADDRESS_RE);
    if (inner) return inner[0];
    // Brackets present but nothing address-shaped inside: fall through rather
    // than trusting a display name that happens to contain an address.
  }
  const m = value.match(ADDRESS_RE);
  return m ? m[0] : "";
}

// Pull the display name out of a `Display Name <addr@dom>` header value.
// Returns "" when the value is a bare address (no angle-bracketed address).
function displayNameIn(value: string): string {
  const v = value.trim();
  if (!v.includes("<")) return ""; // bare address — no separate display name
  const name = v.slice(0, v.indexOf("<")).trim().replace(/^["']|["']$/g, "").trim();
  return name;
}

// Parse the header block of an email. Accepts raw source, an .eml's text, or a
// forwarded/pasted blob. Unfolds RFC822 continuation lines (a header value
// continued on the next line that starts with whitespace), then reads the
// headers we care about. The first occurrence of each header wins.
export function parseEmailHeaders(raw: string): EmailHeaders {
  // Header section ends at the first blank line; if there's no blank line treat
  // the whole input as headers (covers header-only pastes).
  const headerBlock = raw.split(/\r?\n\r?\n/, 1)[0] ?? "";

  // Unfold: join continuation lines (those beginning with space/tab) onto the
  // previous line.
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const lines = unfolded.split(/\r?\n/);

  const get = (name: string): string => {
    const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "i");
    for (const line of lines) {
      const m = line.match(re);
      if (m) return m[1].trim();
    }
    return "";
  };

  // Some headers (notably Authentication-Results) legitimately appear multiple
  // times — one per mechanism (spf, dkim, dmarc, ...). Collect them all.
  const getAll = (name: string): string[] => {
    const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "i");
    return lines.map((l) => l.match(re)?.[1].trim()).filter((v): v is string => !!v);
  };

  const fromRaw = get("from");
  const replyToRaw = get("reply-to");
  const returnPathRaw = get("return-path");
  const senderRaw = get("sender");

  // Authentication verdicts. We deliberately read the recipient-side
  // `Authentication-Results` (and `Received-SPF`) — NOT `ARC-Authentication-
  // Results`, which carries the sending side's own claims and is attacker-
  // controlled. The leading `^Authentication-Results` anchor excludes the
  // `ARC-` prefixed variant.
  const receivedSpf = get("received-spf");
  const authText = [...getAll("authentication-results"), receivedSpf].join(" ; ");
  const tokenAfter = (key: string): string =>
    authText.match(new RegExp(`\\b${key}=([a-z]+)`, "i"))?.[1].toLowerCase() ?? "";

  // SPF: prefer the explicit Received-SPF leading verdict, else the spf= token.
  const spf =
    receivedSpf.match(/^\s*([a-z]+)/i)?.[1].toLowerCase() || tokenAfter("spf");

  return {
    fromDisplay: displayNameIn(fromRaw),
    fromAddress: addressIn(fromRaw),
    replyTo: addressIn(replyToRaw),
    returnPath: addressIn(returnPathRaw),
    sender: addressIn(senderRaw),
    subject: get("subject"),
    spf,
    dkim: tokenAfter("dkim"),
    dkimDomain: (authText.match(/header\.d=([^\s;]+)/i)?.[1] ?? "").toLowerCase(),
    dmarc: tokenAfter("dmarc"),
    originIp: receivedSpf.match(/client-ip=([0-9a-fA-F:.]+)/i)?.[1] ?? "",
    acceptLanguage: get("accept-language").split(",")[0].trim(),
  };
}

// Verdict words a receiving server can legitimately report. Anything outside
// this set (e.g. attacker-injected free text) is dropped, so the summary we
// store and display is always one of these known tokens.
const KNOWN_VERDICTS = new Set([
  "pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "bestguesspass",
]);

// Compose a compact, display-safe one-line summary of the email authentication
// verdicts, e.g. "SPF pass · DKIM pass (markona[.]onmicrosoft[.]com) · DMARC none".
// Only allowlisted verdict words survive, and the DKIM domain is defanged so it
// can't auto-link. Returns "" when there's nothing meaningful to show.
export function summariseAuth(h: Partial<EmailHeaders>): string {
  const verdict = (v: string | undefined): string => {
    const t = (v ?? "").toLowerCase();
    return KNOWN_VERDICTS.has(t) ? t : "";
  };

  const parts: string[] = [];
  const spf = verdict(h.spf);
  const dkim = verdict(h.dkim);
  const dmarc = verdict(h.dmarc);

  if (spf) parts.push(`SPF ${spf}`);
  if (dkim) {
    // Sanitise the signing domain to a bare hostname, then defang the dots.
    const dom = (h.dkimDomain ?? "").toLowerCase().replace(/[^a-z0-9.\-]/g, "");
    parts.push(dom ? `DKIM ${dkim} (${dom.replace(/\./g, "[.]")})` : `DKIM ${dkim}`);
  }
  if (dmarc) parts.push(`DMARC ${dmarc}`);

  return parts.join(" · ");
}

export interface IdentityAnalysis {
  flags: string[];
  score: number;
}

// Analyse parsed identities for spoofing signals. Conservative: only flags when
// both sides of a comparison are present, so missing headers never raise a
// false positive.
export function analyseEmailIdentities(h: Partial<EmailHeaders>): IdentityAnalysis {
  const flags: string[] = [];
  let score = 0;

  const fromAddress = (h.fromAddress ?? "").toLowerCase();
  const fromDisplay = (h.fromDisplay ?? "").toLowerCase();
  const replyTo = (h.replyTo ?? "").toLowerCase();
  const returnPath = (h.returnPath ?? "").toLowerCase();

  const fromDom = domainOf(fromAddress);
  const replyDom = domainOf(replyTo);
  const returnDom = domainOf(returnPath);

  // Brand the visible name lays claim to (if any) — reused by several checks.
  const brand = fromDisplay
    ? IMPERSONATED_BRANDS.find((b) => fromDisplay.includes(b))
    : undefined;

  // True only when the display name claims a brand the real sending domain
  // doesn't belong to — i.e. genuine impersonation. The domain must NOT contain
  // the brand and must not be an AU gov/business domain, so a legitimate sender
  // whose own domain carries the brand (or merely a substring of it, e.g.
  // "allianz" ⊃ "anz") isn't flagged. Shared by the masking, dmarc=none and
  // locale checks so they can't disagree.
  const govLike = fromDom.endsWith(".gov.au") || fromDom.endsWith(".com.au");
  const impersonatesBrand =
    !!brand && !!fromDom && !fromDom.includes(brand.replace(/\s+/g, "")) && !govLike;

  // 1. From ≠ Reply-To (different domains) — replies route elsewhere.
  if (fromDom && replyDom && fromDom !== replyDom) {
    flags.push(
      `Reply-To address (${replyTo}) goes to a different domain than the sender (${fromAddress}) — replies would secretly go to the scammer`,
    );
    score += 40;
  }

  // 2. Display-name masking — the visible name names a brand the actual sending
  //    domain doesn't belong to.
  if (fromDisplay && fromDom) {
    if (impersonatesBrand) {
      flags.push(
        `Sender name claims to be "${h.fromDisplay}" but the real address is ${fromAddress} — the display name is masking the true sender`,
      );
      score += 40;
    }
    // Display name itself contains an email address whose domain differs from
    // the real one (e.g. "service@paypal.com" <noreply@evil.tk>).
    const nameAddr = fromDisplay.match(/[a-z0-9._%+\-]{1,64}@[a-z0-9.\-]{1,255}\.[a-z]{2,24}/);
    if (nameAddr && domainOf(nameAddr[0]) !== fromDom) {
      flags.push(
        `Display name shows an address (${nameAddr[0]}) that doesn't match the real sender (${fromAddress})`,
      );
      score += 35;
    }
  }

  // 3. Return-Path / envelope sender ≠ From — moderate signal.
  if (fromDom && returnDom && fromDom !== returnDom) {
    flags.push(
      `Return-Path (${returnPath}) doesn't match the From domain — common in spoofed mail`,
    );
    score += 20;
  }

  // ── Authentication verdicts ────────────────────────────────────────────────
  const spf = (h.spf ?? "").toLowerCase();
  const dkim = (h.dkim ?? "").toLowerCase();
  const dmarc = (h.dmarc ?? "").toLowerCase();
  const dkimDom = (h.dkimDomain ?? "").toLowerCase();
  const acceptLanguage = h.acceptLanguage ?? "";

  // 4. Hard authentication failures — the receiving server says the sending
  //    machine isn't authorised for this domain. Strong spoof signal.
  if (spf === "fail" || spf === "softfail") {
    flags.push(
      `SPF ${spf === "fail" ? "failed" : "soft-failed"} — the sending server isn't authorised to send for ${fromDom || "this domain"}`,
    );
    score += 35;
  }
  if (dmarc === "fail") {
    flags.push(
      `DMARC failed — the message isn't aligned with ${fromDom || "the From domain"}, a hallmark of spoofing`,
    );
    score += 40;
  }

  // 5. DMARC=none on an impersonating domain. The mail "passes" checks, but only
  //    because the lookalike domain publishes no enforcement — so nothing stops
  //    these lookalikes. Easily mistaken for a clean result, hence worth saying.
  if (dmarc === "none" && impersonatesBrand) {
    flags.push(
      `The sending domain ${fromDom} publishes no DMARC enforcement (dmarc=none), so it can freely send "${h.fromDisplay}" lookalikes — the real ${brand} is protected, this isn't`,
    );
    score += 25;
  }

  // 6. DKIM signed by an unrelated domain. A "dkim=pass" looks reassuring, but
  //    here the signature was applied by a domain with no relationship to the
  //    sender — i.e. authorised by someone other than the brand it claims.
  const aligned =
    dkimDom === fromDom ||
    (!!fromDom && dkimDom.endsWith(`.${fromDom}`)) ||
    (!!dkimDom && fromDom.endsWith(`.${dkimDom}`));
  if (dkim === "pass" && dkimDom && fromDom && !aligned) {
    flags.push(
      `DKIM is signed by ${dkimDom}, a domain unrelated to the sender ${fromDom} — the mail was authorised by someone other than ${fromDom}`,
    );
    score += 15;
  }

  // 7. Cross-border locale. Composed in a non-English locale while posing as a
  //    brand whose customers expect English — e.g. an Australian gov service.
  if (impersonatesBrand && acceptLanguage && !acceptLanguage.toLowerCase().startsWith("en")) {
    flags.push(
      `The email was composed in a non-English locale (${acceptLanguage}) while posing as ${brand} — inconsistent with a genuine Australian sender`,
    );
    score += 15;
  }

  return { flags, score };
}
