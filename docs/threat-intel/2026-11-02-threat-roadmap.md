# Threat-intelligence roadmap — 2026-11-02

*Sweep period: since the 2026-10-25 roadmap. Issues opened: #509, #510, #511
— see §Issues opened.*

## Step 0 — a correction to this sweep's own assignment

The architecture brief this sweep was run against describes the region packs as
living at `packages/engine/src/regions/`. That path does not exist in this
checkout. The live engine is `packages/detect/` (the `@veriguard/detect`
workspace package — see `CLAUDE.md`), and the region packs are at
`packages/detect/src/regions/*.ts`. Everything below was researched and
measured against the real path. Worth fixing in whatever generates that brief,
since a future run trusting it without checking would orient against nothing.

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from 2026-10-25. `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npm install` was needed first to resolve the `@veriguard/detect` workspace
link (same finding as 2026-10-25 — `npm run check-research-freshness` fails
with `Cannot find module '@veriguard/detect/regions'` until then). The
incidental `package-lock.json` diff from that install was reverted before
committing; this sweep touches only `docs/threat-intel/`.

`npm run check-research-freshness -- --plan 5` names this cycle's regions:
**weekly AU GB US NZ CA IE**, **rotation KE SG AE BR ES**.

Read in full this cycle: `regions/types.ts`, `regions/base.ts`, the AU/GB/IE/NZ/
US/CA region packs, the KE/SG/AE/BR/ES region packs, `scamDetector.ts` in full
(`checkUrl`, `checkSms`, `checkEmail`, `checkPhone`, `checkCustom`, the
`Signals`/`mentions`/`mentionsAny`/`mentionsAsAcronym` matching machinery, the
ClickFix/splicedWording/familyImpersonation/taskPayment composites,
`jobSignals`, `investmentGroupSignals`, the quishing regex, the callback/TOAD
composite, `scoreToResult`/`downgradeForCoverage`), `phoneIntel.ts` (skimmed),
and all five `signals/*.ts` modules (skimmed). Grepped `docs/threat-intel/
sources.yml` for every region in scope. Read `docs/threat-intel/README.md` in
full and the three most recent roadmaps (2026-10-25, plus the watchlist/carried
items referenced from it back to 2026-10-16) for carried items.

Research for AU, GB+IE, US+NZ, CA+rotation, and cross-region/global tactics was
run as five parallel research passes, each independently cross-checking its
candidates against the live code before reporting a gap. Every finding that
became a filed proposal below was independently re-measured by the author of
this file against the live detector (see each proposal's before-score).

---

## Executive summary

**A real week, concentrated in two places: AU's `fakeInvestmentPlatforms`/
`URGENCY_TAX` gaps, and a genuine IE coverage gap that AU and AE already
closed for themselves.** GB, US and CA were all re-checked deeply and are
quiet — nothing new survived cross-referencing against the live engine. NZ
surfaced a real but not-time-sensitive gap. The minimal-tier rotation (KE, SG,
AE, BR, ES) behaved exactly as the tier is designed to: one code-ready finding
(KE) that in turn surfaces an unresolved tier-policy question already on the
watchlist from NG, and four regions with nothing to add under their own rules.

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | **AU-D1 — named fraudulent platform "Yepbit" has zero AU coverage** | `regions/au.ts` | `"Start investing with Yepbit today - guaranteed high returns, verified by our trading experts."` → **safe 0**, zero signals | `au.ts` never sets `fakeInvestmentPlatforms` at all — AU inherits only base's four generic names. ASIC has issued repeated, named warnings against Yepbit since at least mid-2026 |
| 2 | **AU-D2 — "bonus payment" cost-of-living clickbait not in `URGENCY_TAX`** | `regions/au.ts` | `"You are eligible for a new Centrelink bonus payment. Confirm your myGov details to receive your bonus payment now."` → **safe 0** | Services Australia's own 29 Oct 2026 warning describes exactly this live, recurring lure; the authority-mention credit is deferred and never activates with nothing else to corroborate it |
| 3 | **IE-D1 — Garda WhatsApp-crest impersonation has no `authorityMessagingAppFlag`** | `regions/ie.ts` | `"Garda fraud unit: please continue this conversation on WhatsApp to protect your case and avoid arrest."` → **safe 0** under IE, vs **likely_scam 55** for the identical AFP-worded AU lure | AU and AE both set this field; `ie.ts` never has, despite Gardaí's own repeated 2026 warnings about the WhatsApp-crest script |
| 4 | **NZ-D1 — FSCL self-impersonation has zero authority-mention coverage** | `regions/nz.ts` | Both a victim's description and FSCL's own warning text → **safe 0, no flags** | Real, standing gap (FSCL is a dispute-resolution body distinct from the FMA and entirely absent from `nz.ts`'s `AUTHORITY_MENTIONS`), but the underlying scam reporting itself is not new this cycle — see *FP note* below for why it's filed at MEDIUM rather than HIGH |

**Also surfaced, not filed as a proposal:** KE's CMA named three fraudulent
platforms this cycle with zero KE coverage — the identical shape as AU-D1 —
but KE is a `minimal` pack, where listing a brand-shaped name is exactly what
the tier's own rules say a `minimal` pack must not do (see `sg.ts`'s header).
Whether a *regulator-named, no-ambiguity* platform name is the kind of "brand
knowledge" that rule means to forbid is already an open question on the
watchlist (NG's WayvePay/Gvest, carried since before 2026-10-25) — KE's finding
is recorded alongside it rather than independently decided here. See
*Pack-interface and policy notes*.

**Region demand:** not measured this cycle — see *Region demand signal*. The
production report store remains unreachable from this research environment,
same as every prior cycle.

---

## Threats by region

### Australia (`full`) — deep, two findings

**AU-D1 — "Yepbit" and the empty `fakeInvestmentPlatforms` field.**
ASIC's Investor Alert List has been active through September-October 2026,
adding dozens of unlicensed/imposter trading platforms a month (e.g. 34 new
entries added in one week, 12-16 Oct 2026 — FastBull market-news aggregation
of the ASIC list). Most of these are disposable one-off scam domains with no
brand recognisability, and are not candidates for this field — but **Yepbit**
has drawn sustained, repeated, name-level warnings (Financial Standard, 2026;
TradeInformer, two separate 2026 pieces, one specifically on Yepbit and one on
the related "FPG Fortune Prime Global"). `regions/au.ts` has never set
`fakeInvestmentPlatforms` — AU inherits only base's four generic names
(`quantum ai`, `immediate edge`, `bitcoin era`, `bitcoin trader`), despite
every other full-coverage pack (GB, US, NZ, IE) and even partial-coverage CA
authoring region-specific names in this field.

Measured: `checkSms("Start investing with Yepbit today - guaranteed high returns, verified by our trading experts.", undefined, "AU")` → **safe 0**,
zero signals, even though the platform is named in ASIC's own public warnings.
For comparison, a named platform already in base ("quantum ai") scores +50 and
reaches `likely_scam` alone under any region — confirming a correctly-wired
entry would close this immediately.

**Proposed rule:** add a `fakeInvestmentPlatforms: ["yepbit"]` array to
`regions/au.ts`'s `AU` export (the field already exists on `RegionDefinition`
and is additive to base — see `fakeInvestmentPlatforms?: string[]` in
`types.ts`). FPG Fortune Prime Global is a weaker, single-mention candidate;
not proposed this cycle for lack of a second corroborating source.

**FP risk:** LOW. "Yepbit" has no dictionary or ordinary-English collision and
no legitimate consumer use; ASIC's repeated named warnings are the same bar
the existing base entries (`quantum ai`, `bitcoin era`) were added on.

**Acceptance criteria:** the measured phrase above reaches at least
`suspicious` from the named-platform credit alone (the existing mechanism
scores a hit at +50, which reaches `likely_scam` on its own — matching the
precedent of every other named platform already in the codebase).

---

**AU-D2 — "bonus payment" cost-of-living clickbait, and a deferred-credit trap.**
Services Australia refreshed its standing warning on 29 Oct 2026 ("Watch out
for scams after Centrelink payment increases") describing a recurring fake
"bonus payment" lure with the claimed amount varying by campaign ($600/$750/
$890/$950/$1,600/$1,800/$4,100 — Yahoo Finance AU, 2026; disa.org coverage of
the same Services Australia advisory).

Measured: `checkSms("You are eligible for a new Centrelink bonus payment. Confirm your myGov details to receive your bonus payment now.", undefined, "AU")`
→ **safe 0**. Reading `scamDetector.ts` to find why: the authority-mention
credit for "centrelink" is `sig.addDeferred` and only activates once some
*other*, non-deferred signal has already fired. Here nothing else does —
"bonus payment" is not in `URGENCY_TAX`, "mygov"/"centrelink" are themselves
non-scoring `SUBJECT_NOT_ASK` service names rather than asks, and no reward
trigger word (`claim`/`prize`/`free`/etc.) appears. The deferred credit shows
in the flags at 0 points and never converts.

**Proposed rule:** add `"bonus payment"` to `URGENCY_TAX` in `regions/au.ts`
(optionally also `"cost of living bonus"` — a documented variant in the same
advisory). A +10 hit from this alone is enough to corroborate the deferred
authority-mention credit, bringing the measured example to 35 (`suspicious`).

**FP risk:** LOW. No genuine Services Australia correspondence uses "bonus
payment" framing — the advisory exists precisely because the agency is
disclaiming it.

**Acceptance criteria:** the measured phrase above reaches at least
`suspicious` (20+) once the new phrase is added, via the +10 urgency hit
converting the existing deferred +25 authority credit.

No other AU finding this cycle survived cross-checking. AUSTRAC's "general
counsel"/recovery-fraud WhatsApp pitch (Cyber Daily, 13 Oct 2026) is already
fully caught once paired with actual recovery-fraud wording (measured
`likely_scam 67`); the bare framing without money language is a voice-call-led
scam with no clean SMS/email text to propose against. Australia Post's
Christmas-season Darcula-kit warning (QR/link fake-courier pages aimed at
Facebook Marketplace sellers) is a delivery-mechanism evolution the existing
quishing rule and `URGENCY_PARCEL`/`PARCEL_ADDRESS_PHRASES` already cover — no
new text pattern identified. CommBank's October 2026 BEC/rewards-points-expiry
advisories reconfirm signals already shipped (the loyalty-points reward words,
the bond/BEC redirect composite). No AU-specific "digital arrest" evidence
found this cycle (stays IN-specific, deferred).

### United Kingdom (`full`) — deep, no new finding

Searched Action Fraud, NCSC UK, HMRC, DVLA, Royal Mail, TV Licensing, Dart
Charge and UK bank advisories for September-November 2026. Everything found
either restates an already-covered tactic (NatWest/TSB smishing, bank
"fake fraud team" callback calls, Royal Mail £1.99 parcel-fee texts, DVLA
"vehicle no longer taxed" texts, TV Licensing "payment failed" emails — a
representative Royal Mail customs-fee lure measured `likely_scam 95` already)
or is undated/outside the window. No current reporting on Dart Charge
specifically this cycle. No proposal.

**Carried watchlist item re-checked:** the GB benign direct-debit false
positive on Octopus Energy (previously carried at `suspicious 40`). Re-tested
this cycle with `"Octopus Energy: your Direct Debit of £85.40 will be
collected on 15 November. Manage your account at octopus.energy"` → **safe 0**
(the message now scores a 0-point "names a well-known company" flag only).
The false positive could not be reproduced with this wording — it may already
be fixed by an intervening change, or the original probe used different exact
text that this run does not have access to. Recording as **possibly
resolved** on the watchlist rather than re-carrying it unchanged, pending
confirmation with the original probe text if it can be recovered.

### United States (`full`) — deep, no new finding

Searched FTC, CISA, IRS, USPS, SSA, FEMA and US bank/carrier advisories.
Four leads checked, all either already covered or out of scope: an SSA
"account suspended" / fake-OIG lure already measures `likely_scam 65`/
`suspicious 35`; an "instant cash payments" FTC self-impersonation warning
traces to 2021, not new; IRS AI-voice-clone impersonation calls (2026 Dirty
Dozen) are a voice-channel tactic whose text-arrives-after-the-call shape is
already in base's `URGENCY_VOICE_CLONE`; and a dated poll-worker-ballot
"disqualification" forwarded-message campaign around the 3 Nov 2026 midterm
(Tennessee Election Commission, 14 Oct 2026; FBI corroboration ~30 Oct 2026)
carries no link and no credential/payment ask — it is civic misinformation,
not a solicitation-shaped scam, and out of this detector's scope as designed.
No US proposal this cycle. (US-D1/US-D2 from 2026-10-25 — midterm voter-
registration lures and IC3 self-impersonation — already shipped; not
re-proposed.)

### New Zealand (`full`) — deep, one finding

**NZ-D1 — FSCL self-impersonation, zero coverage.** FSCL (Financial Services
Complaints Limited — a dispute-resolution scheme distinct from the FMA) warns
that it never asks for payment, and that emails carrying its logo asking a
complainant to "agree to release funds" are impersonation (fscl.org.nz
advisory). Measured: both a victim's own description of the lure and FSCL's
own warning text, under `NZ` → **safe 0, no flags**. `nz.ts`'s
`AUTHORITY_MENTIONS` lists `fma`, `commerce commission`/`comcom` and
`reserve bank`, but has no `fscl` entry at all.

**FP note — why MEDIUM, not HIGH:** the underlying advisory itself is not new
this cycle (the dated sourcing traces back roughly a year); what is new is
only that this research pass happened to find the gap. A late-October 2026
Inside Retail NZ piece has FSCL's chief commenting on scam-dispute volumes at
a record high, but does not describe a new tactic. Per this archive's own
discipline, a real, zero-FP, code-ready fix doesn't need to wait for fresh
news to be worth shipping — but it also isn't the time-sensitive item this
week's HIGH tier is for, so it is filed as a proposal (not discarded) at
MEDIUM priority, with no issue opened this cycle.

**Proposed rule:** add `"fscl"`, `"financial services complaints"` to
`regions/nz.ts`'s `AUTHORITY_MENTIONS`. "fscl" is a 4-letter acronym with no
dictionary collision found (unlike `ird`/`acc`/`dia` in the same file, which
need word-boundary matching) — case-insensitive, unqualified addition.

**FP risk:** LOW.

No other NZ finding. Netsafe's only dated item this cycle restates the
September 2026 bank-impersonation volume note already recorded on
2026-10-25.

### Ireland (`full`) — deep, one new finding plus a correction

**IE-D1 — Garda WhatsApp-crest impersonation, no `authorityMessagingAppFlag`.**
Gardaí have repeatedly warned (multiple dated 2026 local-news reports via
corksafetyalerts.com, letterkennylive.ie, kildarenow.com, donegallive.ie) that
scammers set a Garda crest as a WhatsApp profile photo and, posing as
officers, ask for bank details or move a "case" conversation onto WhatsApp.
`scamDetector.ts` has a generic "agency moves the case onto WhatsApp/Telegram"
composite gated on `PACK.authorityMessagingAppFlag`; `au.ts` and `ae.ts` both
set this field, `ie.ts` never has.

Measured: `checkSms("Garda fraud unit: please continue this conversation on WhatsApp to protect your case and avoid arrest.", undefined, "IE")` → **safe 0**
(only the 0-point "names a government agency" flag). The identical lure
reworded for AU (`"AFP fraud unit: please continue this conversation on
WhatsApp..."`) under `AU` → **likely_scam 55** (the +25 authority credit plus
the +30 WhatsApp-specific flag both fire). This is a clean, large,
reproducible gap between two packs that share the same underlying mechanism.

**Proposed rule:** add `authorityMessagingAppFlag` to `regions/ie.ts`'s `IE`
export, modelled on `au.ts`'s wording, naming Garda/An Garda Síochána and
pointing to FraudSMART, citing Gardaí's own WhatsApp-crest warnings.

**FP risk:** LOW — the composite requires both a named authority mention AND
an explicit "continue on WhatsApp/Telegram" instruction together; ordinary
"message me on WhatsApp" from a real contact carries neither.

**Acceptance criteria:** the measured phrase above reaches `likely_scam`
(45+) once the flag is added, matching the AU/AE precedent exactly.

**IE-D8 correction (carried since 2026-10-18, previously OUTSTANDING/unfiled)
— Fixed Charge Notice smishing.** This cycle found the actual phrasing
(nationwide Garda warning via corksafetyalerts.com and oceanfm.ie: SMS claims
an unpaid Fixed Charge Notice with a payment link; Gardaí confirm all FCN
correspondence, including reminders, is by post only). Measured:
`checkSms("You have an unpaid Fixed Charge Notice. Pay now at https://garda-fcn-pay.top to avoid court action.", undefined, "IE")` → **suspicious 40**
already (link +15, authority-mention credit +25 — both from existing,
unmodified code). Per the README's verify-before-filing rule ("already ≥
`suspicious` on the phrase alone — drop it, or state explicitly what the
addition buys"): there is no measurable gain available here. **Closing this
out as a correction — real tactic, already adequately scored, no code change
needed** — rather than carrying it forward unfiled for a fourth cycle.

### Canada (`partial`) — light, no new finding

Three leads checked against the live engine, all already covered: the
"Canada milk/bread settlement" fake class-action SMS (CAFC reporting since 25
Mar 2026) already measures `suspicious 27`; CRA Canada Carbon Rebate phishing
already measures `likely_scam 47`; and IRCC/passport typosquat domains
(`ircc-online.org`, `ca-ircc-apply.com`) already measure `likely_scam 60` —
`"ircc"` is already in `ca.ts`'s `TYPOSQUAT_BRANDS`. No gap found.

**The French-language gap that keeps CA at `partial`** was searched directly
this cycle (Sûreté du Québec, Office de la protection du consommateur, AMF)
and only secondary/undated material surfaced (grands-parents fraud, a
Hydro-Québec fraud wave, a March-2026 AMF/OPC fake-lender warning) — nothing
concrete and datable enough to seed even a watchlist entry this cycle. The
CAFC's own October-2026 vishing alert (AL26-028, help-desk voice phishing)
targets organisations, not consumers, and is out of scope for this detector.
No CA proposal.

### This cycle's rotation (`minimal` coverage): KE, SG, AE, BR, ES

Consistent with the tier's own design — see `sg.ts`'s header on what a
`minimal` pack may and must not contain. Four of five regions yielded nothing
code-ready; that is the tier working as intended, not a research shortfall.

#### Kenya — one finding, policy question rather than a clean proposal

Kenya's Capital Markets Authority named roughly fifteen unlicensed investment
entities in a September 2026 notice, including **"Quant Vest Stock Exchange
(QVSE)"** and **"Global Investment Group."** Measured:
`checkSms("Invest with Quant Vest Stock Exchange today - guaranteed daily returns", undefined, "KE")` → **unknown 0**, no hit at all (`ke.ts` defines no
`fakeInvestmentPlatforms` of its own, inheriting only base's four generic
names — the identical shape as AU-D1, just in a `minimal` rather than `full`
pack). Separately noted: "guaranteed daily returns" does not substring-match
base's "guaranteed returns" — a pre-existing, non-KE-specific gap, not
proposed here as its own item since it would need checking across every
pack's bait-phrase coverage, not just KE's.

**Why this is not filed as a ready proposal:** `sg.ts`'s tier-rules header
says a `minimal` pack must not carry `typosquatBrands`/`brandMentions`
because "which brands get impersonated here is the most region-specific
signal there is, and guessing produces false positives." A regulator-named
fraudulent platform is a different kind of claim — it requires no linguistic
or cultural judgement, only reading a public notice, which is closer to what
the tier's `authorityMentions`/`reportingBody` fields are allowed to assert.
But the field in question, `fakeInvestmentPlatforms`, is not explicitly
addressed either way in that header, and the identical question is **already
unresolved on the watchlist** for Nigeria's WayvePay/Gvest entries (carried
since before 2026-10-25, marked NEEDS POLICY DECISION). Rather than
independently deciding a tier-policy question for one region while it sits
open for another, this finding is recorded alongside NG's — see *Pack-
interface and policy notes* — for a human to resolve once, for both.

#### Singapore — watchlist only, already covered

A 14 Aug 2026 police advisory describes an ICA/Chinese-official impersonation
surge (72 cases since January 2026, S$6.1M lost). Already covered: `"ica"` is
in `sg.ts`'s `AUTHORITY_MENTIONS`, and the Chinese-authority block is shared
from base. No urgency or brand keywords can be added under SG's own tier
rules (multilingual population, no native reviewer). No proposal.

#### UAE — watchlist only, weak sourcing

Secondary reporting (not independently fetchable — `ecrime.ae` is geofenced
to the UAE, consistent with its `expect: geofenced` registry entry) describes
callers impersonating a "Dubai Crisis Management" unit claiming Dubai Police
affiliation, plus fake consumer-protection/visa/insurance sites. A fabricated-
unit-name entry (the same shape as the US "Tax Resolution Oversight
Department" entry) is plausible, but the exact wording could not be verified
against a primary source this cycle. Recorded on the watchlist, not proposed.

#### Brazil — watchlist only, already covered

World Cup-themed fraud volume (34% of Brazilians reportedly affected, up from
2022), roughly 120 fake income-tax sites targeting `gov.br`, and a TSE
WhatsApp voter-registration scam were all found, but are Portuguese-language
and tier-blocked from keyword additions; `"justiça eleitoral"` (the relevant
TSE term) is already in `br.ts`'s `AUTHORITY_MENTIONS`. No proposal.

#### Spain — watchlist only, outside the window

INCIBE's own self-impersonation campaign (INCIBE-2026-478, July 2026 — fake
Policía Nacional/Guardia Civil/INCIBE extortion emails) and a "Mi Carpeta
Ciudadana" phishing wave (INCIBE-2026-165, March 2026) are both outside the
1-2 month freshness window and Spanish-language/tier-blocked regardless;
`"incibe"` is already an authority mention. No proposal.

### Cross-region / country-independent tactics

**No new base-layer finding this cycle** — the third consecutive quiet cycle
for this section. Checked specifically:

- **New PhaaS kits/hosting.** The "Iron Man" kit (Microsoft, ~14 Oct 2026,
  tied to Storm-3119/YAM Store) and RaccoonO365/Proton66 bulletproof hosting
  are real but describe fraudulently-obtained cloud infrastructure generally,
  not a concrete consumer-facing hostname pattern to add to
  `SUSPICIOUS_HOSTING` (the existing list — `workers.dev`, `pages.dev`,
  `trycloudflare.com`, `railway.app`, `vercel.app`, `r2.dev`, `ngrok.io`/
  `ngrok-free.app`, `github.io`, `netlify.app` — already covers the shape).
- **AI voice-clone/deepfake.** Volume growth only (NordVPN: 7.4× dark-web
  seller activity); no new SMS/text follow-up phrasing beyond what
  `URGENCY_VOICE_CLONE` already covers.
- **New abused TLDs.** Interisle's *Phishing Landscape 2026* is only
  partially published (Substack instalments on namespace proportions only) —
  no new per-TLD ranking table available yet to cite as a measurement-grade
  base rate. Re-check next cycle once the full report lands.
- **Quishing.** Confirmed continued growth (ESET: QR codes in ~11% of H1 2026
  phishing email; a Mimecast malformed-calendar-invite QR campaign) — all
  delivery-mechanism variations the existing generic QR-scan-prompt rule in
  `checkSms` already catches regardless of theme.
- **ClickFix evolution.** Checked `signals/clickfix.ts` directly against two
  candidates: CrashFix (Huntress, Jan 2026) is delivered via a malicious
  browser extension with no SMS/email lure text at all — out of scope for a
  text-based detector. The nslookup/DNS-exfiltration ClickFix variant
  (Microsoft, Malwarebytes, Feb 2026) changes the *payload-delivery*
  mechanism, not the user-facing instruction — the victim still runs the same
  Win+R/PowerShell step the existing rule already catches.
- **Fake investment platforms.** Several new single-country regulator actions
  this cycle (SEC/FSA Isle of Man/FSCA cases) are each pack-seeding material
  for their *own* region, not base-layer — flagged to the relevant region
  passes rather than proposed here.
- **Non-Chinese diaspora impersonation scripts.** No comparably cross-border-
  documented script naming a different nationality's police/embassy found
  this cycle — insufficient evidence for a new shared base.ts export.

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| AU-D1 | Named fraudulent platform "Yepbit" has zero AU coverage | Add `fakeInvestmentPlatforms: ["yepbit"]` to the `AU` export | `regions/au.ts` | AU | LOW | **HIGH** |
| AU-D2 | "Bonus payment" cost-of-living clickbait, deferred authority credit never converts | Add `"bonus payment"` (optionally `"cost of living bonus"`) to `URGENCY_TAX` | `regions/au.ts` | AU | LOW | **HIGH** |
| IE-D1 | Garda WhatsApp-crest impersonation — no `authorityMessagingAppFlag` | Add `authorityMessagingAppFlag` to the `IE` export, modelled on `au.ts`/`ae.ts` | `regions/ie.ts` | IE | LOW | **HIGH** |
| NZ-D1 | FSCL self-impersonation — zero `AUTHORITY_MENTIONS` coverage | Add `"fscl"`, `"financial services complaints"` to `AUTHORITY_MENTIONS` | `regions/nz.ts` | NZ | LOW | MEDIUM |
| — | Three CMA-named Kenyan fraud platforms ("Quant Vest Stock Exchange"/"QVSE", "Global Investment Group") | Not filed — see policy note above; would be `fakeInvestmentPlatforms` on `KE` if the tier question resolves yes | `regions/ke.ts` | KE | LOW (if shipped) | pending policy decision |

### AU-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"Start investing with Yepbit today - guaranteed high returns, verified by our trading experts."` (region AU) | safe 0, zero signals |

**Acceptance criteria:** reaches `likely_scam` (45+) from the named-platform
credit alone (+50, the same mechanism every existing entry in this field
uses).

### AU-D2 — measured before/after

| Lure | Verdict today |
|---|---|
| `"You are eligible for a new Centrelink bonus payment. Confirm your myGov details to receive your bonus payment now."` (region AU) | safe 0 (deferred authority credit shows at 0 points, never converts) |

**Acceptance criteria:** reaches at least `suspicious` (20+) once the new
phrase's +10 hit corroborates the existing deferred +25 authority credit
(→ 35).

### IE-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"Garda fraud unit: please continue this conversation on WhatsApp to protect your case and avoid arrest."` (region IE) | safe 0 |
| Identical lure, AFP-worded (region AU, for comparison — AU already has the flag) | likely_scam 55 |

**Acceptance criteria:** the IE lure reaches `likely_scam` (45+) once
`authorityMessagingAppFlag` is added, matching the AU/AE result exactly.

### NZ-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"I received an email with FSCL's logo asking me to agree to release funds from my complaint. Scam warning from Financial Services Complaints Limited."` (region NZ) | safe 0, no flags |
| FSCL's own published warning text (region NZ) | safe 0, no flags |

**Acceptance criteria:** either reaches at least the +25 authority-mention
credit once `"fscl"` is added to `AUTHORITY_MENTIONS`.

---

## Pack-interface and policy notes

No `types.ts` field is missing for any filed proposal — `fakeInvestmentPlatforms`,
`URGENCY_TAX` (via `urgency.tax`), `authorityMessagingAppFlag` and
`AUTHORITY_MENTIONS` all already exist on `RegionDefinition` exactly as
needed.

**Open policy question, carried from NG and now also raised by KE:** does a
`minimal`-tier pack's "no brand knowledge" rule (`sg.ts`'s header: no
`typosquatBrands`/`brandMentions`, because judging local impersonation risk
needs linguistic/cultural knowledge this tier's authors don't have) also cover
`fakeInvestmentPlatforms` entries that are regulator-named with no ambiguity —
a different kind of claim, closer to reading a public notice than to guessing
which brands a population trusts? Nigeria's WayvePay/Gvest entries have
carried unresolved on the watchlist since before 2026-10-25; Kenya's
CMA-named "Quant Vest Stock Exchange"/"QVSE" and "Global Investment Group" hit
the identical question this cycle. Recommend resolving it once, as a written
tier-policy addendum (e.g. a note in `sg.ts`'s header or `types.ts`'s doc
comment for `fakeInvestmentPlatforms`), rather than deciding it ad hoc per
region as it keeps recurring.

---

## Region demand signal

Not measured this cycle. `lib/reportStore.ts`'s `region` column exists and is
written on every report (`storeReport`), but the production libSQL/Turso
database is not reachable from this research environment, and no local SQLite
fallback (`local.db`) exists in this checkout. This is the same finding every
prior cycle has recorded — no figures are estimated or invented in its place.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Two findings — AU-D1 (named platform "Yepbit") and AU-D2 ("bonus payment" clickbait) |
| GB | deep | Action Fraud/NCSC/HMRC/DVLA/Royal Mail/TV Licensing/Dart Charge all re-checked; nothing new. Carried Octopus Energy FP possibly resolved |
| US | deep | FTC/CISA/IRS/USPS/SSA/FEMA re-checked; nothing new survived cross-check. Election-ballot misinformation found but out of scope |
| NZ | deep | One finding — NZ-D1 (FSCL impersonation gap), filed MEDIUM due to stale underlying evidence |
| IE | deep | One new finding (IE-D1, Garda WhatsApp) plus a correction closing out the long-carried IE-D8 |
| CA | light | Three leads re-checked, all already covered; French-language gap searched directly, nothing datable found |
| KE | light | One finding, routed to the policy watchlist rather than filed |
| SG | light | ICA impersonation surge reviewed; already covered |
| AE | light | Weak/unverifiable secondary sourcing only; watchlist |
| BR | light | World Cup/tax-site/TSE items reviewed; already covered or tier-blocked |
| ES | light | Two named campaigns found, both outside the freshness window |
| AE, BR, DE, ES, FR, ID, IN, IT, JP, KR, MX, NG, NL, PH, PL, SE, TH, VN, ZA | skipped | Not in this cycle's weekly or rotation list (AE/BR/ES above are this cycle's rotation; the rest are genuinely skipped) |

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| KE — CMA-named fraud platforms (Quant Vest Stock Exchange/QVSE, Global Investment Group) | **NEEDS POLICY DECISION — new** | Same open question as NG below; see *Pack-interface and policy notes* |
| NG — regulator-named platforms (WayvePay, Gvest) in `fakeInvestmentPlatforms` | **NEEDS POLICY DECISION** | Carried, unchanged — now joined by an identical KE finding |
| GB — benign direct-debit scores `suspicious 40` (Octopus Energy) | **POSSIBLY RESOLVED** | Could not reproduce this cycle with the tested wording (now safe 0) — confirm with original probe text if recoverable, then close out |
| AE — "Dubai Crisis Management" fabricated-unit impersonation | **NEEDS PRIMARY SOURCE** | Secondary reporting only; `ecrime.ae` geofenced to automated fetch |
| Interisle *Phishing Landscape 2026* full TLD ranking | **MONITORING** | Only partial (Substack) publication available this cycle; re-check once the full report lands |
| US SEC fake-AI-trading-platform cases (named entities) | **PACK-SEEDING, US** | Multiple named cases this cycle; candidate for a future `us.ts fakeInvestmentPlatforms` addition, not independently verified against the live US pack this cycle |
| IT AdE IRPEF-refund / Bonus Vacanze phrasing | **NEEDS NATIVE REVIEW** | Carried, unchanged — IT not in this cycle's rotation |
| KR post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW** | Carried, unchanged — KR not in this cycle's rotation |
| DE — comdirect/AOK brand-specific phishing | **NEEDS NATIVE REVIEW** | Carried from 2026-10-25, unchanged — DE not in this cycle's rotation |
| VN — MPS/VNPost impersonation urgency phrasing | **NEEDS NATIVE REVIEW** | Carried from 2026-10-25, unchanged |
| IN — "digital arrest" script | **DEFERRED / BLOCKED** | Unchanged; multilingual phrasing judgement the `minimal` tier declines to make |
| FR / ES (general) / BR (general) / ID native-review items | **NEEDS NATIVE REVIEW** | Carried, unchanged — none in this cycle's deep rotation beyond the light ES/BR touch above |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Carried, unchanged |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| ASIC Investor Alert List (via FastBull aggregation, Oct 2026) | 1 (via 2 aggregation) | AU-D1 |
| Financial Standard AU — Yepbit warning | 2 | AU-D1 |
| TradeInformer — Yepbit and FPG Fortune Prime Global warnings | 2 | AU-D1 |
| Services Australia — "Watch out for scams after Centrelink payment increases" (29 Oct 2026) | 1 | AU-D2 |
| Yahoo Finance AU — Centrelink bonus-payment scam coverage | 2 | AU-D2 |
| disa.org — Centrelink fraudulent cost-of-living scheme coverage | 2/3 | AU-D2 |
| Cyber Daily — AUSTRAC "general counsel" recovery-fraud WhatsApp pitch (13 Oct 2026) | 2 | AU re-check |
| CommBank newsroom (Oct 2026) | 2 | AU re-check |
| Action Fraud / NCSC UK / HMRC / DVLA / Royal Mail / TV Licensing (via WebSearch snippets) | 1/2 | GB re-check |
| FTC / CISA / IRS Dirty Dozen (2026) / Tennessee Election Commission (14 Oct 2026) | 1 | US re-check |
| An Garda Síochána warnings (via corksafetyalerts.com, letterkennylive.ie, kildarenow.com, donegallive.ie, oceanfm.ie — local-news syndication of Garda advisories, 2026) | 1 (primary advisory) / 2 (syndication) | IE-D1, IE-D8 correction |
| FSCL (fscl.org.nz) — self-impersonation warning | 1 | NZ-D1 |
| Insurance Business Magazine AU/NZ; Inside Retail NZ (late Oct 2026) | 2 | NZ-D1 context |
| Canadian Anti-Fraud Centre (CAFC) — milk/bread settlement, AL26-028 vishing alert (Oct 2026) | 1 | CA re-check |
| CBC — CAFC settlement-scam coverage | 2 | CA re-check |
| York Region prosecution coverage (Jul 2026); IRCC fraud-site warnings | 1/2 | CA re-check |
| Kenya CMA — investor alert naming unlicensed platforms (Sep 2026) | 1 | KE watchlist |
| Singapore Police Force — ICA impersonation advisory (14 Aug 2026) | 1 | SG re-check |
| Secondary UAE reporting on "Dubai Crisis Management" impersonation | 3 (unverified against a primary source) | AE watchlist |
| Brazilian World Cup fraud / fake gov.br tax-site / TSE WhatsApp coverage | 2 | BR re-check |
| INCIBE (incibe.es) — INCIBE-2026-478, INCIBE-2026-165 | 1 | ES re-check |
| Microsoft (Iron Man/Storm-3119), Cloudflare (RaccoonO365), NordVPN (voice-clone volume), Interisle *Phishing Landscape 2026* (Substack, partial), ESET (H1 2026 quishing stats), Mimecast (calendar-QR campaign), Huntress (CrashFix), Malwarebytes/Microsoft (nslookup ClickFix), Isle of Man FSA (Niolic Limited), IBTimes UK (fake-SEC-credentials AI trading case) | 1-3, mixed | Cross-region section |

---

## Issues opened

All three HIGH proposals were filed as GitHub issues (checked against
existing issues first via `gh api search/issues` — no duplicates found):

| ID | Issue | Priority |
|---|---|---|
| AU-D1 | [#509 — AU: named fraudulent platform "Yepbit" has zero AU coverage](https://github.com/alekslinde/veriguard/issues/509) | HIGH |
| AU-D2 | [#510 — AU: "bonus payment" cost-of-living clickbait not in URGENCY_TAX](https://github.com/alekslinde/veriguard/issues/510) | HIGH |
| IE-D1 | [#511 — IE: Garda WhatsApp-crest impersonation, no authorityMessagingAppFlag](https://github.com/alekslinde/veriguard/issues/511) | HIGH |

NZ-D1 is filed as a proposal above at MEDIUM priority and has no issue opened
this cycle, per the task's HIGH-only issue-filing rule. Full issue text is
reproduced above in each proposal's section rather than duplicated here.
