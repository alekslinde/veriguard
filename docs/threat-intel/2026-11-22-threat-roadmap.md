# Threat-intelligence roadmap — 2026-11-22

*Sweep period: since the 2026-11-08 roadmap.*

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from the last two cycles. `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly AU GB US NZ CA IE**, **rotation FR ID IT JP KR** — the five
stalest minimal packs (FR and ID last researched 2026-10-11, IT and JP
2026-10-16, KR 2026-10-16).

Read in full this cycle: `regions/types.ts`, `regions/base.ts`,
`scamDetector.ts` (the `Signals` class, `mentions`/`mentionsAny`/
`mentionsAsAcronym`, `checkUrl`, `checkSms`, `checkEmail`, `checkPhone`,
`checkCustom`, the `jobSignals`/`investmentGroupSignals` composites, the
quishing/ClickFix/callback-SMS/crypto-TOAD composites), `phoneIntel.ts`
(`analysePhone` and the wangiri/high-scam/elevated-volume tables), and the
region packs for AU, GB, US, NZ, IE, CA (weekly) plus FR, ID, IT, JP, KR
(this cycle's rotation). Read `docs/threat-intel/README.md` in full and the
watchlist sections of the 2026-11-08 and 2026-11-02 roadmaps, to check for
promotable carried items rather than re-investigating from scratch.

**Detection changes since the 2026-11-08 sweep:** none found in
`packages/detect/src/` this cycle — no PRs merged against the engine or
region packs since that roadmap's issues were filed.

**Region demand signal:** the production libSQL/Turso database is not
reachable from this research environment — no `local.db` fallback file
exists in this checkout, no `.env.local` file is present, and no
`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` (or similar) environment variables
are set. Same finding as every prior cycle; no figures are estimated or
invented in its place. See *Region demand signal*, below.

---

## Corrections

**ACCC phone-number-spoofing warning is not this cycle's news.** Several
November 2026 search results frame ACCC's warning about scammers spoofing its
own published phone numbers as a 2026 story; the underlying Scamwatch/NASC
alert page is dated **23 June 2025**. Not used as a finding — recorded so a
future cycle doesn't re-surface it as new.

---

## Executive summary

A quiet-to-moderate cycle: one genuinely global finding, three concrete
single-platform/campaign additions, and one long-outstanding watchlist item
finally closed.

| Rank | Proposal | Target | Measured today | Why |
|---|---|---|---|---|
| 1 | **BASE-D2 — `.garden` TLD** | `regions/base.ts` | `.garden` is absent from `SUSPICIOUS_TLDS` | Interisle *Phishing Landscape 2026* ranks it 4th by abuse score, directly behind `.xin`, `.win` and `.icu` — all three already listed on the same methodology; benefits every region at once, one-line change |
| 2 | **IE-D1 — Fixed Charge Notice smishing** | `regions/ie.ts` | A Garda-impersonating "unpaid Fixed Charge Notice" link scores `safe 0` | Closes the long-outstanding **IE D8** watchlist item (unfiled since at least 2026-11-08): multiple 2026 Garda/local-news sources confirm the live script and that genuine FCN correspondence is post-only, never SMS |
| 3 | **AU-D1 / AU-D2 — QUFC Exchange & Loxaris** | `regions/au.ts` | Both platform names score `safe` today (8–10) | Two named fraudulent trading platforms added to ASIC's own alert pages in November 2026 — QUFC Exchange impersonates Macquarie Group with AI-generated video; Loxaris is on ASIC's Investor Alert List and IOSCO's I-SCAN network |
| 4 | **US-D1 — fake traffic-citation/hearing smishing** | `regions/us.ts` | A representative lure scores `safe 0` | FTC consumer alert (Apr 2026) describes a spike in texts impersonating state courts over fake unpaid tickets; corroborated by NHTSA and three state DMVs |
| 5 | **BASE-D1 — crypto-wallet "mandatory update" phishing** | `scamDetector.ts` (composite) + `regions/base.ts` | No existing `REQUEST_WORDS` entry matches "update your wallet" phrasing | Four independent 2026 campaigns (MetaMask, Trust Wallet, Ledger, Trezor) share one script — deadline, threatened permanent loss of access, "Update Now" link/QR — confirmed by the vendors' own "we never send mandatory update emails" statements |

**Region demand:** not measurable this cycle — see *Region demand signal*,
below. Same as every prior cycle.

---

## Carried items re-checked this cycle

- **IE D8 (Garda Fixed Charge Notice phrasing)** — **RESOLVED THIS CYCLE.**
  Re-investigated with fresh 2026 sources (Cork City Council, Cork Safety
  Alerts, Donegal Daily, Irish Examiner). The exact FCN-smishing shape and the
  post-only correspondence fact are both now well-evidenced enough to file —
  see **IE-D1**, below.
- **KE — CMA-named fraud platforms / NG — regulator-named platforms
  (WayvePay, Gvest)** — carried, unchanged. Neither KE nor NG is in this
  cycle's weekly or rotation list, so not re-investigated; the open policy
  question (can a `minimal` pack carry a regulator-named-platform list) is
  still unresolved.
- **IT AdE IRPEF-refund / Bonus Vacanci phrasing** — re-investigated this
  cycle (IT now in rotation). CERT-AGID logged 24 fake-refund campaigns in one
  week (3–9 Oct 2026); the authority mention (`"agenzia delle entrate"`)
  already fires on these lures. The remaining gap is the Italian refund
  phrasing itself, which stays **NEEDS NATIVE REVIEW** — no proposal, same
  conclusion as before, now with current evidence behind it.
- **KR post-breach voice-phishing/smishing (FSS 2026-26)** — re-investigated
  this cycle (KR now in rotation). The FSS's response window has been
  extended to end of December 2026 following a 6 Nov follow-up breach, but no
  second-victimisation case has yet been confirmed and no distinctive
  English-renderable phrase exists. Stays **NEEDS NATIVE REVIEW**, carried.
- **FR / IT / BR / ID native-review items** — partially resolved: FR's
  ANTAI gap is now a concrete, filed proposal (FR-D1) rather than a generic
  "needs review" line. IT and ID were checked this cycle (see above, and
  *Indonesia*, below) and found either still native-blocked or already
  covered. BR is unchanged (not in this cycle's rotation).
- **GB — benign direct-debit confirmation scores `suspicious 40` (Octopus
  Energy)** — not re-chased this cycle; carried.
- **US — post-election "recount"/donation-fraud follow-up scripts** — no
  corroborating source found post-3 Nov 2026 midterm beyond the already-known
  pre-election IC3 PSA. Carried, unchanged.
- **"Hi Mum" WhatsApp-number opener without a money ask** — carried,
  unchanged.
- **Smishing Triad / PhaaS TLD rotation** — no new TLD surfaced beyond
  `.garden` (see BASE-D2), which is independently sourced from Interisle
  measurement rather than a Smishing Triad campaign report.

---

## Threats by region

### Australia (`full`) — two findings

AU's pack is mature (`au.ts`, ~690 lines); most tactics searched this cycle
— toll/parcel/super/tax lures, ClickFix, callback-SMS, job-recruitment and
investment-group composites — are already live and current. Two named
fraudulent trading platforms are new on ASIC's own pages this month and are
not yet in `au.ts`'s `fakeInvestmentPlatforms: ["yepbit"]`:

- **QUFC Exchange** — ASIC's [Investment scam alerts](https://www.asic.gov.au/regulatory-resources/scams/investment-scam-alerts)
  page lists it under November 2026: impersonates Macquarie Group using
  executives' names, images and AI-generated video. ASIC has taken down 20+
  copycat sites and new ones keep appearing.
- **Loxaris** (loxaris.net) — added to ASIC's Investor Alert List 18 Nov
  2026, passed to [IOSCO's I-SCAN network](https://www.iosco.org/i-scan/?id=58146)
  19 Nov 2026 as an unlicensed/unregistered entity offering financial
  products.

Measured against the live engine (`checkCustom`, region `AU`): a
withdrawal-complaint lure naming "Loxaris" scores 8/safe; a
guaranteed-returns lure naming "QUFC Exchange" scores 10/safe. Neither
string exists in `base.ts` or `au.ts` today, so neither triggers
`fakeInvestmentPlatformFlag` (+50).

**Investigated, not proposed:**
- **Fake vehicle-sales "shopfront" scam** ([Scamwatch, 3 Nov 2026](https://www.scamwatch.gov.au/about-us/news-and-alerts/media-update-when-the-shopfront-is-a-scam))
  — fake dealer sites display stolen Australian addresses/phone
  numbers/ABNs. No published URL pattern, and the tell (a fabricated ABN on a
  fetched page) isn't something this engine can check — it scores pasted
  text/links, not fetched page content. Watchlist, not a proposal.
- **ACCC phone-number spoofing** — voice-channel only, and misdated (see
  *Corrections*, above).
- Black Friday AI-storefront/deepfake-ad warnings (seasonal, 22 Nov 2026
  secondary press) — already generically covered by base's reward-word and
  typosquat signals; no new distinguishing IOC.
- NASC's 2025 *Targeting Scams Report* (employment scams +102.4%, investment
  losses $945m) — confirms existing `jobSignals`/investment coverage is
  well-targeted; implies no new rule.

### United Kingdom (`full`) — two findings

**Account/device-takeover smishing.** Texts claiming "A new device has been
registered. If this was NOT done by you please visit: [link] to cancel
this," spoofing NatWest's sender ID — confirmed by NatWest's own fraud guide
as not sent by them ([natwest.com](https://www.natwest.com/fraud-and-security/fraud-guide/text-message-fraud.html);
[thestar.co.uk](https://www.thestar.co.uk)). A sibling variant, "a new payee
has been added," targets Halifax/Lloyds customers (Which?). Neither names a
UK-specific term — the phrasing is generic bank-security-alert shape, not
tied to a UK agency or scheme.

**Bare "parking fine" text wave** ([Which?](https://www.which.co.uk)) — a
new reported wave of unqualified "parking fine" smishing, distinct from the
Penalty Charge Notice phrasing GB already carries.

Measured against the live engine: all three plain-text variants (no dodgy
TLD) score `safe 0` via `checkSms(..., "GB")`. `gb.ts`'s `URGENCY_TOLL`
already has "penalty charge notice"/"pcn issued" but nothing for a bare
"parking fine," and no urgency group anywhere covers device/payee-alert
phishing.

### United States (`full`) — one finding

**Fake traffic-hearing/citation smishing impersonating state courts.** [FTC
consumer alert](https://consumer.ftc.gov/consumer-alerts/2026/04/text-about-traffic-violation-probably-scam)
(Apr 2026) describes a spike in texts over fake unpaid traffic tickets, some
carrying QR codes; corroborated by NHTSA and Texas/Connecticut/South
Carolina DMV bulletins. `us.ts`'s `URGENCY_TOLL` covers E-ZPass/SunPass-style
toll lures and DMV registration-suspension threats, but nothing for a
citation/hearing notice threatening licence suspension. Measured: a
plain-text variant scores `safe 0` via `checkSms(..., "US")`.

No corroboration found this cycle for a post-midterm "recount"/donation-fraud
follow-up script (carried watchlist item, unchanged — IC3 PSA261015-3 covers
only pre-election merchandise/donation fraud).

### New Zealand (`full`) — quiet, no new finding

NCSC NZ's 4 Nov 2026 note concerns an Android-malware job-app lure — an
app-distribution vector outside this detector's text/email/phone surfaces,
so out of scope regardless of merit. A separate NCSC alert describing
police/crypto-investigation impersonation ("transfer your crypto to a secure
wallet for this investigation") is plausibly already covered by base's
`"safe wallet"`/`"move your funds"` request-words plus NZ's `"police"`
authority mention, but was not measured against the live engine this cycle —
flagged for next rotation rather than proposed on an unmeasured guess (see
*Watchlist*). IRD's reported 44% May tax-refund-scam rise ([Netsafe, 4 Jun
2026](https://www.netsafe.org.nz)) is a volume increase, not a new script;
the phrasing it describes is already in `URGENCY_TAX`.

### Ireland (`full`) — one finding, closes a long-standing gap

**Fake "unpaid Fixed Charge Notice" smishing impersonating An Garda
Síochána.** Multiple 2026 Garda-adjacent warnings (Cork City Council, 27 Mar
2026; Cork Safety Alerts; Donegal Daily; Irish Examiner's eFlow-specific
variant) confirm the live script: a text claims an unpaid FCN with a payment
link, falsely appearing to come from An Garda Síochána, who state all
genuine FCN correspondence is sent by post only. `ie.ts`'s `AUTHORITY_MENTIONS`
has `"garda"`/`"gardai"` but no FCN-specific phrase, and `URGENCY_TOLL` has
only the generic "penalty notice issued." Measured: a plain-text variant
scores `safe 0` via `checkSms(..., "IE")`. This closes **IE D8**, outstanding
and unfiled since at least the 2026-11-08 roadmap.

### Canada (`partial`) — quiet, no new finding

Four leads investigated (bank-investigator/"safe account" fraud, CAFC
self-impersonation recovery fraud, Canada Post customs-fee smishing, and the
carried "free phone upgrade" carrier-impersonation watchlist item), all
either already covered by existing base/CA signals or still lacking a
text-side IOC. [CAFC's *Fraud Trends – First 6 Months of 2026*](https://antifraudcentre-centreantifraude.ca/features-vedette/2026/08/fraud-trends-tendances-matiere-fraude-eng.htm)
reports $28.6M in bank-investigator losses, but the lure phrasing
("join the investigation," move money to a "safe account") is already caught
by base's `REQUEST_WORDS` (`"safe account"`, `"safe transfer"`, `"move your
funds"`, etc.) and `SCAM_COACHING_PHRASES`. The carrier-upgrade fraud
(TELUS/RCMP/Toronto Police/CTV News, &gt;$33K in recent Vancouver Island losses)
remains voice-initiated with no quoted SMS/email wording in any source
checked. **Genuinely quiet week — 0 proposals**, not padded to hit a quota.

### This cycle's rotation (`minimal` coverage): FR, ID, IT, JP, KR

**France** — one finding. Live phishing examples (Cybermalveillance.gouv.fr /
Univ. Lille, captured 12 Nov 2026) impersonate Ameli, the tax authority, and
**ANTAI** (the traffic-fine agency) with fake "convocation" notices.
`fr.ts` already covers Ameli and the tax authority but has no entry for
ANTAI, despite it being a named, actively-impersonated agency. See **FR-D1**.

**Indonesia** — no proposal. OJK/Satgas PASTI ([10 Nov 2026](https://ojk.go.id/id/berita-dan-kegiatan/info-terkini/Pages/Satgas-PASTI-Hentikan-Kegiatan-16-Entitas-yang-Diduga-Lakukan-Aktivitas-Keuangan-Ilegal.aspx))
halted 16 illegal task-based-earning/investment entities, some borrowing the
OJK name. The shape matches the engine's existing `taskPayment` composite and
`jobSignals`/`investmentGroupSignals` — already country-independent, and
`"ojk"` is already in `AUTHORITY_MENTIONS`. Corroborates existing coverage
rather than exposing a gap.

**Italy** — no proposal. CERT-AGID counted 24 fake-IRPEF-refund campaigns in
one week (3–9 Oct 2026). `"agenzia delle entrate"` is already in
`AUTHORITY_MENTIONS`, so the authority-impersonation signal already fires.
The remaining gap is the Italian refund phrasing itself, which the minimal
tier correctly declines to author without native verification — confirms the
carried watchlist item, doesn't close it.

**Japan** — no proposal, new watchlist item. NPA/Tokyo Metro Police (Nov
2026) report a rising fake-police-officer script escalating to a LINE
video call, demanding a transfer "to protect assets." Voice-initiated with no
distinctive SMS/email text surfaced in any source checked, and bare "police"
is deliberately excluded pack-wide (collision risk) — same reasoning as every
other region.

**South Korea** — no proposal. FSS consumer alert 2026-26 (6 Oct 2026,
response window extended to end of December after a 6 Nov follow-up breach)
warns of secondary voice-phishing/smishing following a financial-sector data
leak. `"fss"`/`"financial supervisory service"` already listed. No named
entity or distinctive English-renderable phrase — the impersonation target
is generic "financial company staff," and as of the alert's own text no
second-victimisation case has yet been confirmed. Carried, unchanged.

### Cross-region / country-independent tactics

**Crypto-wallet "mandatory update" phishing (genuinely global).** Four
independent 2026 campaigns — MetaMask (May, "$107K+ stolen"), Trust Wallet
(May, Hoxhunt), Ledger ("Your Device Needs An Urgent Update," Nov 1 deadline)
and Trezor (June deadline) — plus a Swiss NCSC-reported physical-letter/QR
variant, all share one script: a deadline, a threat of permanently losing
wallet access, and an "Update Now" link/QR to a lookalike site. MetaMask's
own statement that it never sends mandatory-update emails confirms the
*pretext* itself is the tell, not just the destination domain. Checked
against `base.ts`: `REQUEST_WORDS` has `"connect wallet"`, `"approve
transaction"`, `"seed phrase"`, `"recovery phrase"` but nothing matching
"update/upgrade your wallet." See **BASE-D1**.

**`.garden` TLD.** Interisle's *Phishing Landscape 2026* year-over-year TLD
table (May 2025–Apr 2026) ranks `.garden` 4th by abuse score, directly behind
`.xin`, `.win` and `.icu` — all three already in `SUSPICIOUS_TLDS` on the
same measurement basis. Confirmed absent from the current list. See
**BASE-D2**.

**QuickBooks/Intuit callback impersonation.** Bitdefender (Mar 2026)
reported a small business losing $95K to a "QuickBooks support" callback
scam; the fake-subscription-invoice-plus-phone-number script matches the
existing Norton/McAfee/Geek Squad/DocuSign pattern in `CALLBACK_BRANDS`.
QuickBooks is sold identically in every market the full-coverage packs serve.
See **BASE-D3**.

Everything else surfaced this cycle — Cloudflare Pages/Workers abuse growth,
Netcraft's free-dev-hosting phishing share, Vercel abuse clusters, rising
wallet-signing-request flags, the FTC's fake-CAPTCHA alert — corroborates
signals already in `base.ts`/`scamDetector.ts` rather than exposing a gap.

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| **AU-D1** | QUFC Exchange — Macquarie-impersonation AI-deepfake trading platform (ASIC, Nov 2026) | Add `"qufc exchange"` to `fakeInvestmentPlatforms` | `regions/au.ts` | AU | Near-zero — invented brand, multi-word phrase avoids collision | HIGH |
| **AU-D2** | Loxaris — unlicensed platform on ASIC's Investor Alert List / IOSCO I-SCAN (18–19 Nov 2026) | Add `"loxaris"` to `fakeInvestmentPlatforms` | `regions/au.ts` | AU | Low — distinctive invented name, no dictionary collision | HIGH |
| **IE-D1** | Fake "unpaid Fixed Charge Notice" smishing impersonating An Garda Síochána | Add `"fixed charge notice"`, `"fcn"`, `"unpaid fixed charge notice"` to `URGENCY_TOLL`; consider pairing with Garda's `noLinkSenders` entry | `regions/ie.ts` | IE | Low — distinctive Irish legal term, no ordinary-English collision | HIGH |
| **US-D1** | Fake traffic-hearing/citation text impersonating state courts, threatening licence suspension | Add qualified phrases `"traffic hearing"`, `"traffic citation"`, `"unpaid traffic ticket"`, `"pay your traffic fine"` to `URGENCY_TOLL` | `regions/us.ts` | US | Medium — bare "traffic violation" is common in legitimate correspondence; qualify on the hearing/citation+payment framing | HIGH |
| **GB-D1** | "New device registered" / "new payee added… to cancel" account-takeover smishing (NatWest/Halifax/Lloyds impersonation) | Add phrases (`"a new device has been registered"`, `"if this was not done by you"`, `"a new payee has been added"`) | `regions/gb.ts`, pending an interface decision (see *Pack-interface notes*) | GB (single-region evidence this cycle; language itself names no GB-specific term) | Low — "has been registered"/"NOT done by you" phrasing is scam-specific; legitimate bank/Apple/Google notices use "if this was you" | MEDIUM — see note |
| **GB-D2** | Bare "parking fine" text wave | Add `"parking fine"`, `"outstanding parking fine"` to `URGENCY_TOLL` | `regions/gb.ts` | GB | Medium — qualify with "outstanding"/"pay your" to avoid flagging ordinary council correspondence | MEDIUM |
| **FR-D1** | ANTAI (traffic-fine agency) impersonation phishing, named in live examples (12 Nov 2026) | Add `"antai"` to `AUTHORITY_MENTIONS` | `regions/fr.ts` | FR | Low — not an ordinary French word/fragment | MEDIUM |
| **BASE-D1** | Crypto-wallet "mandatory update or lose access" phishing (MetaMask/Trust Wallet/Ledger/Trezor, 2026) | New composite in `scamDetector.ts` (sibling to the crypto-exchange TOAD composite): require a wallet/crypto term **and** an update-urgency phrase (`"mandatory update"`, `"wallet needs an update"`, `"lose access to your wallet"`) **and** a link/QR | `scamDetector.ts` + `regions/base.ts` (new gated phrase list) | All | Low once gated — **high if shipped as a flat word-list entry instead of a composite**, since bare "update your wallet" collides with Apple/Google Pay update prompts | HIGH |
| **BASE-D2** | `.garden` — 4th-highest abuse score in Interisle *Phishing Landscape 2026*, directly behind three already-listed TLDs | Add `.garden` to `SUSPICIOUS_TLDS` | `regions/base.ts` | All | Very low — same evidentiary bar as `.xin`/`.bond`, no legitimate scam-adjacent consumer use | HIGH |
| **BASE-D3** | QuickBooks/Intuit subscription-invoice callback scam (Bitdefender $95K loss, Mar 2026; ongoing through Nov 2026) | Add `"quickbooks"` to `CALLBACK_BRANDS` | `regions/base.ts` | All | Low — matches existing norton/mcafee/docusign pattern | MEDIUM |

**Note on GB-D1's priority:** the underlying evidence (NatWest's own fraud
guide, Which?'s reporting) is strong and the measured-before state is a clean
`safe 0`, which would ordinarily rate HIGH. It is rated MEDIUM here instead
of HIGH because (a) it is evidenced in GB alone this cycle, with no
corroborating region, and (b) it does not cleanly fit any existing
`UrgencyGroups` field — see *Pack-interface notes* below. Both are reasons to
resolve a design question before implementation, not reasons to drop the
finding.

---

## Pack-interface notes

- **No `UrgencyGroups` slot fits an "account/device-takeover alert"
  campaign** (GB-D1). The closest existing group is `generic`, which is
  base-only (`Pick<UrgencyGroups, "generic" | "voiceClone">`) and not
  region-contributable; none of the region-contributed groups (`toll`,
  `parcel`, `utility`, `pension`, `recall`, `tax`, `taxThreat`,
  `foreignAuthority`) fit either. Two options for implementation to weigh:
  add a new `UrgencyGroups` field (if this shape recurs across regions), or
  route the phrases through a gated composite the way `familyImpersonation`
  and `settlementRedirect` already work. This file does not resolve which —
  that is an implementation-time design call.
- **BASE-D1** needs no interface change: it reads the existing
  `cryptoExchanges` list and plain-text matching, the same shape as the
  crypto-exchange TOAD composite it sits beside.
- No other proposal this cycle needs anything `types.ts` cannot already
  express — AU-D1/AU-D2/BASE-D3 are plain `string[]` additions,
  IE-D1/US-D1/GB-D2/FR-D1 are plain list additions to existing fields
  (`URGENCY_TOLL` / `AUTHORITY_MENTIONS`).

---

## Region demand signal

The production libSQL/Turso database is **not reachable from this research
environment**: no `local.db` fallback file exists in this checkout, no
`.env.local` is present, and no `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
environment variables are set. No volume figures, ZZ-fallback counts, or
region breakdowns are estimated or invented in their place. This is the same
finding as every prior cycle's roadmap.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Two findings — AU-D1 (QUFC Exchange), AU-D2 (Loxaris); mature pack, most searched tactics already covered |
| GB | deep | Two findings — GB-D1 (account/device-takeover smishing, interface gap flagged), GB-D2 (parking fine wave) |
| US | deep | One finding — US-D1 (fake traffic-citation/hearing smishing); no corroboration for post-election recount scripts |
| NZ | deep | Quiet; Android-malware note out of scope, police/crypto-investigation impersonation unmeasured — see Watchlist |
| IE | deep | One finding — IE-D1, closes the long-outstanding IE D8 watchlist item |
| CA | light | Quiet; carrier-impersonation "free phone upgrade" fraud re-checked, still voice-only, no text IOC |
| FR | light | One finding — FR-D1 (ANTAI agency mention) |
| ID | light | OJK/Satgas PASTI task-earning scheme reviewed; already covered by existing composites, no proposal |
| IT | light | AdE IRPEF-refund wave reviewed; authority mention already fires, remaining gap needs native review, no proposal |
| JP | light | Fake-police + LINE video-call escalation reviewed; voice-only, no text IOC — new watchlist item |
| KR | light | FSS 2026-26 alert reviewed (window extended to Dec 2026); no addable phrase, native review required |
| AE, BR, DE, IN, KE, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA | skipped | Not in this cycle's weekly or rotation list |

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| AU — fake vehicle-sales "shopfront" ABN/address spoofing | **OUT OF SCOPE (NEW)** | Needs a page-content-verification signal the engine doesn't have — it scores pasted text/links, not fetched page content |
| AU — ACCC phone-number spoofing | **CORRECTION, not a finding** | Circulating as 2026 news but the underlying alert is dated 23 Jun 2025; also voice-only |
| NZ — police/crypto-investigation impersonation ("transfer to a secure wallet for this investigation") | **NEEDS VERIFICATION (NEW)** | Plausibly already covered by base's `"safe wallet"`/`"move your funds"` plus NZ's `"police"` authority mention, but not measured against the live engine this cycle — measure before proposing or closing |
| NZ — Android-malware job-app lure | **OUT OF SCOPE** | App-distribution vector, not text/email/phone |
| CA — "free phone upgrade" carrier-impersonation fraud | **MONITORING — re-checked, unchanged** | TELUS/RCMP/police sources confirm text/email is a possible vector but none quote wording; still voice-channel-dominant |
| IT — AdE IRPEF-refund / Bonus Vacanze phrasing | **NEEDS NATIVE REVIEW** | Re-checked this cycle, unchanged — authority mention already fires, refund phrasing itself needs native verification |
| KR — post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW** | Re-checked this cycle; response window now extended to Dec 2026, still no confirmed case or addable phrase |
| JP — fake-police + LINE video-call escalation | **NEEDS NATIVE REVIEW / NO TEXT SIGNAL (NEW)** | Voice-initiated, no SMS/email IOC found in any source checked |
| GB — benign direct-debit confirmation scores `suspicious 40` (Octopus Energy) | **PROBE LEAD** | Carried, not re-measured this cycle |
| US — post-election "recount"/donation-fraud follow-up scripts | **MONITORING, unchanged** | No corroborating source found post-3 Nov 2026 beyond the pre-election IC3 PSA |
| KE — CMA's 15 newly-named unlicensed platforms / NG — WayvePay, Gvest | **NEEDS POLICY DECISION** | Carried, unchanged — neither region in this cycle's scope |
| Cloudflare "Drop" (launched 8 Jul 2026) | **MONITORING (NEW)** | PhishFort flags accelerated phishing deployment on Cloudflare's free tier, but no source gives the hostname/path pattern it produces |
| ClickFix "beyond clipboard" variants | **MONITORING (NEW)** | Real evolution (fake browser error → download-and-run a file) but no source gives the user-facing lure wording needed for a rule |
| Device-code / OAuth phishing kits (Kali365, Forg365, NovaCookies, CoGUI) | **NOTED, likely out of scope** | Enterprise Microsoft 365 credential theft, not a consumer-pasted SMS/email/phone artifact |
| FR / BR native-review items | **NEEDS NATIVE REVIEW** | Carried, unchanged — BR not in this cycle's scope; FR's concrete ANTAI gap is now filed as FR-D1 |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle beyond `.garden`, independently sourced |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Carried, unchanged |

---

## Sources

**Australia:**
- https://www.asic.gov.au/regulatory-resources/scams/investment-scam-alerts
- https://www.iosco.org/i-scan/?id=58146
- https://www.scamwatch.gov.au/about-us/news-and-alerts/media-update-when-the-shopfront-is-a-scam
- https://www.nasc.gov.au/system/files/targeting-scams-report-2025.pdf

**United Kingdom:**
- https://www.natwest.com/fraud-and-security/fraud-guide/text-message-fraud.html
- Which? — "Santander, Halifax and NatWest: avoid the latest bank scam texts"; "Scam alert: new parking fine scam text"

**United States:**
- https://consumer.ftc.gov/consumer-alerts/2026/04/text-about-traffic-violation-probably-scam
- https://www.ic3.gov/PSA/2026/PSA261015-3

**New Zealand:**
- https://www.ncsc.govt.nz (4 Nov 2026 notice; police/crypto-investigation impersonation alert)
- Netsafe, IRD tax-refund-scam rise (4 Jun 2026)

**Ireland:**
- Cork City Council — fraudulent parking/FCN notices (27 Mar 2026)
- Cork Safety Alerts — "Gardaí Issue Nationwide Warning Over Fake Fixed Charge Notice Text Scam"
- Donegal Daily; Irish Examiner — eFlow-specific FCN variant

**Canada:**
- https://antifraudcentre-centreantifraude.ca/features-vedette/2026/08/fraud-trends-tendances-matiere-fraude-eng.htm
- https://cyber.gc.ca/en/news-events/cyber-centre-warns-sophisticated-smishing-activity-targeting-canadians
- https://www.cyber.gc.ca/en/guidance/smishing-protect-yourself-sms-attacks-itsap00103
- https://www.telus.com/en/wise/resources/content/article/cellphone-service-provider-fraud
- https://www.ctvnews.ca/vancouver/vancouver-island/article/free-phone-scam-leaves-vancouver-island-victims-paying-for-phones-they-dont-have/
- https://www.iphoneincanada.ca/2026/10/11/phone-return-scam-hits-vancouver-island-with-losses-already-topping-33000/
- https://www.canadapost-postescanada.ca/cpc/en/support/kb/security/general-information/what-do-to-if-you-get-suspicious-email

**France:**
- https://www.lafabriquedunet.fr/agences/tendances/exemples-mail-phishing (incl. Cybermalveillance/Univ. Lille, 12 Nov 2026 capture)
- https://www.cybermalveillance.gouv.fr/medias/2026/03/CP-RA2026.pdf

**Indonesia:**
- https://ojk.go.id/id/berita-dan-kegiatan/info-terkini/Pages/Satgas-PASTI-Hentikan-Kegiatan-16-Entitas-yang-Diduga-Lakukan-Aktivitas-Keuangan-Ilegal.aspx
- https://finansial.bisnis.com/read/20261110/55/2020074/satgas-pasti-hentikan-16-entitas-ilegal-dari-modus-deposit-hingga-impersonasi

**Italy:**
- https://www.informazionefiscale.it/sms-rimborso-irpef-328-euro-truffa-agenzia-entrate
- https://www.open.online/2026/10/01/torna-truffa-rimborsi-irpef-agenzia-entrate-cestinate-email-allarme/
- https://quifinanza.it/innovazione/falsi-rimborsi-irpef-truffa-agenzia-entrate/1015871/

**Japan:**
- https://www.npa.go.jp/bureau/cyber/pdf/R8_Vol.20cpal.pdf
- https://www.city.shinjuku.lg.jp/content/000470124.pdf

**South Korea:**
- https://www.bokjiro.go.kr/ssis-tbu/cms/pc/news/promotion/1310465_1118.html
- https://etoday.co.kr/news/view/2633049

**Cross-region / global:**
- Bitdefender HotForSecurity — "Small business owners lose $95,000 after a 'QuickBooks support' callback scam" (Mar 2026)
- Interisle — *Phishing Landscape 2026* TLD series
- CryptoSlate — MetaMask wallet-drain reporting; Hoxhunt — Trust Wallet phishing analysis (May 2026); PCrisk — Ledger/Trezor "urgent update" write-ups
- Swiss NCSC weekly report 26w33
- FTC consumer alert — fake-CAPTCHA/Win+R scam (Jun 2026)
- Fortra/PhishFort — Cloudflare Pages/Workers/Drop abuse; Netcraft — free-hosting phishing share (H1 2026); INKY — Vercel abuse clusters
- SOC Prime — "ClickFix Tradecraft Evolves Beyond Clipboard-Based Attacks" (13 Nov 2026)

---

## Issues opened

| Proposal | Issue |
|---|---|
| AU-D1 — QUFC Exchange | [#539](https://github.com/alekslinde/veriguard/issues/539) |
| AU-D2 — Loxaris | [#540](https://github.com/alekslinde/veriguard/issues/540) |
| US-D1 — fake traffic-citation/hearing smishing | [#541](https://github.com/alekslinde/veriguard/issues/541) |
| IE-D1 — Fixed Charge Notice smishing | [#542](https://github.com/alekslinde/veriguard/issues/542) |
| BASE-D1 — crypto-wallet "mandatory update" composite | [#543](https://github.com/alekslinde/veriguard/issues/543) |
| BASE-D2 — add `.garden` to `SUSPICIOUS_TLDS` | [#544](https://github.com/alekslinde/veriguard/issues/544) |

GB-D1, GB-D2, FR-D1 and BASE-D3 are MEDIUM priority and not filed as issues
this cycle, per the 6-per-run cap — they remain proposals in this document
for a future cycle or direct implementation to pick up.
