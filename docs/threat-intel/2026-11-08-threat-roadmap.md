# Threat-intelligence roadmap — 2026-11-08

*Sweep period: since the 2026-10-25 roadmap (overlapping the 2026-11-02
sweep — see note below).*

## Note on the gap in the archive

A sweep happened between this roadmap and the 2026-10-25 one. When this
roadmap was drafted, its file was still an open draft (#512), so this sweep
read its period from 2026-10-25; `2026-11-02-threat-roadmap.md` has since been
merged and is the provenance for issues #509, #510 and #511, which shipped in
#513 ("fix(detector): close three AU/IE detection gaps from the Nov 2 sweep")
on 2026-11-06. Those three fixes —
`"yepbit"` added to AU's `fakeInvestmentPlatforms`, `"bonus payment"` /
`"cost of living bonus"` added to AU's `URGENCY_TAX`, and IE's
`authorityMessagingAppFlag` for the Garda/WhatsApp-crest script — are already
live in `au.ts` and `ie.ts` as read for this cycle, so they are **not**
re-proposed below. Recording this here so a future reader knows why the two
sweep periods overlap.

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

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly AU GB US NZ CA IE**, **rotation KE SG AE BR ES** — confirmed
against a second, independent source: GitHub issue #447 ("🧭 Weekly sweep
brief"), the automated feed digest, which names the identical cycle and shows
every region still inside its freshness window as of this run.

Read in full this cycle: `regions/types.ts`, `regions/base.ts`,
`scamDetector.ts` (in full — `checkUrl`, the `Signals` class and its
`mentions`/`mentionsAny`/`mentionsAsAcronym` matching machinery, `checkSms`,
`checkEmail`, `checkPhone`, `checkCustom`, `scoreToResult`/
`downgradeForCoverage`), `phoneIntel.ts` (including `analysePhone` and the
wangiri/high-scam/elevated-volume tables), `signals/phone.ts`, and the region
packs for AU, GB, US, NZ, IE, CA (weekly) plus KE, SG, AE, BR, ES (this
cycle's rotation). Read `docs/threat-intel/README.md` in full and the
2026-10-25 roadmap in full, including its watchlist — IE D8 (Garda Fixed
Charge Notice phrasing) was re-investigated this cycle as a result (see
*Carried items*, below).

**Detection changes since the 2026-10-25 sweep:** three (#509/#510/#511,
shipped as #513 — see the note above). No other functional changes found in
`packages/detect/src/` this cycle.

**Region demand signal:** the production libSQL/Turso database is not
reachable from this research environment — no `local.db` fallback file
exists in this checkout, `.env.local` is absent, and no `TURSO_DATABASE_URL`
/ `TURSO_AUTH_TOKEN` environment variables are set. Same finding as every
prior cycle; no figures are estimated or invented in its place. See *Region
demand signal*, below.

---

## Executive summary

**A real cycle, not a quiet one** — five of six proposals are genuinely new
findings with measured before/after scores, and one ($883K AU case, SRA
corroboration in GB) surfaces a structural engine gap rather than a one-line
keyword miss.

| Rank | Proposal | Target | Measured today | Why |
|---|---|---|---|---|
| 1 | **US-D1 — "$2,000 tariff rebate" text scam** | `regions/us.ts` | `"Your $2,000 tariff rebate is ready for deposit. Confirm your details..."` → safe 15 | Live since Jan 2026, still running in Oct 2026 (IRS + multiple state AGs warning); no funded program exists (SCOTUS struck down the authority) |
| 2 | **CA-D1 — fake "Provincial Court" traffic-summons SMS** | `regions/ca.ts` | A representative "Mandatory Traffic Summons" lure → essentially bare-link score, no composite credit | Saskatchewan RCMP (30 Jun 2026) + Saskatoon Police + CC Gazette (7 Aug 2026); foreign-country-code senders; genuine fine payment never arrives this way |
| 3 | **GB-D1 — NCSC self-impersonation** | `regions/gb.ts` | Bare "NCSC" / "National Cyber Security Centre" → no authority credit at all; an NCSC lure asking to move to WhatsApp → safe 0 | NCSC's own Aug 2026 guidance: "we will never contact you by text message or WhatsApp" — NZ already lists its NCSC as an authority, and AU and IE set the messaging-app flag for their own agencies; GB has neither |
| 4 | **ENGINE-D1 — property-settlement / conveyancing BEC** | `scamDetector.ts` (region-agnostic) | Nothing scores the settlement context: a lure is caught only by its generic bank-detail and changed-details hits, which the email channel — where this scam arrives — discounts 0.7× (65 → 45 and 35 → 24 for two lures), and "moved banks… new BSB" wording is not recognised as a change at all (safe 10) | Scamwatch's own case study: **$883,093.90** lost to a fake solicitor invoice during property settlement; the UK SRA issued a near-identical alert 30 Sep 2026, confirming this is not AU-specific |
| 5 | **IE-D1 — Garda / Fixed Charge Notice no-link-sender gap** | `regions/ie.ts` | A Garda-impersonating link gets authority credit but no no-link-sender flag | Garda / FraudSMART reporting consistently states all Garda correspondence, including Fixed Charge Notices, is sent by post — never by SMS — and IE's `NO_LINK_SENDERS` omits Gardaí entirely |
| 6 | **AU-D1 — fake-news-brand deepfake investment endorsements** | `regions/au.ts` | `"As seen on 9News: [fake PM endorsement] ... guaranteed returns"` → no "as seen on" credit | ASIC (mid-Aug 2026) + Scamwatch (early Nov 2026): fake articles carrying real AU media logos and fabricated PM/celebrity endorsements — the same "as seen on `<media>`" tactic NZ already encodes |

**Region demand:** not measurable this cycle — see *Region demand signal*.
The production report store remains unreachable from this research
environment, same as every prior cycle.

---

## Carried items re-checked this cycle

- **IE D8 (Garda Fixed Charge Notice phrasing)** — re-investigated with fresh
  searches. Multiple 2024–2026 local-news reports (Cork Safety Alerts, Ocean
  FM, Boyle Today, Donegal Daily, Letterkenny Live) confirm the recurring FCN
  smishing text is still live and that Gardaí state all FCN correspondence,
  including reminders, goes by post only — but none gave the exact SMS
  wording or a malicious domain/IOC, so the specific phrasing proposal still
  cannot be filed responsibly. **Still OUTSTANDING, unfiled.** The same
  research did surface a related, well-evidenced gap that *can* be filed
  responsibly without the missing phrasing — see **IE-D1** above, which closes
  it from the no-link-sender side instead.
- **GB benign direct-debit confirmation scores `suspicious 40` (Octopus
  Energy)** — carried from earlier cycles; not re-measured this cycle.
- **NG regulator-named platforms (WayvePay, Gvest) in `fakeInvestmentPlatforms`**
  — carried, unchanged. This cycle's KE research (see below) adds a second,
  independent data point to the same open question: Kenya's CMA named 15
  unlicensed platforms on 11 Sep 2026, and whether a `minimal` pack may ever
  carry a regulator-named-platform list is still a policy decision, not a
  research one.
- **TH `tcsd.in.th` serves a placeholder page** — carried, unchanged.
- **IT / KR / ES / FR / BR / ID native-review items** — carried, unchanged
  except ES, which gained a concrete new data point this cycle — see *Spain*,
  below.
- **"Hi Mum" WhatsApp-number opener without a money ask** — carried, unchanged.

---

## Threats by region

### Australia (`full`) — two findings

**Fake-news-brand deepfake investment endorsements (AU-D1).** ASIC's
mid-August 2026 warning and Scamwatch's early-November 2026 investment-scam
update both describe fake articles and websites carrying real AU media
logos — ABC News, 9News, 7News, news.com.au, Sunrise, Today — with fabricated
celebrity and politician endorsements (the Prime Minister is reportedly the
most-impersonated figure) steering readers to fake trading platforms. This is
the identical "as seen on `<trusted media>`" legitimacy-cover tactic NZ
already encodes in `nz.ts`'s `REWARD_WORDS` (`"as seen on rnz"`, `"as featured
in nz herald"`, `"as seen on tvnz"`), added after the FMA's April 2026
advisory on the same shape with NZ media brands. AU's `REWARD_WORDS` carries
the WhatsApp-group-recruitment half of the same campaign (`"stock tips
group"`, `"investment club"`, `"exclusive trading group"`) and the
regulator-endorsement-claim half (`"verified by asic"`) but nothing for the
fake-media-logo half. Sources: ASIC media release (~mid-Aug 2026); Scamwatch
news-and-alerts (early Nov 2026); Finder.com.au, "Celebrity deepfake
investment scams targeting Aussies online"; NSW ID Support, "Celebrity
deepfake investment scams online".

**Property-settlement / conveyancing BEC fraud — promoted to a cross-region
engine finding (ENGINE-D1).** Scamwatch's own published case study
(`scamwatch.gov.au/node/1163`) records an AU couple losing **$883,093.90** to
a fake solicitor invoice with "updated" bank details sent just before a
property settlement; a 9 September 2026 Michael West article and PEXA's scam
white paper describe the same pattern as a rising risk. This surfaced in AU
research but is explicitly **not** AU-only — the UK's SRA issued a
near-identical alert on 30 September 2026 — so it is routed to
`scamDetector.ts` rather than `au.ts`. See *ENGINE-D1*, below, for the
derivation.

Everything else checked this cycle (toll/parking smishing, myGov/Centrelink
cost-of-living texts, the fake-purchase callback composite, job-recruitment
and food-delivery impersonation, ATO/myGov tax-time phishing, bank "safe
account" calls, AI voice-clone follow-up texts) is already covered by
existing signals, confirmed by re-checking against `AUTHORITY_MENTIONS`,
`REWARD_WORDS`, `REQUEST_WORDS` and the relevant `scamDetector.ts`
composites. ASIC's Investor Alert List added roughly 34 newly-named
unlicensed platforms in the 12–16 October window alone; these are
deliberately **not** proposed for `fakeInvestmentPlatforms` — that list is
for names warned about repeatedly over time (the way "Yepbit" earned its
entry via Sep–Oct 2026 *repeated* ASIC warnings, shipped in #513), and a
single week's crop of a constantly-rotating list is not durable evidence.

### United Kingdom (`full`) — one finding, two-part fix

**NCSC self-impersonation (GB-D1).** The UK NCSC published dedicated guidance
("How to spot scammers claiming to be from the NCSC", dated August 2026)
warning that criminals pose as NCSC officials by phone to extract money or
information, stating explicitly: "we will never contact you by text message
or WhatsApp." NZ's NCSC was added to `nz.ts`'s `AUTHORITY_MENTIONS` three
cycles ago (2026-10-06 roadmap D7/#428), and AU and IE (and AE) each set an
`authorityMessagingAppFlag` for their own agencies; NZ does not set one. GB
has **neither**: no `"ncsc"` / `"national cyber security
centre"` in `AUTHORITY_MENTIONS`, and no `authorityMessagingAppFlag` field
set at all (it's an existing optional field on `RegionDefinition` — GB simply
never populated it). DVLA vehicle-tax-refund scams and Ofgem/energy-rebate
lures were both re-checked and remain fully covered by existing entries; no
new proposal for either.

### United States (`full`) — one finding

**"$2,000 tariff rebate" text scam (US-D1).** Live since January 2026 and
still being warned about in October 2026 — the Idaho AG, multiple other state
AGs, and the IRS itself ("any emails, texts, or social media posts claiming
you must 'act now' to receive a $2,000 check are scams"). No such program is
funded — the Supreme Court struck down the tariff authority that would have
paid for it — yet texts keep circulating claiming a "$2,000 tariff
rebate"/"tariff dividend" check is ready, with urgency framing and a link.
Measured against `us.ts`/`checkSms`: `"Your $2,000 tariff rebate is ready for
deposit. Confirm your details to receive it: <link>"` scores **safe, 15**
(link only) — not already covered by the existing `"stimulus payment"` /
`"economic impact payment"` / `"tax refund"` entries, confirmed by grep (zero
existing "tariff" references anywhere in the engine). The last cycle's two
already-shipped US changes (IC3 self-impersonation, midterm-election voter-
registration lures — commit 6e8b2b5) are not revisited; the 3 November
midterm has now passed, and a dedicated search for post-election "recount" or
donation-fraud follow-up scripts turned up nothing solid enough to propose —
noted as a one-line watchlist item for next cycle instead. SNAP/EBT
"shutdown" phishing and Medicare open-enrollment scams were both checked and
are already adequately covered (the former reaches `likely_scam`/`suspicious`
today via existing entries; the latter is the same shape existing signals
already catch).

### New Zealand (`full`) — quiet, no new finding

No September/October 2026 Netsafe or CERT NZ release surfaced beyond what the
2026-10-25 roadmap already recorded. A 15 October 2026 Netsafe figure shows
online-shopping-scam reports *declining* from August to September — a volume
note, not a new tactic. Re-checked against `AUTHORITY_MENTIONS` (already
carries `"ncsc"`), `TYPOSQUAT_WORD_BRANDS` and `BRAND_MENTIONS` — nothing new
to route. No proposal.

### Ireland (`full`) — one finding

**Garda / Fixed Charge Notice no-link-sender gap (IE-D1).** While
re-investigating the still-outstanding D8 item (see *Carried items*, above),
the same sources exposed a related, independently-fileable gap: `ie.ts`'s
`NO_LINK_SENDERS` list is `["revenue", "revenue commissioners", "ros",
"department of social protection", "social protection", "dsp", "an post",
"anpost", "ntma", "state savings"]` — Gardaí ("garda" / "gardai" / "an garda
siochana", already in `AUTHORITY_MENTIONS`) are absent, despite Garda's own
repeated, public, consistent confirmation that it never sends a link by SMS
for any matter. This closes real ground even without the still-missing exact
FCN phrasing: an impersonating message naming Gardaí with a link already
partially earns authority credit today, but misses the `+15` no-link-sender
flag a corroborated organisational fact should trigger.

### Canada (`partial`) — one finding

**Fake "Provincial Court" traffic-summons SMS (CA-D1).** Saskatchewan RCMP
(30 June 2026), Saskatoon Police (recurring advisories through 2026), and CC
Gazette (7 August 2026) describe a text impersonating a provincial court with
a fabricated case number, judge name and officer badge number, threatening
prosecution and linking to a fake "Courts of Saskatchewan" payment page;
sender numbers are reported with foreign country codes (+21x, +44). A
parallel Alberta variant names "Alberta Registry Services." Measured against
`ca.ts`: the existing `URGENCY_TOLL` group has only toll/licence-plate
phrasing, not court-summons framing, and `AUTHORITY_MENTIONS` has no
"provincial court" entry — a representative lure earns essentially no
composite credit beyond the bare link today. A separate "free phone upgrade"
carrier-impersonation fraud (Edmonton Police: ~100 reports, ~$20M in losses,
linked to Lahore-based call centres, reported 4 Nov 2026) is a voice-channel
con with no distinctive SMS/email text for this detector to key on — noted on
the watchlist, not proposed.

### This cycle's rotation (`minimal` coverage): KE, SG, AE, BR, ES

Zero proposals this cycle across all five — consistent with the tier's own
design (agencies and a reporting body only; urgency keywords, brands and
allowlists all need native-language review this cycle did not attempt) and a
genuinely quiet rotation rather than under-research. Two items are worth
recording:

- **Kenya** — the CMA publicly named 15 unlicensed investment platforms on 11
  September 2026 (Global Investment Group, QVSE, Abacus Wealth Management and
  others), under active DCI investigation. This is regulator-named-platform
  material, the same open question already flagged for NG's WayvePay/Gvest
  (**NEEDS POLICY DECISION** — whether a `minimal` pack may carry a
  regulator-named-platform list at all) — not resolved here, just given a
  second data point.
- **Spain** — INCIBE-2026-478 (10 Jul 2026, "Alta" severity): a resurging
  (per secondary press, ~31 Oct 2026) extortion campaign impersonating the
  Policía Nacional, Guardia Civil and INCIBE together, falsely accusing
  recipients of CSAM-related crimes to extort payment through fear. All three
  bodies are already in `es.ts`'s `AUTHORITY_MENTIONS`; the threat-framing
  phrasing itself is Spanish and needs native-speaker authorship, which the
  `minimal` tier explicitly excludes. This is concrete, dated, and recurring —
  the strongest native-review pack-seeding candidate of the five regions this
  cycle.

Singapore, UAE and Brazil each turned up only tactics already covered by
existing agency mentions, or defensive bank-side features (BACEN's in-app Pix
scam-alert initiative) rather than new scam tactics to detect.

### Cross-region / country-independent tactics

**Property-settlement / conveyancing BEC — see ENGINE-D1.** Surfaced in AU
research, corroborated by a UK SRA alert, and routed as engine logic rather
than a pack entry because the gap is structural (see below).

Nothing else cleared the strict "fires correctly for any country" bar this
cycle. Checked and found already covered or not yet dateable to this window:
new PhaaS kits (BlueKit, Knight Office, Blacksite — Sep/Oct 2026 vendor
reporting) are kit-infrastructure stories with no new victim-facing text
pattern, and the delivery mechanism they share is already caught by the
AiTM OAuth2/OpenID path-shape rule in `checkUrl`; AI voice-clone scams
continue at growing volume but with no new phrasing beyond what
`URGENCY_VOICE_CLONE` already covers; quishing has no October/November-dated
campaign; ClickFix variants (cmdkey/regsvr32, TerminalFix/FileFix/MacSync)
predate this window or are already reflected in the existing Windows/Mac
composites; no new globally-operating fake-investment-platform name
surfaced; the pig-butchering group-chat recruitment composite already targets
the WhatsApp/Telegram investment-group tactic vendors describe as
"emerging." One soft watchlist item: Glitch (`glitch.me`) as a possible
future `SUSPICIOUS_HOSTING` candidate, flagged but not proposed — the
abuse-reporting source found could not be dated to this cycle's window.

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| US-D1 | "$2,000 tariff rebate" text scam | Add `"tariff rebate"`, `"tariff dividend"` to `URGENCY_TAX` | `regions/us.ts` | US | LOW | **HIGH** |
| CA-D1 | Fake "Provincial Court" traffic-summons SMS | Add `"traffic citation"`, `"traffic summons"`, `"mandatory traffic summons"`, `"outstanding traffic citation"` to `URGENCY_TOLL`; add `"provincial court"` to `AUTHORITY_MENTIONS` | `regions/ca.ts` | CA | LOW | **HIGH** |
| GB-D1 | NCSC self-impersonation (authority mention + WhatsApp/Telegram pivot) | Add `"ncsc"`, `"national cyber security centre"` to `AUTHORITY_MENTIONS`; set `authorityMessagingAppFlag` citing NCSC's "never by text or WhatsApp" wording | `regions/gb.ts` | GB | LOW | **HIGH** |
| ENGINE-D1 | Property-settlement / conveyancing BEC fraud | A new composite requiring settlement/conveyancing context (`property settlement`, `conveyanc*`, `solicitor's trust account`, `settlement funds`) **and** a changed-payment-details claim — not a widening of the rental-bond gate, which needs only context plus a bank-detail ask; declare its email weight through the signal registry so the 0.7× discount never applies; widen the changed-details wording to cover "moved banks" / "new BSB" | `scamDetector.ts` (region-agnostic) | ALL (evidence from AU + GB) | HIGH without the changed-details half; LOW with it | **HIGH** |
| IE-D1 | Garda / Fixed Charge Notice no-link-sender gap | Add `"garda"`, `"gardai"`, `"an garda siochana"`, `"garda siochana"` to `NO_LINK_SENDERS`; update `noLinkSendersFlag` copy to cite postal-only FCN correspondence | `regions/ie.ts` | IE | LOW | MEDIUM |
| AU-D1 | Fake-news-brand deepfake investment endorsements | Add `"as seen on abc news"`, `"as featured on 9news"`, `"as seen on 7news"`, `"as featured in news.com.au"`, `"as seen on sunrise"`, `"as featured on today show"` to `REWARD_WORDS` | `regions/au.ts` | AU | LOW | MEDIUM |

### US-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"Your $2,000 tariff rebate is ready for deposit. Confirm your details to receive it: https://tariff-rebate-gov.top"` | safe 15 (link only) |
| `"Tariff rebate payment of $2,000 approved. Visit https://irs-tariffcheck.top to confirm eligibility."` | likely_scam 55 — but only because "irs" in the hostname earns the +25 authority mention and the +15 never-texts flag; the same text without the link scores safe 0 |
| `"You qualify for the $2000 tariff dividend payment. Tap to claim: https://..."` | suspicious 27 ("claim" alone) |

**Acceptance criteria:** the first lure should reach at least `suspicious`
(link 15 + one `URGENCY_TAX` hit 10 = 25), and the new phrase should score in
the second lure's link-free form. One hit is +10, below the 20-point
`suspicious` threshold, so the phrase alone cannot lift a link-free message
to `suspicious` — that is the shared group's design (+10 per hit, +35 cap),
not a gap in this proposal.

**FP note:** no legitimate program by this name exists (confirmed by the IRS
itself), and no government agency solicits bank or ID details by unsolicited
text for any rebate. No collision with `"tax rebate"` (different string,
checked by grep).

### CA-D1 — measured before/after

A representative lure (`"NOTICE: You have a Mandatory Traffic Summons.
Case #SK-2026-04471. Failure to respond will result in prosecution. View
details: https://courts-saskatchewan.top"`) earns no `AUTHORITY_MENTIONS`
credit and no `URGENCY_TOLL` hit today — only the generic link signal
(15, reported as `unknown` because CA's coverage is `partial`).

**Acceptance criteria:** the lure should earn a hit from the new summons
phrases. Note that the representative lure never says "provincial court", so
that entry alone would not fire on it; the court names the sources quote —
"Courts of Saskatchewan", and "Alberta Registry Services" for the Alberta
variant — are the stronger authority entries. On placement: `ca.ts` already
keeps court-threat wording ("missed your court date", #369) in
`URGENCY_FOREIGN_AUTHORITY`, which fits a prosecution threat better than the
toll group.

**FP note:** no legitimate Canadian court or police service sends
traffic-ticket payment demands by unsolicited SMS; none of the proposed
phrases appear in routine consumer messaging. LOW risk.

### GB-D1 — measured before/after

Bare `"NCSC"` / `"National Cyber Security Centre"` earn zero authority
credit today, and a message naming the NCSC while asking to continue on
WhatsApp earns nothing from the messaging-app composite (the field is unset,
so that rule is skipped entirely for GB, same as every pack without one).

**Acceptance criteria:** an NCSC-impersonating message should earn the `+25`
authority-mention credit; one that also asks to move to WhatsApp/Telegram
should additionally earn the messaging-app-pivot flag, mirroring the
mechanism AU and IE already use.

**FP note:** "ncsc" has no dictionary collision (not a word fragment of
ordinary English) and needs no case-sensitivity gate. LOW risk.

### ENGINE-D1 — derivation

This is **not** a `types.ts` gap — every field the fix needs
(`bankIdentifiers`, the existing `changedPaymentDetails` regex pattern, and
the signal registry's per-channel weights) already exists. It is a `scamDetector.ts` logic
change, which is why it is routed to the engine file rather than any one
region pack, and why it is flagged here as implementation work rather than a
one-line data edit a human can apply without judgement calls.

Today, `checkSms`'s `hasRentalContext` regex
(`/rental bond|holding deposit|lease agreement|property manager/i`) does not
match property-*purchase* settlement vocabulary (`settlement`, `conveyancer`,
`solicitor's trust account`), so nothing scores the settlement context. A
lure is caught only by its generic hits — the bank-detail ask, plus the
`changedPaymentDetails` flag when its wording matches — and the email channel,
where this BEC script actually arrives per every source found, discounts that
whole sub-result 0.7×.

Measured (AU): a lure with "updated bank details", "account number" and a
BSB scores likely_scam 65 by SMS but 45 by email; "trust account details have
been updated… BSB" scores 35 by SMS, 24 by email; "our trust account has moved
banks… use the new BSB" scores safe 10 by email, because the changed-details
pattern does not recognise "new BSB" or "moved banks".

The rental-bond composite is the wrong place to widen: it fires on rental
context plus *any* bank-detail ask, with no changed-details half. A genuine
conveyancer's settlement email carries settlement context and a BSB and
account number as a matter of course (one already scores suspicious 21 by
email), so widening that gate would flag them all. Nor is
`UNDISCOUNTED_COMPOSITES` the mechanism to extend — the engine documents it as
being retired in favour of signals that declare their own per-channel weight
through the registry.

**Acceptance criteria:** a settlement-fraud email with changed-bank-details
language and settlement/conveyancing context scores the same on email as on
SMS, and "moved banks" / "new BSB" wording counts as a change; a genuine
settlement email that gives trust-account details without claiming they
changed scores no higher than it does today.

**FP note:** HIGH if implemented as a widened rental-bond gate — "property
settlement", "deposit", BSBs and account numbers are routine in legitimate
conveyancing correspondence. LOW if the new composite requires the
changed-payment-details half: context vocabulary alone must never score.

### IE-D1 — measured before/after

A Garda-impersonating link-bearing message earns the deferred
authority-mention credit today but not the no-link-sender flag, because
Gardaí are absent from `NO_LINK_SENDERS` despite being in
`AUTHORITY_MENTIONS`.

**Acceptance criteria:** the same message should additionally earn the
`+15` no-link-sender flag once Gardaí are added to the list.

**FP note:** LOW. Genuine Garda contact is by post, phone or in person; no
sourced material describes Gardaí legitimately sending a link by SMS for any
purpose.

### AU-D1 — measured before/after

`"BREAKING: As seen on 9News — [name] reveals the AI trading platform making
Aussies rich. Guaranteed returns, limited spots."` earns credit today only
from `"guaranteed returns"` in base's `REWARD_WORDS`; the "as seen on"
legitimacy-cover claim itself scores nothing.

**Acceptance criteria:** the "as seen on `<AU media brand>"` phrase should
score independently, compounding with the existing investment-bait signals —
mirroring NZ's identical entries exactly.

**FP note:** LOW, by the same reasoning NZ's entries already rely on: no
legitimate advertising or editorial copy describes an unrelated investment
pitch as "as seen on 9News."

---

## Pack-interface notes

None this cycle. Every pack-level proposal (US-D1, CA-D1, GB-D1, IE-D1,
AU-D1) fits the existing `RegionDefinition` shape exactly as documented —
`AUTHORITY_MENTIONS`/`URGENCY_TAX`/`URGENCY_TOLL`/`NO_LINK_SENDERS`/
`REWARD_WORDS` additions, and populating the already-existing optional
`authorityMessagingAppFlag` field for GB. ENGINE-D1 needs a `scamDetector.ts`
logic change (a new registry-declared composite), not a `types.ts` change — see its derivation above for why that
distinction matters.

---

## Region demand signal

Not measurable this cycle. `lib/reportStore.ts`'s `region` column exists and
is written on every report (`storeReport`, `lib/reportStore.ts:256`), but the
production libSQL/Turso database is not reachable from this research
environment: no `local.db` SQLite fallback exists in this checkout, no
`.env.local` file is present, and no `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`
environment variables are set. This is the same finding every prior cycle has
recorded. No figures — including the rest-of-world (`ZZ`) fallback count,
which would be the clearest measure of unmet regional demand — are estimated
or invented in its place.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Two findings: AU-D1 (new) and the property-settlement BEC gap, promoted to ENGINE-D1 as a cross-region finding |
| GB | deep | One finding — GB-D1 (NCSC self-impersonation), confirmed as a genuine two-part gap |
| US | deep | One finding — US-D1 (tariff-rebate scam); post-election follow-up scripts checked, nothing solid yet |
| NZ | light | Netsafe/CERT NZ re-checked; a volume *decline* noted, no new tactic |
| IE | deep | D8 re-investigated (still outstanding); surfaced IE-D1 as an independently-fileable related gap |
| CA | light | One finding — CA-D1 (fake court-summons SMS); carrier-upgrade voice fraud noted, no text surface |
| KE | light | CMA 15-platform naming reviewed; adds to the open NG-style policy question, no proposal |
| SG | light | SPF advisories reviewed; all already covered, no proposal |
| AE | light | No Oct/Nov 2026 advisory found beyond what's already covered |
| BR | light | BACEN's Pix scam-alert feature reviewed (defensive, not a tactic); no proposal |
| ES | light | INCIBE-2026-478 CSAM-extortion campaign reviewed; strongest native-review candidate of the five, no proposal (native-review required) |
| AE, BR, CA, FR, ID, IN, IT, JP, KR, MX, NG, NL, PH, PL, SE, TH, VN, ZA | skipped | Not in this cycle's weekly or rotation list (CA listed once above; others wholly out of scope this cycle) |

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| IE D8 — Fixed Charge Notice exact phrasing | **OUTSTANDING, unfiled** | Re-investigated this cycle; Garda/FraudSMART confirm the tactic is live but no source gave exact SMS wording or an IOC. IE-D1 closes related ground from the no-link-sender side instead |
| US — post-election "recount"/donation-fraud follow-up scripts | **MONITORING — new** | 3 Nov 2026 midterm has passed; searched specifically, found nothing solid enough to propose this cycle |
| CA — "free phone upgrade" carrier-impersonation fraud | **MONITORING — new** | Edmonton Police: ~100 reports, ~$20M losses (4 Nov 2026); voice-channel con with no distinctive SMS/email text for this detector |
| KE — CMA's 15 newly-named unlicensed platforms (11 Sep 2026) | **NEEDS POLICY DECISION** | Second data point on the same open question already flagged for NG's WayvePay/Gvest: can a `minimal` pack ever carry a regulator-named-platform list? |
| ES — Police/Guardia Civil/INCIBE CSAM-extortion campaign | **NEEDS NATIVE REVIEW — new** | INCIBE-2026-478, resurging per secondary press ~31 Oct 2026; concrete, dated, recurring — strongest native-review candidate of this cycle's five rotation regions |
| Glitch (`glitch.me`) as a `SUSPICIOUS_HOSTING` candidate | **MONITORING — new** | Abuse reporting found could not be dated to this cycle's window |
| GB benign direct-debit confirmation scores `suspicious 40` (Octopus Energy) | **PROBE LEAD** | Carried, not re-measured this cycle |
| NG regulator-named platforms (WayvePay, Gvest) | **NEEDS POLICY DECISION** | Carried, unchanged |
| TH `tcsd.in.th` serves a placeholder page | **PACK HYGIENE** | Carried, unchanged |
| IT AdE IRPEF-refund / Bonus Vacanze phrasing | **NEEDS NATIVE REVIEW** | Carried, unchanged — IT not in this cycle's rotation |
| KR post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW** | Carried, unchanged — KR not in this cycle's rotation |
| FR / IT / BR / ID native-review items | **NEEDS NATIVE REVIEW** | Carried, unchanged — none in this cycle's rotation |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Carried, unchanged |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Idaho AG / other state AG offices — "tariff rebate" text scam warnings | 1 | US-D1 |
| IRS consumer alert — "$2,000 check" tariff-rebate scam | 1 | US-D1 |
| Saskatchewan RCMP (30 Jun 2026); Saskatoon Police; CC Gazette (7 Aug 2026) | 1 | CA-D1 |
| UK NCSC — "How to spot scammers claiming to be from the NCSC" (Aug 2026) | 1 | GB-D1 |
| Scamwatch — case study, scamwatch.gov.au/node/1163 | 1 | ENGINE-D1 |
| UK Solicitors Regulation Authority — conveyancing-impersonation alert (30 Sep 2026) | 1 | ENGINE-D1 |
| Michael West (9 Sep 2026); PEXA Scam Awareness white paper | 2 | ENGINE-D1 |
| FraudSMART / An Garda Síochána reporting (Cork Safety Alerts, Ocean FM, Boyle Today, Donegal Daily, Letterkenny Live) | 1/3 | IE-D1, IE D8 (carried) |
| ASIC media release (~mid-Aug 2026); Scamwatch news-and-alerts (early Nov 2026) | 1 | AU-D1 |
| Finder.com.au; NSW ID Support — celebrity deepfake investment scam coverage | 2/3 | AU-D1 |
| Netsafe — 15 Oct 2026 scam update | 2 | NZ re-check |
| Edmonton Police (4 Nov 2026); iPhoneinCanada.ca | 1/2 | CA carrier-upgrade watchlist item |
| Kenya CMA — 11 Sep 2026 public notice | 1 | KE watchlist |
| INCIBE-2026-478; democrata.es (secondary, ~31 Oct 2026) | 1/3 | ES watchlist |
| Varonis / Huntress / Malwarebytes / SecurityWeek — PhaaS kit reporting (Sep–Oct 2026) | 2 | Cross-region, no proposal |
| Interisle *Phishing Landscape 2025* (already incorporated; re-confirmed unchanged) | 2 (measurement) | Cross-region TLD re-check |

No new sources are proposed for `sources.yml` this cycle.

---

## Issues opened

Four HIGH-priority proposals were filed as GitHub issues (checked against
existing open issues first — only 3 open issues existed in the repository
before this run, none overlapping; no duplicates found):

| ID | Issue | Priority |
|---|---|---|
| US-D1 | [#518 — US: "$2,000 tariff rebate" text scam](https://github.com/alekslinde/veriguard/issues/518) | HIGH |
| CA-D1 | [#519 — CA: fake "Provincial Court" traffic-summons SMS](https://github.com/alekslinde/veriguard/issues/519) | HIGH |
| GB-D1 | [#520 — GB: NCSC self-impersonation](https://github.com/alekslinde/veriguard/issues/520) | HIGH |
| ENGINE-D1 | [#521 — ENGINE: property-settlement / conveyancing BEC fraud](https://github.com/alekslinde/veriguard/issues/521) | HIGH |

IE-D1 and AU-D1 are MEDIUM priority and are not filed as issues this cycle;
their full proposed-rule text is in the table above and is ready to file
without further research if a human decides to pick them up.
