# Threat-intelligence roadmap — 2026-10-11

*Sweep period: 2026-10-06 – 2026-10-11 (5 days since the last sweep, which ran
by hand on 2026-10-06 after the scheduled 2026-10-04 run was rate-limited).
Next sweep due on or around 2026-10-18.*

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index)\.ts$' | wc -l`
→ **27 region packs**, unchanged from 2026-10-06. `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly** AU GB US NZ CA IE, **rotation** AE BR ES FR ID.

**Everything the 2026-10-06 roadmap proposed has already shipped.** `git log`
on `packages/detect/src/` since that file landed (`560d5ec`) shows:

| Commit | Ships |
|---|---|
| `8f1ec11` (#433) | D1 AUSTRAC impersonation + D2 agency→WhatsApp/Telegram hand-off (AU), including the new `authorityMessagingAppFlag` pack field |
| `80f2761` (#434) | D4 scam-coaching phrases (base) + D6 US "money laundering case" wording |
| `a590e2b` (#435) | D5 recovered-funds-release-fee composite (base) |
| `1cb4d03` (#436) | D7 NCSC NZ impersonation |
| `b1c3b5f` (#440) | D9 NZ reporting-body copy fix (CERT NZ → NCSC) |
| `04dbf6f` (#441) | Three unrelated NLP-assessment items (confusables, language ID, stemmer) — not a threat-intel proposal |

Only **D3** (AU `netbank` typosquat, MEDIUM) and **D8** (IE Fixed Charge
Notice phrasing, MEDIUM) remain outstanding from that cycle — both were below
the HIGH-only issue-filing bar and were left for human triage. Read the
2026-10-06 file in full, plus the AU/IE sections of 2026-09-27, before
researching below so nothing already covered is re-proposed.

I read `types.ts` and `base.ts` in full, `scamDetector.ts` and `phoneIntel.ts`
in full (via a structured inventory pass — see commit for the full
function/line index), and the six `full`/`partial` packs (au/gb/us/nz/ie/ca)
plus this cycle's rotation packs (ae/br/es/fr/id) in full.

---

## Executive summary

**A quiet cycle for the `full`-coverage regions.** Five days is a short
window, the previous sweep (2026-10-06) was unusually productive, and every
one of its proposals has already shipped. Deliberate, repeated search across
AU, GB, US, NZ, IE and CA this cycle found nothing both new and un-covered —
several promising-looking leads turned out to be stale when checked for a
date (see *Corrections*, below). That is a real result, not a shortfall: the
instruction to keep a quiet week short rather than invent threats is followed
here.

The one actionable finding is in this cycle's `minimal`-tier rotation:

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | D1 — AE: agency moves contact to WhatsApp/Telegram | `regions/ae.ts` | **unknown 10** / **unknown 0** | Dubai Police eCrime Hub (16 Jul 2026): government-impersonation scams routinely move the victim onto WhatsApp; the pack field this needs (`authorityMessagingAppFlag`) already exists and already has one adopter (AU, shipped 2026-10-06) — AE just needs the value set |

D3 and D8 from 2026-10-06 are carried forward unchanged below — this cycle's
research did not turn up new evidence for either, so neither is promoted.

**Region demand:** not measurable from this environment — no production
database credentials are configured here. See §Region demand signal.

---

## Corrections — leads that did not hold up on a date check

Recorded per the archive's own discipline: a lead is only worth citing once
its *date* is checked, not just its keyword match.

- **AU "NetBank will stop working if you don't click here" (ACM wire story,
  story ID 7971721, syndicated across Canberra Times/The Senior/Wellington
  Times/Port News/etc.)** — this looked like fresh corroboration for the
  outstanding D3 `netbank` typosquat gap. A follow-up search for the figures
  quoted inside it ("nbn impersonation... 4,386 customers from January to
  September") dates the piece to **2022**, not 2026. It is not used as
  evidence here, and D3 is not promoted on the strength of it. (D3 itself —
  the underlying gap — is unaffected by this correction; see below.)
- **"ATO issues fresh scam warning over fake myGov messages" (The Mandarin,
  story ID 228088)** — the same myGov/ATO impersonation pattern has been
  reported continuously since at least 2021 (Accountants Daily, ATO's own
  2021 media release) and was already measured as covered (`likely_scam 65`)
  in the 2026-10-06 roadmap. No new wording found.
- **FIFA World Cup 2026 quishing surge (FortiGuard, >13,000 domains
  Jan–May 2026)** — real, but the tournament (US/Canada/Mexico, Jun–Jul 2026)
  has already concluded; the lure window it describes has passed.

---

## Threats by region

### Australia (`full`)

No genuinely new, uncovered tactic found this cycle. Searched: Scamwatch/NASC
news, ACSC/cyber.gov.au advisories, ATO/myGov impersonation, Australia Post
parcel scams, and CommBank/ANZ/NAB/Westpac alerts. Everything that surfaced
was either already shipped (AUSTRAC, WhatsApp hand-off, scam coaching — all
2026-10-06), already covered by existing rules (ATO/myGov, Australia Post
delivery lures), or dated earlier than this cycle's window once checked (see
*Corrections*).

**D3 (carried forward, unchanged, MEDIUM)** — the `netbank` word-brand gap
from 2026-10-06 is still real and still unfiled:

| URL | Verdict |
|---|---|
| `https://netbank-giveaway.com/enter` | **safe 0** |
| `https://netbank-verify-au.com/login` | **safe 10** (login/verify keyword only) |

No new evidence this cycle; not re-researched beyond the live-engine check
above (same figures 2026-10-06 reported). Left for human triage as before.

Sources: [Scamwatch — browse news and alerts](https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts) (Tier 1); [ATO — scam alerts](https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts) (Tier 1); [CommBank — latest scams and security alerts](https://www.commbank.com.au/support/security/latest-scams-and-security-alerts.html) (Tier 1, own brand).

### United Kingdom (`full`)

Quiet. Searched Action Fraud, NCSC, HMRC/DVLA/Royal Mail impersonation. The
DVLA email-impersonation report-volume figures circulating this week
(Bridewell analysis of Citizens Advice/FOI data) describe a record *year*,
not a new *tactic* — DVLA vehicle-tax phrasing has been in `URGENCY_TOLL`
since 2025-09-13 (#310). Royal Mail redelivery-fee texts and HMRC
AI-voice-call reports are the same patterns already covered by the
small-fee-payment composite and the general robocall/urgency signals
respectively; neither has a new SMS/email text shape to add. No proposal.

Sources: [Bridewell — the most impersonated organisations in phishing scams](https://www.bridewell.com/insights/blogs/detail/the-most-impersonated-organisations-in-phishing-scams) (Tier 2).

### United States (`full`)

Quiet. Searched FTC consumer alerts, CISA advisories, IRS/USPS/SSA
impersonation. FTC's own warning about scammers impersonating *FTC staff* is
already covered — `"ftc"`/`"federal trade commission"` are in `us.ts`
`AUTHORITY_MENTIONS` (reportingBody is the FTC itself, so this is the
self-referential case, and it already scores via the authority-mention
corroboration rule). IRS/fake-refund and credit-repair-fraud items have no
new wording. No proposal.

Sources: [FTC — consumer alerts](https://consumer.ftc.gov/) (Tier 1).

### New Zealand (`full`)

Quiet. Netsafe's 1 September bank-impersonation statistic (34% of
impersonation reports in August) is the same figure the 2026-10-06 roadmap
already cited and acted on (NZ-1/D7 shipped). No newer Netsafe or NCSC
alert found this cycle. No proposal.

Sources: [NCSC NZ — alerts](https://www.ncsc.govt.nz/alerts/) (Tier 1); [Netsafe — scams update](https://www.netsafe.org.nz/) (Tier 2).

### Ireland (`full`)

**D8 (carried forward, unchanged, MEDIUM)** — the Fixed Charge Notice
phrasing gap from 2026-10-06 is still unfiled and no new Garda/FraudSMART
advisory surfaced this cycle beyond the April 2026 phone/broadband warning
(already superseded by the FCN finding). Left for human triage as before.

Sources: [FraudSMART — alerts](https://www.fraudsmart.ie/alerts/) (Tier 2).

### Canada (`partial`)

Light touch. CAFC's standing impersonation/recovery-fraud warning (last
updated 3 Jul 2026) is the same advisory 2026-10-06 already routed to the
base recovery-fraud composite (now shipped, `a590e2b`). No CA-specific
proposal.

Sources: [CAFC — impersonation fraud advisory](https://antifraudcentre-centreantifraude.ca/) (Tier 1).

---

### This cycle's rotation (`minimal` coverage)

#### AE — United Arab Emirates → **D1**

Dubai Police's eCrime Hub, reported 16 July 2026: government-impersonation
scams work by moving victims onto **WhatsApp, calls or email** under
manufactured urgency, with a typical lure being an SMS claiming to be from a
Dubai government department demanding Emirates ID confirmation "or face
legal action." `ae.ts` already lists `"dubai police"`, `"abu dhabi police"`,
`"federal tax authority"` and seven other authorities, and the pack's
language mix (`["ar", "en"]`) means English-language lures are squarely in
scope — unlike the multilingual-only `minimal` packs below, this is not a
translation-judgement question.

The mechanism this needs — authority mention + "contact/message/chat us on
WhatsApp/Telegram" → +30 — **already exists** in `scamDetector.ts`
(shipped for AU on 2026-10-06, `8f1ec11`) and is opt-in per pack via
`authorityMessagingAppFlag` (`types.ts`). AE simply has not set it:

| Lure | Verdict |
|---|---|
| "Dubai Government notice: confirm your Emirates ID within 24 hours or face legal action. Contact our officer on WhatsApp +971 50 123 4567." | **unknown 10** (urgency only) |
| "This is Dubai Police. Your case is under review. Please message us on WhatsApp to continue, or you will be fined." | **unknown 0** ("names a government agency, nothing else unusual") |

No interface change needed — this is a one-line pack-data addition, the same
shape as AU's.

Source: [Emirates 24/7 — how to spot government impersonation scams in Dubai](https://www.emirates247.com/uae-guide/how-to-spot-government-impersonation-scams-in-dubai-dubai-police-shares-warning-signs/3686) (Tier 2, reporting a Dubai Police eCrime Hub statement; the primary eCrime.ae source is geo-fenced from this environment — see `sources.yml`).

#### BR, ES, FR, ID — checked, no proposal

All four already name the relevant agencies at `minimal` depth:
`br.ts` has `"correios"` (the customs-SMS lure reported this cycle by
Diário do Pará), `es.ts` has `"seguridad social"` and `"agencia tributaria"`
(INCIBE's August 2026 smishing alerts, INCIBE-2026-566 and the AEAT-fine
variant), `fr.ts` has `"dgfip"` (the "remboursement" tax-refund SMS reported
this cycle), and `id.ts` has `"ojk"` (investment-fraud reports from
Purwokerto, June 2026). In every case the *agency* is already covered; what
is missing is the *phrase*, in the local language, and authoring that is
exactly the researched judgement the `minimal` tier is designed to exclude —
the same reasoning `in.ts` already documents for India's "digital arrest"
scam and the same gate that blocks the CA French-keyword item. Watchlisted
below rather than proposed, for a native-reviewer pass rather than a
machine-translated phrase list.

Sources: [INCIBE — avisos de seguridad](https://www.incibe.es/ciudadania/avisos) (Tier 1); other citations above are Tier 2/3 press summaries of these official alerts, not used to source a phrase directly.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Six-plus searches (Scamwatch, ACSC, ATO/myGov, Australia Post, four banks); nothing new, two leads corrected as stale |
| GB | deep | Action Fraud, NCSC, HMRC/DVLA/Royal Mail; quiet |
| US | deep | FTC, CISA, IRS/USPS/SSA; quiet |
| NZ | deep | NCSC, Netsafe; quiet, same stat as 2026-10-06 |
| IE | deep | Garda/FraudSMART; quiet, D8 carried forward |
| CA | light | CAFC; routed to already-shipped base composite |
| AE | deep | New finding (D1) |
| BR | light | Agency already covered; language gap noted |
| ES | light | Agency already covered; language gap noted |
| FR | light | Agency already covered; language gap noted |
| ID | light | Agency already covered; language gap noted |
| DE, IN, KE, SG | skipped | Researched 2026-10-06, not due this cycle |
| IT, JP, KR, MX, NG, NL, PH, PL, SE, TH, VN, ZA | skipped | Not in this cycle's rotation plan |

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| D1 | AE: agency moves contact to WhatsApp/Telegram | Set `authorityMessagingAppFlag` on the `AE` pack (same mechanism as AU) | `regions/ae.ts` | AE | LOW | **HIGH** |

### Proposed copy

**D1** — `ae.ts`:

```ts
authorityMessagingAppFlag:
  "Claims to be from a UAE government department and asks you to continue on WhatsApp — Dubai Police's eCrime Hub says impersonation scams work by moving you onto WhatsApp, calls or email under false urgency. Verify through the official app or website instead, and report it via ecrime.ae.",
```

FP note: the mechanism is unchanged from AU's shipped version — it fires only
on an *authority mention* (one of AE's eleven named agencies) combined with
an explicit instruction to continue on WhatsApp/Telegram, so an ordinary
message that happens to name a UAE agency and separately mention WhatsApp
(e.g. "I saw on Dubai Police's Instagram... message me on WhatsApp") does not
compound unless both halves of the same regex clause are present. Same
trade-off already accepted for AU.

**D3 and D8** (both carried forward from 2026-10-06, unchanged) remain
outstanding — see the AU and IE sections above for current measurements.
Neither is re-filed here; both were already written up in full in the prior
roadmap for a human to triage.

---

## Pack-interface notes

None this cycle. D1 uses a field (`authorityMessagingAppFlag`) that already
exists on `RegionDefinition` and already has a shipped reference
implementation (AU) to follow.

---

## Region demand signal

`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are not set in this environment, so
`scripts/region-demand.ts` could not run against production — unchanged from
2026-10-06. The local `local.db` is the development fallback only and was not
read; no figures are estimated or reported.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| AU D3 — `netbank` typosquat gap | **OUTSTANDING, unfiled** | Carried from 2026-10-06; no new evidence this cycle (the apparent new corroboration was a 2022 article — see Corrections). Still real, still MEDIUM, still needs human triage. |
| IE D8 — Fixed Charge Notice phrasing | **OUTSTANDING, unfiled** | Carried from 2026-10-06; no new evidence this cycle. |
| ES — Seguridad Social / Agencia Tributaria smishing phrases | **NEEDS NATIVE REVIEW — new** | INCIBE-2026-566 (19 Aug 2026) and related alerts name specific Spanish phrasing ("actualización pendiente", fine + DNI-photo upload) not yet authored. Same gate as the CA French-keyword item: `es.ts` is `minimal` by design and the tier excludes phrase-level authoring without a native reviewer. |
| FR — DGFiP "remboursement" SMS phrasing | **NEEDS NATIVE REVIEW — new** | Same gate, French. |
| BR — Correios customs-SMS phrasing | **NEEDS NATIVE REVIEW — new** | Same gate, Portuguese. |
| ID — OJK investment-fraud phrasing | **DEFERRED** | Same reasoning `in.ts` already documents for India; an active OJK posko/enforcement case (Purwokerto, Jun 2026) doesn't change it. |
| Authority + messaging-app hand-off for GB/IE/NZ | **MONITORING** | Unchanged from 2026-10-06 — AU and now AE are the only adopters; each other region needs its own evidence before the flag is set. |
| "Was this you?" bank-transfer texts with no link (PTSB, ANZ NZ) | **DEFERRED** | Unchanged from 2026-10-06. |
| Bank brand in ad/giveaway text (CommBank car draw) | **DEFERRED** | Unchanged from 2026-10-06. |
| "Hi Mum" / "Hi Dad" first-contact opener | **DEFERRED** | Still no distinct new SMS opener pattern found. |
| India "digital arrest" scam | **DEFERRED** | `in.ts` multilingual reasoning still holds. |
| JWR / Phoenix PhaaS kits (Smishing Triad) | **MONITORING** | No new theme beyond 2026-10-06. |
| myGov multi-benefit compound scoring (AU) | **WATCHLIST** | Unchanged since 2026-09-25. |
| LINE/KakaoTalk recruitment funnels | **DEFERRED** | Insufficient evidence; FP risk too high. |
| CA French-keyword gap | **BLOCKED** | Pending native reviewer. |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle. |
| FIFA World Cup 2026 quishing surge | **CLOSED — window passed** | Tournament concluded; the lure window FortiGuard described (Jan–May 2026 domain registrations) is over. Not re-opened unless a similar seasonal event approaches. |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Scamwatch — browse news and alerts | 1 | AU coverage check |
| ATO — scam alerts | 1 | AU coverage check |
| CommBank — latest scams and security alerts | 1 (own brand) | AU coverage check |
| Bridewell — most impersonated organisations in phishing scams | 2 | GB coverage check |
| FTC — consumer alerts | 1 | US coverage check |
| NCSC NZ — alerts | 1 | NZ coverage check |
| Netsafe — scams update | 2 | NZ coverage check |
| FraudSMART — alerts | 2 | IE coverage check |
| CAFC — impersonation fraud advisory | 1 | CA coverage check |
| Emirates 24/7 — government impersonation scams in Dubai (reporting Dubai Police eCrime Hub, 16 Jul 2026) | 2 | AE-1/D1 |
| INCIBE — avisos de seguridad | 1 | ES watchlist |
| ACM wire story #7971721 ("NetBank will stop working...") | — | **Not used as evidence** — dated to 2022 on verification; recorded under Corrections only |
| The Mandarin #228088 (ATO/myGov scam warning) | — | **Not used as evidence** — pattern already covered since 2021/2026-10-06; recorded under Corrections only |

`emirates247.com` was added to `sources.yml` (tier 2) in this PR, noting that
the primary source (`ecrime.ae`, already tier 1) is geo-fenced from this
research environment.

---

## Issues opened

| ID | Issue | Priority |
|---|---|---|
| D1 | [#445 — AE: agency moves contact to WhatsApp/Telegram](https://github.com/alekslinde/veriguard/issues/445) | HIGH |

D3 and D8 (both MEDIUM, both carried forward from 2026-10-06) are not filed,
per the HIGH-only threshold — their full detail is in the AU and IE sections
above for a human to triage.
