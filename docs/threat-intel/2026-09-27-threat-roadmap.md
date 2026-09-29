# Threat-intelligence roadmap — 2026-09-27

*Sweep period: 2026-09-14 – 2026-09-27 (covers the gap since the last MERGED sweep,
2026-09-13; a 2026-09-25 sweep was run but its docs PR was never merged — see the
provenance note below). Next sweep due on or around 2026-10-04.*

---

## Provenance note: a second missing-docs-PR incident

Before this cycle's research: `git log --all` shows a `feat/threat-intel-2026-09-25`
detector PR (#358) merged to `main` on 2026-09-25, containing three shipped rules
(AU Centrelink/Medicare "payments will be suspended" lure, a BASE voice-clone
post-call phrase set, and an AiTM OAuth2-path heuristic in `checkUrl()`). Its
companion docs PR was **closed unmerged**, so `docs/threat-intel/2026-09-25-threat-roadmap.md`
never reached `main` — exactly the failure the archive README's "Known gaps"
section already records for 2026-07-05 and 2026-07-12: *"the code shipped, the
research was treated as disposable once it had served its purpose, and the
provenance was lost."*

The file survived on `origin/threat-intel/2026-09-25` (commit `cd86652`). I have
recovered it verbatim into this PR as `docs/threat-intel/2026-09-25-threat-roadmap.md`,
added its Status block (all three proposals shipped, per PR #358), and updated
`2026-09-13-threat-roadmap.md`'s own Status block (its three proposals also shipped,
in PRs #309/#312/#313). All three of that cycle's rules are treated as **already
implemented** below and are not re-proposed.

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/engine/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index)\.ts$' | wc -l` → **27 region packs.**
`grep -H 'coverage:' packages/engine/src/regions/*.ts`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | rest-of-world.ts fallback |

Full read of `types.ts`, `base.ts`, `scamDetector.ts` (all ~3,400 lines),
`phoneIntel.ts`, and the five `full`-coverage packs plus `ca.ts`. Skimmed every
`minimal` pack's `AUTHORITY_MENTIONS` block. Read `docs/threat-intel/README.md`
in full and the three most recent roadmaps (2026-09-13, 2026-09-06, plus the
recovered 2026-09-25) including their watchlists, so deferred items below are
promoted or re-deferred on their own terms rather than re-investigated from
scratch.

---

## Executive summary

A genuinely quiet cycle for country-specific text signals — AU, GB, US, NZ and
IE all have their currently-active campaigns already covered by rules shipped
in this or the previous two cycles. The one real finding routes to **CA**
(`partial` coverage), and the one cross-regional finding routes to **BASE**.

| Rank | Proposal | Pack | Why first |
|---|---|---|---|
| 1 | D1 — CA: RCMP "undelivered court documents" SMS lure | CA (`ca.ts`) | Active, RCMP/CAFC-confirmed campaign with no current text-side signal; mirrors the already-shipped US jury-duty precedent; LOW FP |
| 2 | D2 — BASE: "new secure message" notification-hook phrase | `base.ts` | Closes a real blind spot (bland, urgency-free phishing hooks) with a single low-cost phrase, at the same risk tier as existing `URGENCY_GENERIC` siblings |
| 3 | D3 — GB: DVLA "vehicle clamping" threat phrasing | `gb.ts` | Sharpens an already-suspicious signal; optional, not a gap |

**No new pack-interface fields needed** for D1–D3. A fourth item (a
notification-style phishing composite, see below) would need one — recorded
under Pack-interface notes rather than proposed, because the phrase-only fix
(D2) already closes most of the practical gap at far lower risk.

**Region demand:** Turso is unreachable from this cloud sandbox, as in every
prior cycle — see §Region demand signal.

---

## Threats by region

### Australia (primary)

**Quiet cycle — no AU-specific gap.** Checked against Scamwatch's current
alert list and the ACSC September advisories:

- **Food-delivery platform scams** (DoorDash/Uber Eats impersonation,
  Scamwatch) — covered by `au.ts BRAND_MENTIONS`/`TYPOSQUAT_BRANDS` and the
  OTP-forwarding composite shipped 2026-08-31. No gap.
- **"You didn't buy this — call to reverse the payment" SMS** (Scamwatch) —
  the generic "asks you to call a number" rule in `checkSms` plus brand/
  authority signals already reach `suspicious`; this is the SMS-shaped sibling
  of the email TOAD composite in `checkEmail`. No gap.
- **ATO/myGov tax-time impersonation reminder** (Scamwatch/ATO, recurring
  annual advisory) — fully covered by existing `AUTHORITY_MENTIONS`,
  `NO_LINK_SENDERS` and `URGENCY_TAX`. No gap.
- **Recruiter impersonation (Amazon/YouTube)** and **crypto "stock tips
  group" recruitment** — both already covered (confirmed again this cycle;
  see the 2026-09-06 and 2026-08-23 roadmaps). No gap.
- **ACSC advisories this cycle** (North Korean IT-worker fake-job campaign,
  18 Sep 2026; an AI-misalignment guidance alert, 24 Sep 2026) — neither is a
  consumer-facing scam pattern detectable from submitted text; the fake-job
  angle is a state-actor hiring-pipeline compromise, not a phishing SMS/email
  a member of the public would paste into this app. No proposal.
- **New finding, routed to BASE, not AU**: a MailGuard-documented myGov
  "Secure Message" phishing campaign (18 Sep 2026) uses a bland,
  urgency-free "you have a new secure message" notification hook instead of
  any threat language. The *wrapper* (a content-free "you have a message,
  view it here" hook) is country-independent bait — every region's users get
  this shape of notification from banks, telcos and government portals alike
  — so it is proposed at `base.ts`, not `au.ts`. See **D2** below and the
  Australia entry doesn't carry its own AU-specific phrase for the same
  reason `mygov`/`ato` region-specific naming already lives in
  `AUTHORITY_MENTIONS`.

Source: [Scamwatch — browse news and alerts](https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts) (Tier 1); [MailGuard — fake myGov "Secure Message" phishing scam](https://www.mailguard.com.au/blog/fake-mygov-secure-message-phishing-scam-targets-australians-with-multi-step-identity-harvesting-flow) (Tier 2, 18 Sep 2026); [cyber.gov.au alerts and advisories](https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories) (Tier 1).

---

### United Kingdom

**Quiet cycle.** DVLA payment-failure phrasing (shipped 2026-09-13, PR #312)
and the existing DVLA/Royal Mail/TV Licensing authority + no-link-sender
signals already carry the currently-reported campaigns to `suspicious` or
above:

- **TV Licensing phishing surge** — Action Fraud logged over 6,000 reports in
  a fortnight in August 2026. `gb.ts` already lists `"tv licensing"`/`"tv
  licence"` in both `AUTHORITY_MENTIONS` and `NO_LINK_SENDERS`, so a link
  alongside the name already scores. No gap.
- **Royal Mail customs-duty email** — `"customs fee"` is already in
  `URGENCY_PARCEL` and Royal Mail is a `NO_LINK_SENDERS` entry. No gap.
- **DVLA "£1,000 fine and vehicle clamping" variant** — see **D3** below: a
  sharpening candidate, not a gap. `"dvla"` (+25) plus the already-shipped
  `"vehicle tax payment has failed"` (+10) reaches 35/`suspicious` without any
  link; the specific clamping threat only makes the existing signal more
  legible to the reader, it does not change which verdict tier the message
  lands in.

Source: [DVLA vehicle tax scam — SafeBrowz](https://safebrowz.com/blog/dvla-vehicle-tax-scam-uk) (Tier 3, corroborating the Tier 1 DVLA/gov.uk advisory already cited in the 2026-09-13 roadmap); [Which? — latest scam alerts](https://www.which.co.uk/news/article/the-latest-scam-alerts-from-which-aBRLy2b02WkC) (Tier 2); [Your Local Computer Guy — UK scam alerts, August 2026](https://yourlocalcomputerguy.co.uk/blog/uk-scam-alerts-august-2026.html) (Tier 3).

---

### United States

**Quiet cycle.** FEMA impersonation shipped 2026-09-13 (PR #309). No new
FTC/CISA consumer-scam alert this cycle names a text-side pattern outside
existing coverage — the FTC's most recent alerts (farm-equipment fraud,
non-consensual intimate imagery, and a reiterated parking-meter QR warning)
are either outside this app's scope (B2B equipment fraud) or already
recorded as an education, not a detection, gap (see the physical-QR
quishing watchlist item, carried forward unchanged below).

Source: [FTC Consumer Alerts](https://consumer.ftc.gov/consumer-alerts) (Tier 1).

---

### New Zealand

**Quiet cycle, volume signal only.** Netsafe reported bank-impersonation
scam reports rising from 21 (July) to 46 (August 2026), with bank/financial
impersonation now 34% of "pretending to be someone else" reports (up from
20% in the prior period). This is a *volume* shift, not a new lure phrase —
`nz.ts` already carries the full NZ bank set (`kiwibank`, `westpac`, `bnz`,
`asb`, `anz`, …) in both `TYPOSQUAT_BRANDS`/`TYPOSQUAT_WORD_BRANDS` and
`BRAND_MENTIONS`/`BRAND_MENTION_WORDS`. No distinct phrasing was reported
alongside the volume increase (Netsafe's own advice is generic: "hang up,
delete the message, contact your bank on a trusted number"). No proposal.

Source: [NZ Herald — Netsafe reports surge in bank impersonation scams in August](https://www.nzherald.co.nz/business/netsafe-reports-surge-in-bank-impersonation-scams-in-august/ZPNH4U3RMVBWDATXLY3W3TUQGE/) (Tier 2).

---

### Ireland

**Quiet cycle.** The seasonal An Garda Síochána CAO-offers student-accommodation
warning (absent-landlord deposit fraud) recurs annually and is already fully
covered by the `base.ts` rental-fraud phrases shipped from the 2026-08-16
sweep (`"landlord is abroad"`, `"pay deposit to hold the property"`, etc. —
sourced from the same An Garda advisory series last year). The parallel
money-mule recruitment warning to students is likewise already covered by
`base.ts REQUEST_WORDS` (`"money mule"`, `"financial courier"`, shipped
2026-09-06). No new phrasing surfaced this cycle. No proposal.

Source: [Roscommon Herald — Gardaí issue student fraud warning ahead of CAO offers](https://www.roscommonherald.ie/news/gardai-issue-student-fraud-warning-ahead-of-cao-offers_arid-109336.html) (Tier 3, corroborating the Tier 1 An Garda/FraudSMART advisories already cited).

---

### Canada (`partial` coverage)

#### CA-1 — RCMP "undelivered court documents" SMS lure → **D1**

An ongoing, RCMP- and Canadian Anti-Fraud Centre–confirmed smishing campaign
sends unsolicited texts claiming the RCMP was unable to deliver court
documents and telling the recipient to "reschedule" via a link to avoid
missing a court date. First warned about in January 2025, it is still being
actively re-issued by detachments across Canada through 2026 (Alberta
reporting the "court documents" variant as a distinct evolution from the
original "delivery notice" wording).

**Coverage check:** `ca.ts AUTHORITY_MENTIONS` already lists `"rcmp"` and
`"royal canadian mounted police"` (+25 via the deferred authority-mention
rule, corroborated once the link scores). `ca.ts URGENCY_FOREIGN_AUTHORITY`
has no phrase for a court-document delivery failure — grepped, confirmed
absent from `packages/engine/src/`. A message reading *"RCMP: we were unable
to deliver your court documents. Reschedule to avoid missing your court
date: [link]"* currently scores authority (+25, corroborated by the link) +
link (+15) = 40 (`suspicious`); adding the phrase below pushes it to 50
(`likely_scam`) — a real verdict-tier change, not padding on an
already-correct answer.

**Proposed addition**, to `URGENCY_FOREIGN_AUTHORITY` in
`packages/engine/src/regions/ca.ts` (same array the US pack uses for its
already-shipped jury-duty phrases — this is the direct CA analogue):

```
"unable to deliver your court documents",
"court documents could not be delivered",
"reschedule your court documents delivery",
"missed your court date",
"avoid missing your court date",
```

**FP risk: LOW.** The RCMP does not issue notices by text message at all
(its own published guidance), and real Canadian court process is served in
person or by registered mail, never rescheduled by SMS link. No legitimate
consumer SMS uses this phrasing.

**Priority: HIGH.**

Sources: [Nunatsiaq News — Got a text from RCMP about 'missing' a court date? Don't click the link](https://nunatsiaq.com/stories/article/got-a-text-from-rcmp-about-missing-a-court-date-dont-click-the-link/) (Tier 2); [DiscoverAirdrie — these phony RCMP texts may be in Alberta, now about court documents](https://www.discoverairdrie.com/articles/these-phony-rcmp-texts-may-be-in-alberta-now-about-court-documents) (Tier 3); [RCMP — Warning: phishing scam impersonating the RCMP](https://rcmp.ca/en/news/2025/01/warning-phishing-scam-impersonating-rcmp) (Tier 1, the original advisory this variant evolved from).

**No other CA proposals this cycle.** The CRA/CAFC recovery-fraud and
investment-impersonation signals remain covered by existing rules (per
2026-09-13); the French-keyword gap remains **BLOCKED** pending a native
reviewer, carried forward unchanged.

---

### Cross-regional (BASE)

#### BASE-1 — "new secure message" notification-hook phrase → **D2**

The MailGuard-documented myGov campaign (Australia, 18 Sep 2026 — see the AU
section above) opens with a deliberately bland, urgency-free hook: "You have
(1) New Message. 1 new secure message(s) waiting for you." No threat, no
deadline, no request — just a claimed notification and a "View Message"
link. This *wrapper* is not Australian: banks, telcos and government portals
everywhere send genuine "you have a secure message" notifications, which is
exactly why it works as bait, and exactly why the impersonated agency's own
name (routed through each region's `AUTHORITY_MENTIONS`) is what actually
identifies *which* scam it is — the hook itself is common infrastructure.

**Coverage check:** `base.ts URGENCY_GENERIC` has no phrase for a bare
notification hook — grepped `"secure message"`, `"new message"`, `"inbox"`
across `packages/engine/src/`, no matches. Where the impersonated agency's
name IS present as text (not just as a logo image) alongside a link, the
existing deferred-authority-mention rule already reaches `suspicious` (see
the AU section's worked score: 25 authority + 15 link = 40). The gap is
narrower than "this whole campaign is undetected" — it is specifically the
variant where no agency or brand name appears anywhere in the *text* (only
in visual branding the engine never sees), which today scores only the bare
link (+15, `safe`).

**Proposed addition**, to `URGENCY_GENERIC` in `packages/engine/src/regions/base.ts`:

```
"new secure message",
```

Deliberately a single phrase, not a family. `"you have a new message"` /
`"new message waiting"` were considered and dropped: both are extremely
common wording from legitimate messaging, dating and professional-network
apps, and would carry meaningfully higher FP than the rest of
`URGENCY_GENERIC`. `"new secure message"` is narrower — "secure message" is
specifically financial/government-portal register — while still catching
the documented lure ("1 new secure message(s) waiting" contains it as a
substring, matched by the existing `mentions()` substring rule).

**FP risk: MEDIUM.** Genuine bank and government secure-messaging systems do
use "secure message" in real notifications, so this will fire on legitimate
mail. It is scored at the standard `URGENCY_GENERIC` weight (+10 per hit,
capped at +35 for the group) — the same ceiling as existing generic-sounding
siblings already in the list (`"security alert"`, `"unusual activity"`), so
a lone hit cannot move a verdict on its own; it only matters compounding
with a link, an authority mention, or another signal, which is the same
risk profile the list already carries at this weight.

**Priority: MEDIUM** (real, evidenced, correctly routed — but a single
phrase at a deliberately capped weight, not a new detection capability by
itself).

Sources: [MailGuard — fake myGov "Secure Message" phishing scam](https://www.mailguard.com.au/blog/fake-mygov-secure-message-phishing-scam-targets-australians-with-multi-step-identity-harvesting-flow) (Tier 2, 18 Sep 2026); [pcrisk.com — MyGov Secure Message Email Scam](https://www.pcrisk.com/removal-guides/26711-mygov-secure-message-email-scam) (Tier 3, corroborating).

#### BASE-2 — AI voice-clone and AiTM trends: already covered, context only

2026 industry reporting (Vectra AI, StationX, SafeBrowz) puts voice-clone
vishing volume and realism sharply up — 3 seconds of audio now suffices for
an 85%-accuracy clone, and deepfake fraud has grown from 0.1% to 6.5% of all
fraud attempts since 2022. None of this introduces new *consumer-facing
text* beyond what `base.ts URGENCY_VOICE_CLONE`'s post-call pressure phrases
(shipped 2026-09-25, issue #356) already cover — the reporting is about
call-audio quality and scale, not new SMS/email wording. No proposal;
recorded as corroborating context for the existing signal.

#### BASE-3 — Physical QR "quishing" and PhaaS infrastructure: unchanged watchlist items

The FTC repeated its parking-meter QR-sticker warning on 23 Sep 2026— the
same **education, not detection, gap** identified in the 2026-09-25 sweep: a
victim who scans a physical sticker and pastes the resulting URL gets
`checkUrl()`'s existing TLD/hosting/domain analysis; there is no additional
text-side signal to add, since the attack has no text component before the
link itself. Carried forward unchanged (see Watchlist). Separately,
continued Smishing Triad / PhaaS reporting (toll and parcel smishing at
scale, ongoing TLD rotation) surfaced no *specific new TLD name* this cycle
beyond what `base.ts SUSPICIOUS_TLDS` already lists — monitoring only.

Sources: [Vectra AI — AI scams in 2026](https://www.vectra.ai/topics/ai-scams) (Tier 2); [FTC — QR code parking-meter scam](https://consumer.ftc.gov/consumer-alerts) (Tier 1); [Infosecurity Magazine — Smishing Triad fuels surge in toll payment scams](https://www.infosecurity-magazine.com/news/smishing-triad-toll-payment-scams/) (Tier 2).

---

### Other regions (`minimal` coverage) — light-touch pass

**India — "digital arrest" scam, correctly still deferred.** India's CBI ran
a nationwide crackdown (89 locations, 20 states, early Sep 2026) on "digital
arrest" fraud — fake video-call "arrests" by scammers posing as police/CBI,
using AI-generated police-station backdrops, demanding money or remote
access under threat of a fabricated arrest. `in.ts` already documents why
this is deliberately NOT keyworded at `minimal` tier: *"its distinguishing
phrasing is exactly the researched judgement this tier excludes, and it runs
in several languages."* The new enforcement action is evidence the threat is
active, not evidence that changes the multilingual-coverage reasoning — the
deferral stands. No proposal; carried forward on the watchlist.

**All other `minimal` regions (AE, BR, DE, ES, FR, ID, IT, JP, KE, KR, MX,
NG, NL, PH, PL, SE, SG, TH, VN, ZA):** the light-touch pass this cycle found
no region-specific evidence distinct enough to search and verify within this
cycle's time budget beyond what the `full`- and `partial`-coverage regions
above already absorbed (the base-routed BASE-1/BASE-2/BASE-3 findings apply
to every minimal region automatically, since they inherit `base.ts`). No
proposals; not further searched this cycle so as not to shortchange the
CA/BASE research that produced this cycle's only real findings.

Source: [Lowy Institute — India's digital arrest scams](https://www.lowyinstitute.org/the-interpreter/india-s-digital-arrest-scams) (Tier 2); [Digital Watch Observatory — CBI nationwide crackdown](https://dig.watch/updates/india-cbi-nationwide-crackdown) (Tier 2).

---

## Proposed detection improvements

| ID | Tactic | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|
| D1 | RCMP "undelivered court documents" SMS lure | `packages/engine/src/regions/ca.ts` → `URGENCY_FOREIGN_AUTHORITY` | CA | LOW | **HIGH** |
| D2 | "new secure message" notification-hook phrase | `packages/engine/src/regions/base.ts` → `URGENCY_GENERIC` | All (base) | MEDIUM | MEDIUM |
| D3 | DVLA "vehicle clamping" threat phrasing | `packages/engine/src/regions/gb.ts` → `URGENCY_TOLL` | GB | LOW | LOW (sharpening only — not a gap) |

D3, for completeness:

```
"vehicle will be clamped", "avoid vehicle clamping", "clamped and impounded",
```

---

## Pack-interface notes

**No new fields required for D1–D3.** All three target existing arrays.

One structural observation, recorded rather than proposed: `gatedBenefitPhrases`
(the "phrase scores only alongside a link or an information ask" mechanism)
currently has its flag *wording* hardcoded in `scamDetector.ts`
("Veterans-benefit lure — scammers impersonate VA programmes…") rather than
pack-authored, unlike `fakeInvestmentPlatformFlag`, which is a function each
pack supplies. Only `us.ts` populates the field today. If a future proposal
wants the same "innocent phrase, gated on a link/ask" shape for a
non-veterans, non-US case, the flag text needs generalising the way
`fakeInvestmentPlatformFlag` already is — a small, mechanical change, but a
real one, not a copy-paste of the existing field.

---

## Region demand signal

`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are unset in this cloud execution
environment — same standing gap recorded in every prior cycle since at least
2026-08-23. `scripts/region-demand.ts` exists and is ready to run against
production credentials (`TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx
scripts/region-demand.ts`), but cannot be run from here. No figures are
estimated or invented; this section remains evidence for a future decision,
not a decision itself.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| "Hi Mum" / "Hi Dad" first-contact opener | **DEFERRED** | Still no distinct SMS opener pattern documented this cycle (unchanged since 2026-09-13). |
| India "digital arrest" scam | **DEFERRED** | Multilingual-coverage reasoning in `in.ts` still holds; new CBI enforcement action doesn't change it. See above. |
| Medicare Part D cap lure (US) | **DEFERRED** | No new SMS evidence found. |
| Physical QR quishing (parking meters, cafés) | **EDUCATION GAP** | Not detectable from text alone (see BASE-3); FTC repeated the warning 23 Sep 2026. Candidate for the learn/how-it-works page, not the engine. |
| DeFi approval-phishing new lure phrases ("yield farming bonus", "liquidity mining rewards", "bridge your tokens") | **MONITORING** | Still not confirmed in AU (or any region's) consumer-facing SMS/email. |
| Origin Energy (AU) breach follow-on spear-phishing | **MONITORING** | Brand already in `au.ts`; no new distinct phrase identified this cycle either. |
| myGov multi-benefit compound scoring (AU) | **WATCHLIST** | Structural proposal from 2026-09-25: score a boost when ≥2 AU benefit types (Medicare/Centrelink/super/JobSeeker) appear together. Not re-investigated this cycle. |
| IC3/FBI recovery scam ("ic3 agent", "ic3 case number") | **MONITORING** | Still no US-specific SMS evidence. |
| LINE/KakaoTalk recruitment funnels | **DEFERRED** | Insufficient evidence; FP risk too high. |
| Ledger/Trezor TOAD callback variants | **MONITORING** | Current vector remains physical letter + phishing site, not SMS callback. |
| CA French-keyword gap | **BLOCKED** | Pending native reviewer. |
| AI deepfake executive BEC | **MONITORING** | Primarily enterprise-targeted; no consumer SMS/email pattern identified. |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No specific new TLD surfaced this cycle beyond `base.ts SUSPICIOUS_TLDS`. |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Scamwatch — browse news and alerts (`scamwatch.gov.au`) | 1 | AU coverage check |
| cyber.gov.au — alerts and advisories | 1 | AU coverage check (ACSC advisories) |
| MailGuard — fake myGov "Secure Message" phishing scam (`mailguard.com.au`, 18 Sep 2026) | 2 | AU finding, routed to BASE-1/D2 |
| pcrisk.com — MyGov Secure Message Email Scam | 3 | BASE-1/D2 corroboration |
| DVLA vehicle tax scam overview — SafeBrowz | 3 | GB/D3 corroboration (Tier 1 DVLA advisory already cited 2026-09-13) |
| Which? — the latest scam alerts | 2 | GB coverage check |
| Your Local Computer Guy — UK scam alerts, August 2026 | 3 | GB coverage check |
| FTC Consumer Alerts (`consumer.ftc.gov`) | 1 | US coverage check; BASE-3 QR quishing |
| NZ Herald — Netsafe bank-impersonation surge | 2 | NZ coverage check |
| Roscommon Herald — Gardaí student fraud warning | 3 | IE coverage check (Tier 1 An Garda/FraudSMART advisories already cited) |
| Nunatsiaq News — RCMP court-date text scam | 2 | CA/D1 |
| DiscoverAirdrie — RCMP court-documents text variant | 3 | CA/D1 |
| RCMP — Warning: phishing scam impersonating the RCMP | 1 | CA/D1 |
| Vectra AI — AI scams in 2026 | 2 | BASE-2 context |
| Infosecurity Magazine — Smishing Triad toll payment scams | 2 | BASE-3 monitoring |
| Lowy Institute — India's digital arrest scams | 2 | IN watchlist confirmation |
| Digital Watch Observatory — India CBI crackdown | 2 | IN watchlist confirmation |

---

## Issues opened

| ID | Issue | Priority |
|---|---|---|
| D1 | [#369 — CA: RCMP "undelivered court documents" SMS lure](https://github.com/alekslinde/veriguard/issues/369) | HIGH |

D2 and D3 are MEDIUM/LOW priority and are not auto-filed as issues per the
workflow's HIGH-only threshold; their full detail is in this file for a human
to triage.
