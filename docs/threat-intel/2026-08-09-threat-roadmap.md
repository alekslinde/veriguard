# Threat-Intel Roadmap — 2026-08-09

_Weekly threat-intelligence sweep. Research and proposals only — no detection
code is modified in this document. All proposals require human review before
implementation._

> **Delivery status (2026-08-10).** All six proposals have since been
> implemented and this document has been annotated in place: D1–D3 via
> #141/#142/#143, D4–D6 via `detector/roadmap-d4-d6`. Two Pack-Interface Notes
> (D4, D5) rested on premises that turned out to be wrong about how the scorer
> works; both are struck through and corrected there rather than silently
> edited, since the reasoning is what the next sweep will reuse. The research
> below is otherwise preserved as written at sweep time.

---

## Executive Summary

A moderately active week. The standout new cross-regional signal is the
**ClickFix macOS variant** — the established Win+R clipboard-paste tactic is
now confirmed in macOS-flavoured overlays using Terminal/Spotlight, which the
existing patterns do not catch. The **SVG phishing attachment** vector continues
its reported surge, with APWG and multiple vendor reports confirming a sharp
uptick in SVG-embedded redirect campaigns globally.

For AU specifically, peak tax-season pressure is producing two fresh surfaces:
**state government agency impersonation** (VicRoads, Service NSW, etc.) and
**customs/import-duty fee** smishing — both carried forward from last week where
they remained unimplemented at the time of writing (both have since shipped; see
Delivery status above). Two medium-priority signals round out the AU
column: a **super "rule change" credential lure** exploiting July 2026 SG
changes, and **private health insurer impersonation** (Medibank, Bupa, nib, hcf)
which has appeared in phishing kits distributed in AU-targeting forums.

GB shows a confirmed agency rename: Action Fraud became **Report Fraud** in
December 2025. This is a pack-maintainer note rather than a new threat. No
credible new text-side signals emerged from NZ, CA, or IE this week.

Three carry-forward proposals (D8, D9, D10 from 2026-08-02) are reclassified
as D1, D2, D4 below with updated implementation notes.

---

## Threats by Region

### AU — Australia

**1. State government agency impersonation (HIGH — carry-forward D10)**
VicRoads (road tolls, licence renewal), Service NSW / Revenue NSW (fines,
stamp duty, rego), Transport NSW, QLD Transport / TMR, VicVehicle, VCAT, and
WA Department of Transport all appeared in AU-targeting smishing kits catalogued
by IDCARE and ASD's ACSC this reporting window. The framing is invariably
"You have an unpaid fine / your licence will be suspended — pay now via [link]."
`authorityMentions` in au.ts currently covers federal agencies only.

Sources: IDCARE July–August 2026 monthly brief; ACSC advisory ASC-2026-0807;
ScamWatch August 2026 scam alerts (state gov impersonation category).

**2. Customs / import-duty fee smishing (HIGH — carry-forward D8)**
Australia Post and DHL-branded SMS continuing to circulate with customs-clearance
payment demands. ABF (Australian Border Force) has confirmed it never sends
payment requests by SMS. au.ts `urgency.parcel` covers "delivery failed" / "parcel
held" but lacks the customs framing specifically.

Sources: ABF media release 6 Aug 2026; AusPost scam centre August 2026 update;
ACCC Scamwatch August 2026.

**3. ATO "appointment scheduled" attachment lure (LOW — partially covered)**
Tax-season phishing emails featuring a fake ATO portal email: "Your tax
appointment is scheduled — open the attached PDF." Attachment-lure detection
in `checkEmail()` already flags "open attachment" / "open the attached" patterns.
The "appointment scheduled" phrasing is novel but the underlying signal fires.
No new rule needed; ATO is already in `authorityMentions`. Watchlist only.

**4. Super "rule change" credential lure (MEDIUM)**
Following the July 2026 superannuation rule changes (preservation age/access
reforms), phishing SMSes are circulating as fake ATO/fund notifications:
"A new super rule change affects your balance — verify your details to avoid
losing access." `urgency.pension` has preservation-age and super-balance phrases
but not "rule change" framing.

Sources: ATO scam alert August 2026; ASIC MoneySmart August 2026 warning.

**5. Private health insurer impersonation (MEDIUM — carry-forward D9)**
Medibank, Bupa, nib, and HCF credential-harvest pages confirmed in phishing
kit distributions on AU-targeting forums this window. Framing: "Your policy
is expiring / your membership is suspended." None of these four brands appear
in `brandMentions` or `typosquatBrands` in au.ts.

Sources: Australian Cyber Security Centre August 2026 advisory; Proofpoint AU
sector report August 2026.

---

### GB — Great Britain

**1. Agency rename: Action Fraud → Report Fraud (PACK-MAINTAINER NOTE)**
Action Fraud was decommissioned and replaced by **Report Fraud** (reportfraud.police.uk)
in December 2025 as part of the City of London Police restructure. The `reportingBody`
field in gb.ts currently reads "Action Fraud" — this should be updated by a pack
maintainer. This roadmap cannot modify region packs. No urgency signals are
affected; the agency name appears only in user-facing copy, not in detection logic.

Sources: City of London Police press release December 2025; Home Office
announcement of "Report Fraud" service February 2026; Which? consumer guide
August 2026.

**2. AI voice + LinkedIn bank impersonation (MONITORING)**
CIFAS and UK Finance report a 62% increase in bank impersonation scams where
the initial contact is a LinkedIn connection or message, followed by an AI
voice call claiming to be from the victim's bank's fraud team. No reliable
text-side signal can be derived from the LinkedIn interaction step; the AI
voice call itself is out of scope for a text/SMS/email detector. Monitoring only.

Sources: UK Finance Fraud Report August 2026; CIFAS August 2026 intelligence
bulletin; Action Fraud (still branding) advisory August 2026.

---

### US — United States

**1. FTC recovery scam (COVERED — no new rule needed)**
"FTC refund" and "we're recovering your lost funds" callback scripts confirmed
active. "ftc" and "federal trade commission" already in `authorityMentions` for
the US pack; recovery-fraud framing ("recover your funds", "refund your losses")
is partially covered by existing urgency signals. No gap identified.

**2. Kali365 PhaaS infrastructure (MONITORING)**
Proofpoint and Recorded Future report the Kali365 phishing-as-a-service platform
adding UK and AU targeting modules. Infrastructure-level intelligence only; no
lure text distinguishes it from commodity phishing. No text-side rule possible.

**3. Supreme Court impersonation (MONITORING — physical mail only)**
Reported letters claiming Supreme Court subpoenas. Physical mail medium; no
text-side detection surface. No rule needed.

---

### NZ — New Zealand

Nothing genuinely new this window. CERT NZ weekly report (ending 8 Aug 2026)
notes continued parcel smishing and employment scams at unchanged volumes.
All covered by existing NZ pack signals.

---

### CA — Canada

**CAFC impersonation (COVERED — no new rule needed)**
Canadian Anti-Fraud Centre issued a reminder about scammers impersonating CAFC
officers. "cafc", "canadian anti-fraud centre", and "anti-fraud centre" are
already in CA `authorityMentions`. No new rule needed.

---

### IE — Ireland

Nothing genuinely new this window. Revenue.ie and An Post smishing continues at
the same cadence as reported last week. All covered by existing IE pack signals.

---

### Global / Cross-Regional

**1. ClickFix macOS variant (HIGH)**
The established ClickFix fake-CAPTCHA tactic (fake Cloudflare/browser overlay
directing users to press Win+R, paste a PowerShell command) now has a confirmed
macOS variant: fake overlays instruct users to press Cmd+Space (Spotlight) or
open Terminal and paste a curl/bash command. ACSC advisory 9 Aug 2026, Sophos
and CrowdStrike blog posts.

base.ts `requestWords` covers Win+R phrases (`"press windows+r"`, `"open run
dialog"`, `"paste this command"`), and scamDetector.ts has dedicated ClickFix
regex in `checkSms()`. The macOS-specific commands (`"open terminal"`,
`"command+space"`, `"press cmd"`, `"curl | bash"`, `"pbpaste"`,
`"/bin/bash"`) are not present anywhere.

Sources: ACSC advisory ASC-2026-0809; Sophos X-Ops August 2026; CrowdStrike
Intelligence August 2026; CISA TLP:CLEAR advisory August 2026.

**2. SVG phishing attachment surge (MEDIUM)**
APWG Q2 2026 report and multiple vendor telemetry confirm a surge in SVG
(Scalable Vector Graphics) email attachments containing embedded JavaScript
redirects to credential-harvest pages. SVG files bypass attachment scanners
that only check Office/PDF formats and render directly in browsers when opened.

`checkEmail()` in scamDetector.ts handles attachment-lure language and PDF+QR
hybrids but has no SVG-specific pattern. The detection surface is limited
because the attachment-open language ("open the attached file", "see attachment")
already scores positively — but the SVG extension as a signal would allow higher
confidence when compound with sender spoofing or urgency.

Sources: APWG Phishing Activity Trends Q2 2026; Proofpoint Threat Insight July
2026; Any.run SVG phishing analysis August 2026.

---

## Proposals

_Routing: `base.ts` = fires in all regions; `lib/regions/XX.ts` = region-specific._
_FP column: Low (<1%), Medium (1–5%), High (>5%) estimated false-positive rate._

**Status as of 2026-08-10: all six proposals are implemented.** D1–D3 shipped via
#141/#142/#143; D4–D6 shipped in `detector/roadmap-d4-d6`. The "Proposed
Addition" column records what was proposed at sweep time — where implementation
review changed that, the deviation is recorded in Pack-Interface Notes below.

| # | Tactic | Proposed Addition | Target File | Region | FP | Priority | Status |
|---|--------|-------------------|-------------|--------|----|----------|--------|
| D1 | State gov agency impersonation | Add `"vicroads"`, `"service nsw"`, `"servicensw"`, `"transport nsw"`, `"revenue nsw"`, `"tmr qld"`, `"qld transport"`, `"dot wa"`, `"sa dept of transport"`, `"vcat"` to `authorityMentions.word[]` in au.ts | `lib/regions/au.ts` | AU | Low | **HIGH** | **SHIPPED** (#141) |
| D2 | Customs / import-duty fee (AU) | Add `"customs fee"`, `"customs charge"`, `"customs clearance"`, `"import duty"`, `"duty and handling"`, `"clearance fee"`, `"held at customs"`, `"held at border"`, `"held by customs"`, `"release your parcel"` to `urgency.parcel[]` in au.ts | `lib/regions/au.ts` | AU | Low | **HIGH** | **SHIPPED** (#142) |
| D3 | ClickFix macOS variant | Add to base.ts `requestWords[]`: `"open terminal"`, `"press cmd+space"`, `"press command+space"`, `"open spotlight"`, `"paste in terminal"`, `"run in terminal"`, `"curl \| bash"`, `"curl -s \| sh"`. Also extend ClickFix regex in scamDetector.ts `checkSms()` to cover macOS-specific clipboard patterns | `lib/regions/base.ts`, `lib/scamDetector.ts` | BASE | Medium (developer content; scored lower without other signals) | **HIGH** | **SHIPPED** (#143) |
| D4 | Private health insurer impersonation (AU) | Add `"medibank"`, `"bupa"` to `typosquatBrands.substring[]` and `brandMentions.substring[]`; add `"nib health"`, `"hcf"`, `"ahm"` to `brandMentions.substring[]`; add `"nib"` to `brandMentions.word[]` (short — needs word boundary) in au.ts | `lib/regions/au.ts` | AU | Low | **MEDIUM** | **SHIPPED** (2026-08-10) |
| D5 | Super "rule change" lure | Add `"super rule change"`, `"superannuation rule change"`, `"new super rules"`, `"super law change"`, `"changes to your super"` to `urgency.pension[]` in au.ts | `lib/regions/au.ts` | AU | Medium (financial news; should compound with authority or URL signal) | **MEDIUM** | **SHIPPED** (2026-08-10) |
| D6 | SVG phishing attachment | In `checkEmail()` in scamDetector.ts: add pattern matching `.svg` attachment references adjacent to credential-harvest language (`/\.svg[^a-z].*\b(attachment|attached|file|document)\b/i` or vice-versa); score +20 compound with existing sender-spoof or urgency signal | `lib/scamDetector.ts` | BASE | Medium (SVG in legitimate marketing email) | **MEDIUM** | **SHIPPED** (2026-08-10) |

---

## Pack-Interface Notes

**D1 — `authorityMentions.word[]`:**
All state-agency entries are multi-word or brand-name strings (`"service nsw"`,
`"transport nsw"`, etc.). They should be in `word[]` if ≤3 chars, otherwise either
list is fine — but `word[]` is safer for short abbreviations like `"vcat"` and
`"tmr"`. Note that `"dot"` alone is too short and too general; use the full phrase
`"dot wa"` or `"department of transport wa"`.

**D2 — `urgency.parcel[]`:**
Check that `"customs fee"` does not already appear in au.ts (it is in us.ts and
ca.ts but was confirmed absent from au.ts as of 2026-08-02 code review).

**D3 — Base / scamDetector.ts:**
`"curl | bash"` contains a pipe character — if stored as a plain string in an array,
the JS string is `"curl | bash"` without escaping. The regex variant in
`checkSms()` will need the pipe escaped: `curl\s*\|\s*(?:bash|sh)`. Keep
`"open terminal"` scored lower in `requestWords` than `"press windows+r"` because
it appears in legitimate developer-facing copy; the regex in `checkSms()` is the
higher-confidence path for ClickFix.

**D4 — `brandMentions.word[]` for `"nib"`:**
~~`"nib"` is 3 characters, so `mentionsAny()` will apply word-boundary matching
automatically.~~ **Corrected at implementation — this premise was wrong, and
acting on it would have shipped the false positives it was trying to avoid.**

The auto-boundary rule in `mentions()` applies to the *plain string arrays*
(`authorityMentions`, `noLinkSenders`, `foreignAuthorityMentions`). `brandMentions`
is a `BrandSet`, and `checkSms()` matches its `substring` half with a bare
`lower.includes(b)` — no length check anywhere on that path. A three-character
name placed in `substring[]` gets no protection at all.

So `word[]` is not merely "clearer" here, it is load-bearing. Implemented with
`"nib"`, `"hcf"` and `"ahm"` in `word[]`, alongside the existing `"agl"`:

- `"nib"` is inside 92 `/usr/share/dict/words` entries, plus "nibble";
- `"ahm"` is inside 41, overwhelmingly personal names (Ahmed, Ahmadi) — which
  arrive constantly in the forwarded email this app parses;
- `"hcf"` has zero dictionary hits but is boundary-matched anyway, rather than
  resting on today's word list staying true.

`"medibank"` and `"bupa"` are distinctive enough for `substring[]` as proposed.
The same split applies to `typosquatBrands`, whose `word` half matches on
separator-split hostname labels — so `nib-renewal.com` hits, `bonnibel.com`
doesn't.

**D5 — `urgency.pension[]` compound scoring:**
"Rule change" is medium FP because financial news and legitimate fund
communications also discuss regulatory changes. ~~Implementor should check
whether the pension urgency list is used standalone.~~ **Checked: it is
standalone.** The groups are flattened into `RegionPack.urgencyWords` and scored
directly in `checkSms()` at +10 per hit (capped at 35), with no compounding
requirement.

Rather than add a compounding gate for one group — which would have meant
special-casing the flat union every other signal relies on — every entry is
anchored to super/superannuation (`"super rule change"`, not `"rule change"`).
The lure always names super in order to land the threat, so anchoring costs no
recall, while a bare `"rule change"` would have fired on the ATO's own
newsletters and ordinary HR mail.

**D6 — `checkEmail()` SVG pattern:**
Regex must not match `.svg` filenames appearing in email footers (e.g. company
logo references). Anchoring on attachment-adjacent language ("see attached",
"open the file", "download") reduces false positives. The score contribution
(+20 suggested) should not be enough to reach `likely_scam` alone.

Implemented as two alternatives so the extension matches in either order — the
attachment noun may precede the filename ("see the attached invoice.svg") or
follow it ("statement.svg is attached"). Both are bounded to a 40-character
window so an attachment noun elsewhere in a long email doesn't reach down to a
footer logo. Verified at +20: the signal alone lands at `suspicious`, and
escalates only by compounding with the sender-spoof and urgency signals.

---

## Region Demand Signal

No meaningful demand data available this run. The `npm run region-demand`
script requires production database credentials and should be run where they
are available. It reports submission volume per region, flagging any volume from
outside the six covered packs (AU, GB, US, NZ, CA, IE).

That number gates a real decision: meaningful non-AU volume argues for adding
locales or further English regions, while volume concentrated in AU/GB argues
for spending the effort on detection depth in the regions already covered.
(This was previously documented in `docs/internationalisation-plan.md`, removed
2026-08-31 — see git history for the full region-pack plan.)

---

## Watchlist

Items not proposed this week but worth monitoring:

- **ATO "appointment scheduled" lure (AU):** New framing but underlying
  attachment-lure detection already fires. Revisit if a new evasion variant
  emerges.
- **GB AI-voice + LinkedIn bank fraud:** No text-side detection surface today;
  revisit if a text-follow-up script becomes available.
- **PDF+QR hybrid (carry-forward from 2026-07-26, tracked as #113):** ~~Still
  outstanding. Not resurveyed this week — deferred to the implementing PR.~~
  **Corrected 2026-08-10 — this had already shipped when the sweep was written.**
  `checkSms()` carries a dedicated inverted-phrasing pattern for it
  (`scamDetector.ts`, "PDF-embedded Scanception quishing (D7 / #113)"), matching
  "the attached PDF contains a QR code" where the generic scan-prompt patterns
  find no verb phrase to latch onto. Verified firing on four phrasings, and
  correctly silent on "the QR code on the attached flyer". The entry was carried
  forward unchecked; a watchlist that says "outstanding" about shipped work is
  worse than no watchlist, because it is what the next reader trusts. Nothing
  outstanding here.

- **Foreign-authority phrasing coverage — found 2026-08-10, FIXED 2026-08-10:**
  `FOREIGN_AUTHORITY_MENTIONS` matched "chinese police", "chinese customs",
  "embassy of china" and similar, but **not** the natural word-order variant
  "Chinese Embassy", which scored 0 while "embassy of china" scored 31. Matching
  is `\b`-delimited substring, so word order is literal.

  The audit widened it: the same block was **copy-pasted into all six national
  packs** (au/ca/gb/ie/nz/us), so the gap existed six times over. The scam is
  diaspora-targeted rather than country-targeted, so there was never a regional
  reason for the duplication.

  Fixed by extracting `CHINESE_AUTHORITY_MENTIONS` to base.ts, spread by every
  pack (non-AU packs prepend interpol/europol). Added both word orders for
  embassy and consulate, plus `"public security bureau"` — the actual name of
  the body being impersonated (公安局), and the one a victim hears on the phone.

  Three candidates were **rejected** on FP grounds, since the flag is +35 alone:
  `"chinese immigration"` (an IOC in the 2026-07-26 roadmap, but "Chinese
  immigration rules changed in 2026" is ordinary migration-agent copy),
  `"chinese government"` (routine in news), and `"china police"` (not idiomatic;
  mostly headlines). Each needs a source showing the phrasing in a real lure.

  **Known FP, accepted:** "Your visa appointment at the Chinese Embassy is
  confirmed for 3pm Tuesday" now scores 35 (`suspicious`) on the mention alone.
  Judged acceptable — an embassy does not send appointment confirmations by
  unsolicited SMS, the verdict is "suspicious" rather than "likely scam", and
  the advice given is to verify through official channels, which is correct
  either way. Revisit if reports come in.

- **"Hi Mum" opening message (AU/BASE) — NEW, found 2026-08-10:**
  `URGENCY_VOICE_CLONE` in base.ts covers the escalation ("bail money",
  "stranded overseas", "don't tell mum") but nothing matches the *first*
  message, which is the one people actually receive: "Hi Mum, this is my new
  number, my phone broke" scores **0**. The code comment already labels that
  half "D17 — watchlist", so this is a known deferral rather than a regression —
  but it was being described as shipped. Genuinely hard: the text is
  indistinguishable from a real message from a relative, so the FP risk on
  "new number" alone is high and a rule here would need to compound with a
  payment ask. Flagged for a sweep to size properly; recording it so the
  deferral stays visible rather than reading as coverage.
- **Kali365 PhaaS (US/AU):** Platform-level intelligence only; no lure
  differentiator. Continue monitoring vendor telemetry for any distinct text
  patterns.
- **"Report Fraud" GB agency rename:** Pack maintainer should update
  `reportingBody` in gb.ts from "Action Fraud" to "Report Fraud" (or add both
  for a transition window). **Still outstanding as of 2026-08-10** — deliberately
  left out of the D4–D6 implementation, which is AU/BASE scoped. Note this is
  live user-facing copy in two places, not just the one the sweep found:
  `reportingBody` (gb.ts:381) and the foreign-authority flag text (gb.ts:345),
  which also ends "Report it to Action Fraud." Both currently point UK users at
  a body decommissioned in December 2025, so this is a small correctness fix
  rather than cosmetic housekeeping.
- **SVG in AU-targeted campaigns specifically:** If SVG attachment reports
  become AU-specific in framing, consider au.ts supplementary scoring.

---

## Sources

| ID | Source | Date | Region |
|----|--------|------|--------|
| S1 | ACSC Advisory ASC-2026-0807 (State gov impersonation) | 7 Aug 2026 | AU |
| S2 | ACSC Advisory ASC-2026-0809 (ClickFix macOS) | 9 Aug 2026 | BASE |
| S3 | IDCARE Monthly Threat Brief July–Aug 2026 | Aug 2026 | AU |
| S4 | ATO Scam Alert — super rule change lures | Aug 2026 | AU |
| S5 | ASIC MoneySmart scam warning August 2026 | Aug 2026 | AU |
| S6 | ABF media release — customs SMS scam | 6 Aug 2026 | AU |
| S7 | AusPost Scam Centre — August 2026 update | Aug 2026 | AU |
| S8 | ACCC Scamwatch August 2026 alerts | Aug 2026 | AU |
| S9 | Proofpoint AU Sector Threat Report August 2026 | Aug 2026 | AU |
| S10 | UK Finance Fraud Report August 2026 | Aug 2026 | GB |
| S11 | CIFAS Intelligence Bulletin August 2026 | Aug 2026 | GB |
| S12 | City of London Police — Report Fraud launch | Dec 2025 | GB |
| S13 | APWG Phishing Activity Trends Report Q2 2026 | Jul 2026 | BASE |
| S14 | Proofpoint Threat Insight — SVG phishing | Jul 2026 | BASE |
| S15 | Any.run SVG phishing analysis | Aug 2026 | BASE |
| S16 | Sophos X-Ops — ClickFix macOS variant | Aug 2026 | BASE |
| S17 | CrowdStrike Intelligence — ClickFix macOS | Aug 2026 | BASE |
| S18 | CISA TLP:CLEAR — ClickFix advisory | Aug 2026 | BASE |
| S19 | CERT NZ Weekly Report ending 8 Aug 2026 | Aug 2026 | NZ |
| S20 | CAFC Scam Alert — CAFC impersonation | Aug 2026 | CA |
