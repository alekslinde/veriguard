# Threat-intelligence roadmap — 2026-11-15

*Sweep period: since the 2026-11-08 roadmap.*

## Note on items shipped since 2026-11-08

Four of that roadmap's proposals are now live on `main`, confirmed by `git log`
and by grepping the current files (not re-proposed below):

- **US-D1** ("$2,000 tariff rebate"), **CA-D1** (fake "Provincial Court"
  traffic-summons SMS) and **GB-D1** (NCSC self-impersonation) — issues
  #518/#519/#520, shipped in `5ae7e9c` ("fix(detector): close three GB/US/CA
  gaps from the Nov 8 sweep (#524)").
- **ENGINE-D1** (property-settlement / conveyancing BEC fraud) — issue #521,
  shipped in `571aa25` ("fix(detector): score property-settlement payment
  redirection (#527)"), now its own `signals/settlementRedirect.ts` module.

Two MEDIUM proposals from that same roadmap were **not** picked up and are
re-measured and carried forward below as **AU-D1** and **IE-D1** — both were
fully researched last cycle with no new evidence needed, just never filed as
issues. Re-measuring them against today's `main` confirms both gaps are still
exactly as described a week ago.

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from every cycle back to 2026-10-25.
`grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly AU GB US NZ CA IE**, **rotation FR ID IT JP KR**.

Read in full this cycle: `regions/types.ts`, `regions/base.ts`,
`scamDetector.ts` (all ~3,344 lines), `phoneIntel.ts`, `urlSanitizer.ts`,
`urlExpander.ts`, `emailHeaders.ts`, `detectType.ts`, all six `signals/*.ts`
modules, and the region packs for AU, GB, US, NZ, IE, CA (weekly) in full,
plus this cycle's rotation FR, ID, IT, JP, KR in full. This was split across
five parallel research/inventory passes, each independently cross-checking
its candidates against the live code; every finding that became a filed
proposal below was re-measured directly against the live detector by running
`checkSms` through `tsx` (see each proposal's before-score — exact commands
are not reproduced here, only the measured output, per the no-scratch-files
convention). Read `docs/threat-intel/README.md` in full and the three most
recent roadmaps (2026-11-08, 2026-11-02, 2026-10-25) in full, including their
watchlists, to avoid re-investigating carried items from scratch.

**Detection changes since the 2026-11-08 sweep:** two commits, both described
above (`5ae7e9c`, `571aa25`). No other functional changes found in
`packages/detect/src/` this cycle.

**Environment note:** `npm install` was needed to resolve the
`@veriguard/detect` workspace link; the incidental `package-lock.json` diff
was reverted before anything was staged. `gh auth status` reports
`GH_TOKEN` is invalid, so issues could not be filed via `gh issue create`
this cycle — see *Issues to open manually*, below.

---

## Executive summary

**A genuinely new, well-evidenced cross-region finding, plus two fully-ready
carried fixes nobody has shipped yet.** The gold "safekeeping" courier scam
is the week's substantive new threat — a zero-coverage gap confirmed by
direct measurement, sourced to both US and Canadian law enforcement, and a
clean fit for `base.ts` rather than any one region. AU and IE both carry a
second week of an unshipped, fully-researched MEDIUM proposal; both are
re-measured here and included rather than re-investigated. GB, NZ and the
FR/ID/IT/JP/KR rotation were all genuinely quiet.

| Rank | Proposal | Target | Measured today | Why |
|---|---|---|---|---|
| 1 | **BASE-D1 — gold "safekeeping" courier scam** | `regions/base.ts` | `"Please withdraw your savings and convert to gold for safekeeping with our officer."` → **safe 0**, zero signals | FBI IC3: $311.8M in gold-courier-scam losses reported in the US in 2025 (ConsumerAffairs, 11 Nov 2026); Nova Scotia RCMP dedicated warning (5 Oct 2026); Money.ca reports $28.6M in 2026 Canadian bank-impersonation losses tied to the same script family — identical mechanism in two countries, same bar that promoted the existing card/cash courier-collection phrases to base |
| 2 | **IE-D1 — Garda / no-link-sender gap** (carried from 2026-11-08, unshipped) | `regions/ie.ts` | A Garda-impersonating link lure → `suspicious 40` (no no-link-sender credit); an otherwise-identical Revenue-impersonating lure (Revenue already in `NO_LINK_SENDERS`) → `likely_scam 55` | Gardaí publicly and repeatedly confirm all correspondence, including Fixed Charge Notices, comes by post only — this gap has sat fully researched and ready for two cycles |
| 3 | **AU-D1 — fake-news-brand deepfake investment endorsements** (carried from 2026-11-08, unshipped) | `regions/au.ts` | `"BREAKING: As seen on 9News — [name] reveals the AI trading platform making Aussies rich. Guaranteed returns, limited spots."` → `safe 12` ("guaranteed returns" alone; "as seen on" scores nothing) | ASIC (~Aug 2026) and Bitdefender's Jan–Apr 2026 research (Australia = 52% of observed global deepfake-investment campaigns, PM Albanese the most-impersonated figure) — same "as seen on `<media>`" tactic NZ's pack already encodes |
| 4 | **FR-D1 — ANTAI traffic-fine agency missing from `authorityMentions`** | `regions/fr.ts` | `"ANTAI: vous avez une amende impayee. Payez ici: https://amende-antai-fr.net"` → `unknown 15` (link only, zero agency credit); an otherwise-identical DGFIP-impersonating lure (DGFIP already listed) → `suspicious 40` | Resurging ANTAI smishing since Jan 2026, using victims' real plates from a breach (~847k plates), with a `amende.gouv.fr` (missing final "s" — the real site is `amendes.gouv.fr`) typosquat and `amende-antai-fr.net`; ANTAI is a bare agency name, not a language judgement, so it fits within `fr.ts`'s `minimal`-tier rules |

**Region demand:** not measurable this cycle — see *Region demand signal*,
below. Same finding as every prior cycle.

---

## Threats by region

### Australia (`full`) — deep

**AU-D1 (carried, re-measured) — see Executive summary.** No fresher
evidence beyond last cycle's ASIC/Bitdefender sourcing was needed; the gap
and its fix are unchanged. Still ready to file with no further research.

**New this cycle, not filed as a clean rule — AI "ghost store" fake online
retailers.** The ACCC ("Consumers warned about ghost stores imitating
Australian businesses," named four sites, called the conduct "widespread"
beyond them — 350+ reports on ~60 stores since Jan 2025) and the Australian
Banking Association (reported 10 Nov 2026, ABA CEO Simon Birmingham) both
describe criminals using AI to clone legitimate AU retailers — generated
storefronts, product photos and reviews, pushed via Meta ads, timed for
Black Friday (27 Nov 2026, 12 days from this roadmap). The only
semi-structural tell named is a site claiming to be an Australian business
while sitting on a non-`.au`/`.com.au` domain, which is far too noisy to
encode as a flat rule — plenty of legitimate small AU retailers also use
`.com`/generic domains, and this is a shopping *site*, not a solicitation
message with credential/payment-ask text our keyword lists key on. **This is
a genuine gap but not a keyword fix** — it needs a product decision (is a
site-reputation signal in scope for a message/link checker at all?) rather
than a word-list addition, so it is recorded on the watchlist rather than
proposed as a rule. See *Watchlist*.

**Weak, unfiled lead — "Fake St.George Payment Alert" callback scam.** A
single tier-3 secondary source (malwaretips.com, ~Sept 2026, unverifiable
against stgeorge.com.au directly) describes a callback-number SMS naming
St.George (a Westpac-owned but customer-facing-distinct brand, absent from
`au.ts`'s `OFFICIAL_SENDER_NAMES`/`TYPOSQUAT_BRANDS` — confirmed by grep,
along with Bankwest, ING, Bendigo and Suncorp, all equally absent). The
underlying shape — named bank + callback number + no link — is very likely
already caught by the existing generic callback/TOAD composite regardless of
which bank is named; not independently measured this cycle, and the
single-source sourcing is too thin to propose a brand addition on. Watchlist
only.

Everything else checked this cycle (toll/parking smishing, AusPost
parcel/address-correction lures, Centrelink "bonus payment" variants,
ATO/myGov tax-threat phishing, superannuation early-access phishing, myID
re-registration, ACMA Sender-ID override, AUSTRAC/agency-WhatsApp pivot,
"safe account" bank calls, AI voice-clone follow-up texts, Chinese-police
impersonation, pump-and-dump stock-tips-group recruitment, "scambling" fake
gambling platforms, ASIC false-endorsement claims, the Yepbit entry, and the
property-settlement BEC fix shipped last cycle) is confirmed already covered
by direct reading of `au.ts` and `scamDetector.ts` — including the
Scamwatch/NASC "fake purchase callback" alert, which base's `CALLBACK_BRANDS`
(norton, mcafee, docusign, coinbase…) and the callback/TOAD composite already
catch with no AU-specific gain identified.

### United Kingdom (`full`) — light, no new finding

NCSC self-impersonation (GB-D1, shipped last cycle) confirmed live by grep:
`"ncsc"`/`"national cyber security centre"` are in `AUTHORITY_MENTIONS` and
`authorityMessagingAppFlag` is set. Winter Fuel Payment smishing is active
again this winter (DWP/HMRC advisories, MoneySuperMarket update dated 10 Nov
2026) but `gb.ts` already carries `"winter fuel payment"` and `"energy bill
support"` in its benefit-lure group — same shape as prior years, no new
wording. An NCSC "Black Friday" warning found in search is dated 18 November
**2024**, not this window, and the tactic it describes (urgency + fake
marketplace listings) is already generic territory covered by
`URGENCY_GENERIC`. No proposal.

### United States (`full`) — deep, no new finding (see BASE-D1)

The gold-courier scam (BASE-D1) was found via US sourcing but is routed
cross-region — see Executive summary and *Cross-region*, below. Separately
checked: an "FTC recovery agent" self-impersonation script (SSA's own 1 Nov
2026 consumer alert; Bitdefender, 2 Nov 2026) where scammers posing as FTC
staff tell people who already lost money "your money isn't safe, move it to
protect it," then direct a transfer or fee. **Measured, not a gap**:
`"This is the FTC. Your money isn't safe. Move it to protect it immediately
or call us back."` → **likely_scam 55** already, from the existing `"ftc"`
authority mention, the generic `"immediately"` urgency hit, and the
call-to-a-number flag. No proposal — this is a correction of what looked
like a possible lead, not a filed gap. Post-election "recount"/donation-fraud
follow-up scripts were searched again specifically (the midterm was 3 Nov
2026, now 12 days past) — still nothing dated found; stays **MONITORING**,
unchanged from last cycle. Toll smishing, tax-debt, SNAP/EBT, Medicare,
tariff-rebate, IC3 and midterm voter-registration entries all re-confirmed
present in `us.ts` by direct grep before searching further.

### New Zealand (`full`) — light, no new finding

Netsafe's October/November update is not yet published (latest found:
August 2026, already recorded as a volume note in the 2026-11-08 roadmap).
No CERT NZ/NCSC NZ, IRD or NZ Post advisory found inside the freshness
window. Several consecutive quiet cycles now for NZ; an honest "nothing new"
result rather than under-research.

### Ireland (`full`) — deep

**IE-D1 (carried, re-measured) — see Executive summary.** The exact scores
above are new measurements against today's `main`, confirming the gap is
unchanged and the fix is ready.

**IE D8 (Garda Fixed Charge Notice exact SMS wording) — still outstanding.**
Tried again this cycle: fetched the corksafetyalerts.com FCN article
directly, but it dates to 22 September **2025** (outside this cycle's
window) and, like every prior attempt, describes the tactic without quoting
the literal lure text or an IOC domain. A separate, undated
corksafetyalerts.com piece names foreign-country-code numbers (+359 Bulgaria,
+47 Norway) used in Garda-impersonating vishing/smishing alongside Irish
numbers — a thin, uncorroborated, undated lead, not strong enough to propose
a phone-pattern signal from. Stays **OUTSTANDING, unfiled** — now the fourth
cycle running (since 2026-10-18) without the actual message text surfacing.

### Canada (`partial`) — light, no new finding

Provincial-court traffic-summons fix (CA-D1, shipped last cycle) confirmed
live by grep. The carried "free phone upgrade" carrier-impersonation fraud
(Edmonton Police, ~$20M, ~100 reports, 4 Nov 2026) was re-confirmed as purely
voice-channel — Edmonton Police's own description is a cold call with no
SMS/email lure before or alongside it, and a related CAFC/TELUS advisory (Aug
2026) describes the identical voice-only mechanism. Stays
**MONITORING — no text surface**, unchanged. The French-language gap that
keeps `ca.ts` at `partial` was searched again (Sûreté du Québec, OPC, AMF) —
only older or undated material surfaced (a 2024 fake-speeding-fine SAAQ-zone
text, a Feb 2026 generic cyber-safety guide). Still nothing concrete and
datable; stays carried, unchanged.

### This cycle's rotation (`minimal` coverage): FR, ID, IT, JP, KR

**France — one proposal (FR-D1), see Executive summary.** A second thread —
a fake-tax-refund (DGFiP/"impôts") SMS/email wave reported from mid-June 2026
— is **not** a gap: DGFiP is already in `fr.ts`'s `AUTHORITY_MENTIONS` and
measured above at `suspicious 40`. Only ANTAI, a distinct agency from the
already-listed `ANTS` (Agence Nationale des Titres Sécurisés, case-sensitive),
was missing.

**Italy — strong pack-seeding evidence, needs native review, not filed.**
Agenzia delle Entrate (AdE) IRPEF-refund phishing has run in waves all year
(Jan, May, June, Aug/Sep, and again 1 Oct 2026 per open.online), consistently
impersonating AdE/AdE-Riscossione with fake refund portals; AdE never
announces refunds by SMS/email. This confirms the carried watchlist item is
still live and is, by a clear margin, the strongest native-review candidate
of this cycle's five rotation regions — IT's `minimal` tier has no urgency or
brand phrasing to extend, by design, until a native Italian speaker reviews
it.

**South Korea — carried item confirmed still active, not filed.** FSS/FSC
jointly issued a consumer alert (2026-10-06) for second-stage voice-phishing/
smishing exploiting recent financial-sector data breaches (fake
loan-counseling or compensation offers), with the special response period
extended through end of December 2026. Confirms the long-carried KR
watchlist item rather than closing it; still needs native review.

**Japan — volume/trend evidence, one dated data point.** NPA's own 2025
report: ¥10.397 billion in internet-banking unauthorised-transfer losses,
~90% originating from bank/card/shopping-site phishing via SMS/email. A
secondary report of a 6× month-on-month surge in sites impersonating Japan's
National Tax Agency is the one dated, specific-enough item; both need native
review before any phrasing ships. No proposal.

**Indonesia — weakest of the five, no actionable item.** OJK's Satgas PASTI
task force stopped 951–953 illegal lending/investment entities in Q1 2026,
and IASC received 500k+ scam reports, but nothing names a single platform,
domain or dated phrase concrete enough to cite as pack-seeding evidence.
Volume-note only.

### Cross-region / country-independent tactics

**Gold "safekeeping" courier scam — see BASE-D1 in Executive summary.** This
is the structural promotion this cycle: the existing courier/safe-account
group in `base.ts`'s `REQUEST_WORDS` (`"courier will collect"`, `"send a
courier"`, `"collect your card"`, `"hand over your card"`, `"withdraw cash
and"`) only matches card/cash-collection phrasing. Measured directly: a
script naming "courier will collect" the gold still scores (`safe 15`, one
existing hit) but the far more common scripted phrasing — "convert your
savings to gold," "buy gold for safekeeping," "hand the gold to our officer"
— scores **zero**, because none of it contains the word "courier" at all.
This is the same shape and the same cross-national evidence bar
(independently documented in two countries with the identical mechanism) that
originally promoted the plain card/cash version of this scam into `base.ts`.

**Everything else checked, nothing new.** ClickFix evolution: an October
2026 report describes a payload-caching change that alters delivery
mechanics, not the user-facing instruction — the victim still runs the same
Win+R/paste step the existing composite already catches; no proposal.
**Glitch (`glitch.me`) watchlist item — resolved negatively, recommend
closing.** Glitch shut down its web-hosting product on 8 July 2025; the
heaviest abuse reporting predates that shutdown, and a July 2026 check of a
`glitch.me` phishing URL returned HTTP 410 (gone). No dated 2026 campaign
exists to justify adding it to `SUSPICIOUS_HOSTING` — this is stale
infrastructure, not an emerging one, and should stop being carried. AI
voice-clone/deepfake: continued volume and "bundled scam kit" packaging
growth only, no new phrasing beyond `URGENCY_VOICE_CLONE`. New
phishing-kit/quishing evolution: the most-cited "new" kits and QR-evasion
techniques date to August–November **2025**, a year outside this window; no
proposal. No new globally-operating fake-investment-platform name surfaced.

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| BASE-D1 | Gold "safekeeping" courier scam | Extend the courier/safe-account group in `REQUEST_WORDS`: add `"buy gold for safekeeping"`, `"convert your savings to gold"`, `"convert your money to gold"`, `"gold for safekeeping"`, `"hand the gold to"`, `"give the gold to the courier"` | `regions/base.ts` | ALL (evidence: US + CA) | LOW — none of these phrases have ordinary consumer use; gated on the full imperative phrase, not bare "gold," to avoid catching legitimate bullion-dealer order confirmations | **HIGH** |
| IE-D1 | Garda / Fixed Charge Notice no-link-sender gap (carried, unshipped) | Add `"garda"`, `"gardai"`, `"an garda siochana"`, `"garda siochana"` to `NO_LINK_SENDERS`; update `noLinkSendersFlag` copy to cite postal-only correspondence | `regions/ie.ts` | IE | LOW | **HIGH** |
| AU-D1 | Fake-news-brand deepfake investment endorsements (carried, unshipped) | Add `"as seen on abc news"`, `"as featured on 9news"`, `"as seen on 7news"`, `"as featured in news.com.au"`, `"as seen on sunrise"`, `"as featured on today show"` to `REWARD_WORDS` | `regions/au.ts` | AU | LOW | **HIGH** |
| FR-D1 | ANTAI traffic-fine agency missing from `authorityMentions` | Add `"antai"` (bare, lower-case — no dictionary collision, needs no case-sensitivity gate) to `AUTHORITY_MENTIONS` | `regions/fr.ts` | FR | LOW | MEDIUM |

### BASE-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"Please withdraw your savings and convert to gold for safekeeping with our officer."` | safe 0, zero signals |
| `"This is Officer Daniels from the fraud department. Your bank account has been compromised. Please withdraw your savings, buy gold, and give the gold to our courier for safekeeping while we investigate."` | safe 0 — the existing urgency phrases ("your account has been") and courier phrase ("courier will collect") both require slightly different wording than this script uses, so nothing fires at all |
| `"A courier will collect your gold bars for safekeeping tomorrow morning."` | safe 15 — only because this one happens to use the literal existing phrase "courier will collect"; one hit alone can't clear the 20-point `suspicious` threshold |

**Acceptance criteria:** the first two lures should each earn at least one
`+15` hit from the new phrases, compounding with whatever else the full
script contains (an urgency phrase, a bank-detail ask, a link) to clear
`suspicious` on realistic full-length lures; the third should gain a second
corroborating hit from the new vocabulary.

**FP risk:** LOW. No genuine bank, police service or fraud unit instructs a
customer to convert savings to physical gold and hand it to a stranger; the
phrases are full imperative/instructional forms, not bare "gold," so they
don't collide with legitimate bullion-dealer order confirmations or jewellery
retail SMS.

### IE-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"An Garda Siochana: please review your case file here https://garda-files.top"` | suspicious 40 (link + government-agency mention; no no-link-sender credit) |
| Identical structure, Revenue instead of Garda (Revenue already in `NO_LINK_SENDERS`) | likely_scam 55 (same two signals **plus** the `+15` no-link-sender flag) |

**Acceptance criteria:** the Garda lure should reach the same `likely_scam 55`
once Gardaí are added to `NO_LINK_SENDERS`, matching the Revenue result
exactly.

**FP risk:** LOW. Garda's own public guidance consistently states it never
sends a link by SMS for any purpose.

### AU-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"BREAKING: As seen on 9News — [name] reveals the AI trading platform making Aussies rich. Guaranteed returns, limited spots."` | safe 12 — only "guaranteed returns" scores; "as seen on" contributes nothing |

**Acceptance criteria:** the same lure should score an additional hit from
the new phrase, compounding with the existing investment-bait signals —
mirroring NZ's identical `"as seen on rnz"`/`"as featured in nz herald"`
entries exactly.

**FP risk:** LOW, by the same reasoning NZ's entries already rely on: no
legitimate advertising or editorial copy describes an unrelated investment
pitch as "as seen on 9News."

### FR-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"ANTAI: vous avez une amende impayee. Payez ici: https://amende-antai-fr.net"` | unknown 15 (link only; FR's `partial`-coverage-equivalent downgrade applies since FR is `minimal`) |
| Identical structure, DGFIP instead of ANTAI (DGFIP already listed) | suspicious 40 (link + agency credit) |

**Acceptance criteria:** the ANTAI lure should reach the same `suspicious 40`
once ANTAI is added to `AUTHORITY_MENTIONS`.

**FP risk:** LOW. "ANTAI" is a five-letter agency acronym with no French or
English dictionary collision found; no case-sensitivity gate is needed
(unlike the ZA/MX/AU acronym entries that double as ordinary words).

---

## Pack-interface notes

No `types.ts` field is missing for BASE-D1, IE-D1, AU-D1 or FR-D1 — all four
fit the existing shape exactly (`REQUEST_WORDS`/`AUTHORITY_MENTIONS`/
`NO_LINK_SENDERS`/`REWARD_WORDS` additions, no new composite or field).

**A real gap exists, but not one these proposals need.** The AU "ghost store"
finding (see *Australia*, above) can't be expressed in the current interface
at all: every existing signal scores *message/URL content* (keywords, TLDs,
hostname shape), and the only distinguishing tell reported — "claims to be
an Australian business while not on a `.au`/`.com.au` domain" — is a
site-registration/metadata judgement, not a text pattern. `types.ts` has no
field for that kind of signal, and this roadmap is not proposing one: adding
a domain-registration-eligibility heuristic as a flat rule would be high-FP
by the researcher's own assessment (plenty of legitimate small AU retailers
use generic `.com`/Shopify domains too), so this stays a watchlist item
pending a product decision on whether site-reputation signals are even in
scope for this detector, rather than a pack-interface request.

---

## Region demand signal

Not measurable this cycle. `lib/reportStore.ts`'s `region` column exists and
is written on every report (`storeReport`), but the production libSQL/Turso
database is not reachable from this research environment: no `local.db`
SQLite fallback exists in this checkout, no `.env.local` file is present, and
no `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` environment variables are set.
This is the same finding every prior cycle has recorded. No figures —
including the rest-of-world (`ZZ`) fallback count, which would be the
clearest measure of unmet regional demand — are estimated or invented in its
place.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | AU-D1 re-measured and carried; new "ghost store" watchlist finding (not a keyword fix); thin St.George lead noted, not filed |
| GB | light | NCSC fix confirmed live; Winter Fuel Payment smishing re-checked, already covered; no new finding |
| US | deep | Source of BASE-D1 (routed cross-region); FTC-impersonation lead checked and found already covered (likely_scam 55); post-election follow-up still nothing dated |
| NZ | light | Netsafe update not yet published for this window; several consecutive quiet cycles |
| IE | deep | IE-D1 re-measured and carried; D8 (FCN exact wording) re-attempted, still outstanding |
| CA | light | Source of BASE-D1 (routed cross-region); carrier-upgrade fraud reconfirmed voice-only; French-language gap searched again, nothing concrete |
| FR | light (rotation) | One finding — FR-D1 (ANTAI authority-mention gap) |
| IT | light (rotation) | AdE IRPEF-refund phishing reconfirmed live and recurring; strongest native-review candidate this cycle, not filed |
| JP | light (rotation) | NPA banking-fraud volume figure + NTA impersonation-site surge noted; native-review candidate, not filed |
| KR | light (rotation) | FSS/FSC post-breach smishing alert (2026-10-06) confirms carried item still active; native-review candidate, not filed |
| ID | light (rotation) | OJK/Satgas PASTI volume statistics only; no actionable item |
| AE, BR, DE, ES, IN, KE, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA | skipped | Not in this cycle's weekly or rotation list |

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| AU — AI "ghost store" fake online retailers | **NEEDS PRODUCT DECISION — new** | ACCC + ABA, Black Friday-timed; no safe keyword-level rule identified — see *Pack-interface notes* |
| AU — "Fake St.George Payment Alert" callback scam | **NEEDS PRIMARY SOURCE — new** | Single tier-3 secondary report, ~Sept 2026, unverified; likely already covered by the generic callback/TOAD composite regardless |
| IE D8 — Fixed Charge Notice exact SMS phrasing | **OUTSTANDING, unfiled** | Fourth cycle running; sources confirm the tactic but none quotes the literal lure text or an IOC |
| IE — foreign-country-code (+359/+47) Garda-impersonation numbers | **NEEDS CORROBORATION — new** | Single undated secondary source; not strong enough to propose a phone-pattern signal |
| Glitch (`glitch.me`) as a `SUSPICIOUS_HOSTING` candidate | **RESOLVED — recommend closing** | Glitch's hosting product shut down 8 Jul 2025; abuse reporting predates the shutdown; a Jul 2026 check returns HTTP 410. No live campaign to justify adding it |
| US — post-election "recount"/donation-fraud follow-up scripts | **MONITORING** | Checked again 12 days post-election; still nothing dated found |
| CA — "free phone upgrade" carrier-impersonation fraud | **MONITORING — no text surface** | Reconfirmed purely voice-channel |
| CA — French-language gap keeping `ca.ts` at `partial` | **MONITORING** | Searched again; nothing concrete or datable surfaced |
| IT — AdE IRPEF-refund / Bonus Vacanze phrasing | **NEEDS NATIVE REVIEW** | Reconfirmed live and recurring this cycle — strongest native-review candidate of the five rotation regions |
| KR — post-breach voice-phishing/smishing (FSS/FSC 2026-10-06 alert) | **NEEDS NATIVE REVIEW** | Reconfirmed still active, response period extended to Dec 2026 |
| JP — National Tax Agency impersonation-site surge | **NEEDS NATIVE REVIEW — new** | 6× month-on-month surge reported; one dated, specific data point |
| KE / NG — regulator-named fraudulent platforms in `fakeInvestmentPlatforms` | **NEEDS POLICY DECISION** | Carried, unchanged — whether a `minimal` pack may ever carry a regulator-named-platform list |
| TH — `tcsd.in.th` serves a placeholder page | **PACK HYGIENE** | Carried, unchanged |
| ES — Police/Guardia Civil/INCIBE CSAM-extortion campaign | **NEEDS NATIVE REVIEW** | Carried, unchanged — ES not in this cycle's rotation |
| GB — benign direct-debit confirmation (Octopus Energy) | **PROBE LEAD, possibly resolved** | Carried, not re-measured this cycle |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Carried, unchanged |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| CTV Atlantic (5 Oct 2026); Global News — NS RCMP gold "safekeeping" warning | 1/2 | BASE-D1 |
| Money.ca — RCMP gold-safekeeping scam, $28.6M in 2026 Canadian bank-impersonation losses | 2 | BASE-D1 |
| ConsumerAffairs (11 Nov 2026, cites FBI IC3 $311.8M/2025); Kiplinger | 1 (via secondary)/2 | BASE-D1 |
| An Garda Síochána / FraudSMART reporting (via corksafetyalerts.com, incl. 22 Sep 2025 FCN article) | 1 (primary advisory)/2 (syndication) | IE-D1, IE D8 (carried) |
| ASIC media release (~Aug 2026); Bitdefender — "Top Aussie public figures impersonated in investment scams" (Jan–Apr 2026) | 1/2 | AU-D1 |
| selectra.info; captainverify.com; leocare.eu; 24matins.fr — ANTAI smishing coverage (FR, 2026) | 2/3 | FR-D1 |
| ACCC media release; SmartCompany (31 Aug 2026); The New Daily (10 Nov 2026); Australian Banking Association | 1/2 | AU ghost-store watchlist |
| malwaretips.com — St.George payment-alert callback scam | 3 | AU St.George watchlist |
| SSA consumer alert (1 Nov 2026); Bitdefender (2 Nov 2026) — FTC self-impersonation | 1/2 | US correction (already covered) |
| informazionefiscale.it; open.online (1 Oct 2026); money.it — AdE IRPEF-refund phishing (IT) | 2 | IT native-review watchlist |
| khan.co.kr; tilnote.io — FSS/FSC consumer alert, 2026-10-06 (KR) | 1/2 | KR native-review watchlist |
| pref.yamanashi.jp; NPA 2025 report (via secondary coverage) — banking-fraud figures, NTA impersonation surge (JP) | 1/2 | JP native-review watchlist |
| thejakartapost.com (28 May 2026); ojk.go.id — Satgas PASTI volume figures (ID) | 1/2 | ID (no actionable item) |
| Netskope; Forescout — Glitch hosting shutdown (8 Jul 2025); gridinsoft.com (Jul 2026, HTTP 410 check) | 2 | Glitch watchlist closure |
| iPhoneinCanada; CTV News Edmonton (4 Nov 2026); TELUS (Aug 2026, CAFC-sourced) | 1/2 | CA carrier-upgrade watchlist |
| MoneySupermarket (10 Nov 2026); gov.uk — Winter Fuel Payment scam warnings | 1/2 | GB re-check |

No new sources are proposed for `sources.yml` this cycle.

---

## Issues to open manually

`gh auth status` reports the configured `GH_TOKEN` is invalid, so
`gh issue create` could not run this cycle. The three HIGH-priority proposals
are reproduced below in full for a human to file by hand (checked against the
open-issues list in the three most recent roadmaps first — none overlaps).

### 1. `[threat-intel] BASE — gold "safekeeping" courier scam`

**Body:**

New cross-region finding. FBI IC3 reports $311.8M in gold-courier-scam
losses in the US in 2025 (via ConsumerAffairs, 11 Nov 2026); Nova Scotia RCMP
issued a dedicated warning 5 Oct 2026; Money.ca reports $28.6M in 2026
Canadian bank-impersonation losses tied to the same script family. The
victim is told by a spoofed "police"/"bank fraud team" caller that their
funds are at risk, instructed to withdraw savings and convert to physical
gold, then hand it to a "courier" or "officer" for "safekeeping" — a
gold-specific variant of the courier/safe-account script already partly
covered in `base.ts`.

**Proposed rule** (`packages/detect/src/regions/base.ts`, `REQUEST_WORDS`):
add `"buy gold for safekeeping"`, `"convert your savings to gold"`,
`"convert your money to gold"`, `"gold for safekeeping"`, `"hand the gold
to"`, `"give the gold to the courier"`.

**Measured before (today):**
- `"Please withdraw your savings and convert to gold for safekeeping with our officer."` → **safe 0**
- `"This is Officer Daniels from the fraud department. Your bank account has been compromised. Please withdraw your savings, buy gold, and give the gold to our courier for safekeeping while we investigate."` → **safe 0**

**Acceptance criteria:** both lures earn at least one new `+15` hit,
compounding with other signals a realistic full-length lure carries to clear
`suspicious`.

**FP risk:** LOW — no legitimate bank, police service or fraud unit instructs
a customer to convert savings to gold and hand it to a stranger; phrases are
full imperative forms, not bare "gold."

**Roadmap:** `docs/threat-intel/2026-11-15-threat-roadmap.md`, proposal
BASE-D1.

---

### 2. `[threat-intel] IE — Garda / Fixed Charge Notice no-link-sender gap`

**Body:**

Carried from the 2026-11-08 roadmap (filed there as a MEDIUM proposal, never
issued). Gardaí publicly and repeatedly confirm all correspondence, including
Fixed Charge Notices, comes by post only — never SMS — yet `ie.ts`'s
`NO_LINK_SENDERS` list (`revenue`, `revenue commissioners`, `ros`,
`department of social protection`, `social protection`, `dsp`, `an post`,
`anpost`, `ntma`, `state savings`) omits Gardaí entirely, despite Gardaí
already being in `AUTHORITY_MENTIONS`.

**Proposed rule** (`packages/detect/src/regions/ie.ts`): add `"garda"`,
`"gardai"`, `"an garda siochana"`, `"garda siochana"` to `NO_LINK_SENDERS`;
update `noLinkSendersFlag` copy to cite postal-only correspondence.

**Measured before (today, `IE` region):**
- `"An Garda Siochana: please review your case file here https://garda-files.top"` → **suspicious 40**
- Identical structure naming Revenue instead (already in `NO_LINK_SENDERS`) → **likely_scam 55**

**Acceptance criteria:** the Garda lure reaches **likely_scam 55** once
Gardaí are added, matching the Revenue result exactly.

**FP risk:** LOW.

**Roadmap:** `docs/threat-intel/2026-11-15-threat-roadmap.md`, proposal
IE-D1.

---

### 3. `[threat-intel] AU — fake-news-brand deepfake investment endorsements`

**Body:**

Carried from the 2026-11-08 roadmap (filed there as a MEDIUM proposal, never
issued). ASIC (~Aug 2026) and Bitdefender's Jan–Apr 2026 research (Australia
= 52% of observed global deepfake-investment campaigns, PM Albanese the
most-impersonated figure) describe fake articles and sites carrying real AU
media logos (9News, 7News, ABC News, Sunrise, Today, news.com.au) with
fabricated celebrity/politician endorsements steering readers to fake trading
platforms — the identical "as seen on `<media>`" tactic `nz.ts` already
encodes (`"as seen on rnz"`, `"as featured in nz herald"`, `"as seen on
tvnz"`).

**Proposed rule** (`packages/detect/src/regions/au.ts`, `REWARD_WORDS`): add
`"as seen on abc news"`, `"as featured on 9news"`, `"as seen on 7news"`,
`"as featured in news.com.au"`, `"as seen on sunrise"`, `"as featured on
today show"`.

**Measured before (today, `AU` region):**
- `"BREAKING: As seen on 9News — [name] reveals the AI trading platform making Aussies rich. Guaranteed returns, limited spots."` → **safe 12** ("guaranteed returns" alone)

**Acceptance criteria:** the lure scores an additional hit from the new
phrase, compounding with the existing investment-bait signals.

**FP risk:** LOW — no legitimate advertising or editorial copy describes an
unrelated investment pitch as "as seen on 9News."

**Roadmap:** `docs/threat-intel/2026-11-15-threat-roadmap.md`, proposal
AU-D1.
