# Security

## Why this project is open source (and why that's safe)

Veriguard is a scam-detection tool, so a fair question is: *doesn't
publishing the detection logic just teach scammers how to evade it?*

It doesn't, and here's the reasoning:

- **The detector keys off signals the attacker already controls and already
  knows about.** SPF / DKIM / DMARC results, display-name vs. sending-domain
  mismatch, From ≠ Reply-To, tracking pixels, click-redirect domains,
  read-receipt headers — these are published standards and well-known
  anti-phishing signals, not secret heuristics. Reading
  [`lib/emailTracking.ts`](lib/emailTracking.ts),
  [`packages/engine/src/emailHeaders.ts`](packages/engine/src/emailHeaders.ts), or
  [`packages/engine/src/scamDetector.ts`](packages/engine/src/scamDetector.ts) tells a scammer nothing they
  couldn't get from any email-security write-up.

- **The signals are load-bearing for the *attack*, so detecting them can't be
  cheaply evaded.** A scammer can't stop spoofing the brand (that *is* the
  scam), can't align the Reply-To without losing the address they want replies
  sent to, and can't drop the tracking pixel without losing the open
  confirmation. Evading the detector means giving up the thing that makes the
  scam work.

- **Detection by obscurity is weak anyway.** If protection only held because the
  code was secret, it would be one leak away from useless. Open detection lets
  defenders learn the patterns and lets users understand *why* a verdict was
  reached — which is the point. (See the project's "teach pattern recognition,
  not just blocking" value.)

The most a reader gains is knowledge of *this tool's* exact thresholds (e.g. the
opaque-token length, the ESP domain list). Evading those still leaves the scam
caught by the mailbox provider, the impersonated brand, and DMARC — so the
trade-off strongly favours transparency.

## If you fork or self-host the forward-to-us inbound flow

The inbound email flow ([`workers/inbound-email/`](workers/inbound-email/) +
[`app/api/inbound/`](app/api/inbound)) auto-replies to whoever forwards an email.
That convenience is also an abuse surface, so these mitigations are **required,
not optional** — a fork that drops them can become an open email reflector or a
data leak:

1. **Reply only to the original sender.** The Worker uses Cloudflare
   `message.reply()`, which can only reach the address that sent the inbound
   mail — never an arbitrary recipient. Do not replace this with an
   arbitrary-recipient send without re-adding equivalent constraints.
2. **Authenticate the webhook.** `/api/inbound` is gated by a shared
   `INBOUND_SECRET` (constant-time compared). Only the Worker knows it. Without
   this, anyone can drive your analysis endpoint.
3. **Rate-limit per sender.** Both the API and the Worker throttle per forwarder,
   so a flood from one address can't generate a reply storm.
4. **Analyse and discard.** The raw email is processed in memory and never
   stored; only an anonymous counter is incremented. Don't add logging that
   persists message content or reporter addresses.

See [`workers/inbound-email/README.md`](workers/inbound-email/README.md) for the
full design and go-live runbook.

## Reporting a vulnerability

If you find a security issue — especially anything that could expose user data,
turn the inbound flow into a relay, or bypass the abuse mitigations above —
please report it privately rather than opening a public issue. Use GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository (Security → Report a vulnerability). We'll acknowledge and
work with you on a fix before any public disclosure.

For anything that is **not** a security issue — a wrong verdict, a bug, a
feature request — [open an issue](https://github.com/alekslinde/veriguard/issues)
instead.
