# Threat-intelligence roadmap — 2026-10-18

## Status — as at 2026-10-18

| Proposal | Issue | Shipped in | Status |
|---|---|---|---|
| D1 — Job-interview phishing domain pattern (`.info`/`.works` TLDs) | [#475](https://github.com/alekslinde/veriguard/issues/475) | — | ⬜ Outstanding |
| D2 — MX dead `caseSensitiveAuthorities` entries (carried from 2026-10-16 D4) | — | — | ⬜ Outstanding |
| D3 — US midterm voter-registration / campaign-pool lures (carried from 2026-10-16 D3) | — | — | ⬜ Outstanding (time-sensitive, human triage) |

Nothing from this roadmap has shipped yet, so there is no promotion to
`lib/threatRadar.ts` or `lib/scamCalendar.ts` to record.

*Sweep period: 2026-10-16 – 2026-10-18 (2 days since the last sweep — the
previous cycle had a 5-day window; this one is short because the 2026-10-16
docs PR merged same-day as its code PRs, pulling the "due" date forward).
Input: the 🧭 Weekly sweep brief, issue #447 (65 items from 10 of 14 feeds),
corrected for staleness — see Corrections. Next sweep due on or around
2026-10-25.*

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from 2026-10-16. `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly** AU GB US NZ CA IE, **rotation NL PH PL SE TH**. The brief
(#447) prints rotation **AE BR ES FR ID** — that is *not* the live plan.
Exactly the same failure mode the 2026-10-16 sweep documented: #447 was
generated against "the last sweep (2026-10-06)" because the 2026-10-16
roadmap's docs PR (#465) had not yet merged when the brief ran on 2026-10-12.
AE/BR/ES/FR/ID were the 2026-10-16 sweep's own rotation and are `skipped`
below, inside their 42-day window. This sweep follows the live plan: **NL PH
PL SE TH**.

**Detection changes since the 2026-10-16 sweep** (`git log c87dc0e..HEAD --
packages/detect/src/`):

| Commit | Ships |
|---|---|
| `9c386e7` (#473) | fix(detector): stop a corroborated deferred row escaping the email discount — a bug fix, not a threat-intel proposal |

`c5e18d1` (#474) promoted the 2026-10-16 cycle to `lib/threatRadar.ts` and
`lib/scamCalendar.ts`. Nothing from 2026-10-16 is outstanding on the shipping
side: D1 and D2 shipped and closed (#463, #468; #464, #466). **D3** (US
midterm) and **D4** (MX dead authority entries) from 2026-10-16 are still
unfiled and unshipped — carried forward below as D3 and D2 respectively. D8
(IE Garda Fixed Charge Notice), carried for several cycles now, is unchanged
again.

I read `types.ts`, `base.ts`, `scamDetector.ts` in full (`checkUrl`,
`checkSms`, `checkEmail`, `checkCustom`, `analyzeContent`, the signal
registry call sites, `SUSPICIOUS_TLDS`), the signal modules (`signals/*.ts`),
and this cycle's rotation packs (nl/ph/pl/se/th) in full, plus re-read
`mx.ts` and `us.ts` for the carried items and `acronymWordCollision.test.ts`
and `types.ts`'s `caseSensitiveAuthorities` doc comment to re-confirm D2.

**How the scores below were measured.** A throwaway script outside the repo
imported `checkUrl`, `checkSms` and `checkCustom` from
`packages/detect/src/scamDetector.ts` and printed the verdict, score and
every signal row for each candidate, under the stated region. Nothing it
measured was committed.

---

## Executive summary

**One HIGH finding this cycle, from the brief's own feeds rather than from a
stale item.** Two MEDIUM items carry forward unchanged from 2026-10-16,
still left for human triage.

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | **D1 — Job-interview phishing domains (`.info`/`.works`)** | `base.ts` `SUSPICIOUS_TLDS` | `joinquest.works` and `joinconnect.info` **safe 0**; `joinhire.cfd` already suspicious 30 | Malwarebytes (14 Oct 2026) named 11 live domains behind a fake "Calendly \| Meta Careers" credential-phish funnel. `.cfd` is already listed; `.works` and `.info` carry two of the three reported TLDs and are not |
| 2 | D2 — MX `caseSensitiveAuthorities` lists two dead entries (2026-10-16 D4, carried) | `regions/mx.ts`, a test | `"SAT: …"` unknown 15 vs full name 40 — unchanged | Still true; nothing shipped against it since 2026-10-16 |
| 3 | D3 — US midterm voter-registration lure (2026-10-16 D3, carried) | `regions/us.ts` | safe 15, unchanged | A further FBI PSA (PSA261016, 16 Oct) names threats to election *officials*, not a new consumer text shape. Election is 3 Nov — 16 days out |

D1 is filed (see *Issues opened*). D2 and D3 are left for human triage, per
the HIGH-only threshold; D3 remains time-sensitive.

**Region demand:** not measured this cycle — see §Region demand signal.

---

## Corrections — leads and claims that did not hold up

1. **The brief's window and rotation are a cycle stale, again.** Issue #447
   was generated on 2026-10-12 against "the last sweep (2026-10-06)" — the
   same staleness the 2026-10-16 sweep documented, not yet resolved because
   the brief runs before the previous cycle's docs PR has necessarily
   merged. The 65 items are dated 2026-10-06 – 10-11, already fully
   triaged by the 2026-10-16 sweep (see its *Brief triage* section). No
   item in #447 was re-triaged here; this sweep instead re-read the
   registered tier-1 sources for the *live* rotation (NL, PH, PL, SE, TH)
   directly, since none of them have a registered feed.
2. **MailGuard "Secure Folder" phish, BlueKit PhaaS, ccTLD hijack, ASOS
   breach** — all re-checked against their source pages for anything newer
   than what 2026-10-16 recorded. MailGuard's blog has nothing after 9 Oct.
   No new evidence on any of the four; they stay watchlisted/monitoring as
   2026-10-16 left them.
3. **FBI IC3 PSA index** shows three PSAs dated 15 Oct (already measured by
   2026-10-16 as D3) and one new PSA dated 16 Oct, **PSA261016** ("Cyber
   Threat Actors Use a Variety of Techniques to Target Election and Campaign
   Officials"). Read past the headline: this targets election *workers and
   campaign staff* as a workplace-intrusion threat, not voters via SMS/email
   — out of this detector's consumer scope. It does not change D3's MEDIUM
   status or its evidence.
4. **SEC Nigeria's primary WayvePay circular, unlocated as of 2026-10-16,
   is now findable** via the registered feed
   (`home.sec.gov.ng/feeds/circulars.rss`): "SUSPECTED FRAUDULENT ACTIVITIES
   OF WAYVEPAY", dated 10 Oct 2026. This closes the sourcing gap 2026-10-16
   flagged, but not the substance of that watchlist item — whether a
   `minimal` pack may append regulator-named platforms to
   `fakeInvestmentPlatforms` is still a tier-policy question for a human,
   not a research one.

---

## Threats by region

### This cycle's rotation (`minimal` coverage): NL, PH, PL, SE, TH

None of these five have a registered feed, so each was read by hand against
its registered tier-1 sources (capped, per the registry's own discipline).

#### NL — Netherlands

Fraudehelpdesk's "actueel" page lists only **voice-call** lures since
14 September: a spoofed Rijksrecherche number (9 Oct), a fake Google
helpdesk call (7 Oct), a "thuisbatterij" (home battery) cold call (21 Sep),
and number-spoofing that displays the victim's own number back at them
(16 Sep). None has an SMS/email/message text component to score against.
AFM's "actueel" page has a press release on recognising red flags in online
investment tips (29 Sep) — guidance, not a named campaign — and a warning
about fraud that misuses AFM's own phone number (20 May, outside this
cycle's window). No proposal.

#### PH — Philippines

Both registered tier-1 sources (`acg.pnp.gov.ph`, `sec.gov.ph`) returned
403 to automated fetch this cycle — consistent with their `expect: blocked`
status in the registry. No capped-search substitute was used, per the
registry's discipline against open search; this region is recorded as
unresearched rather than papered over with an unregistered source. No
proposal.

#### PL — Poland

CERT Polska's front page shows one phishing item in the visible excerpt: a
12 June 2026 UNC1151/Ghostwriter campaign against Gmail — six months old
and already outside this cycle's relevance window, Polish-language and
targeting a non-AU audience. KNF's public-warnings page could not be
reached this cycle (connection refused). No proposal.

#### SE — Sweden

Polisen's fraud page is category/awareness content ("Våga vara otrevlig")
with no dated campaign items. Finansinspektionen's warning list (`fi.se`)
shows ten unlicensed-platform entries, all dated 2026-10-06 — the same
shape as every cycle's list of clone-brand and shell-company names, not a
new tactic. SE's `fakeInvestmentPlatforms` composite already covers a named
platform plus investment framing; nothing here names a platform with fresh
AU- or English-language relevance. No proposal.

#### TH — Thailand

`tcsd.in.th` (Technology Crime Suppression Division) returns a placeholder
"site under construction" page — effectively dead, though not yet flagged
as such in the registry (worth a registry maintenance note, not a
threat-intel finding). SEC Thailand's Investor Alert list is active and
current (9–14 Oct 2026), but every entry is a named Facebook page or
account ("Market Stream", "Day Trading", "TV News", …) flagged for
unlicensed securities/digital-asset activity — the same shape TH's existing
named-platform composite already covers, and none names a platform with
English-language or AU-relevant phrasing. No proposal.

### Checked outside the rotation (carried items only)

#### United States (`full`) → **D3** (carried, unchanged)

Re-measured against the live engine:

| Lure | Verdict |
|---|---|
| "Our records show you are not registered to vote. Confirm your voter registration before Nov 3: https://vote-registration-check.top" | safe 15 (link only) |
| "Join our campaign investment pool. Your contribution is guaranteed to grow and be returned after our candidate wins in November." | safe 0 |

Unchanged from 2026-10-16. The FBI IC3 PSA index has one new item since
then (PSA261016, 16 Oct — see *Corrections*, item 3), which does not alter
the consumer-text evidence or the FP risk the 2026-10-16 proposal
documented. **Time-sensitive, worse than last cycle:** the midterm election
is now 16 days away (3 Nov). A human should decide this week whether to
ship the 2026-10-16 D3 proposal as written or watchlist it for 2028 — the
window to act is closing regardless of which way it is decided.

#### Mexico (`minimal`) → **D2** (carried, unchanged)

Re-read `mx.ts`, `types.ts` and `__tests__/acronymWordCollision.test.ts` in
full to confirm the gap still exists, as asked. It does, unchanged:
`mx.ts` sets `caseSensitiveAuthorities: ["sat", "ine"]`, but
`AUTHORITY_MENTIONS` does not contain either string in any form.
`checkSms` only consults the case-sensitive list for entries it finds in
`authorityMentions`, so both entries are dead code — they can never fire.
`types.ts`'s doc comment for `caseSensitiveAuthorities` states "Enforced by
`acronymWordCollision.test.ts`", but that file's three `describe` blocks
test collision *detection*, allowlist staleness, and language-list
coverage — none of them assert the `caseSensitiveAuthorities ⊆
authorityMentions` subset the comment claims exists. The comment describes
a test that was never written.

| Lure (MX) | Verdict |
|---|---|
| "SAT: Tienes un adeudo fiscal pendiente. Regulariza hoy en https://sat-pagos.top" | unknown 15 (link only; no agency credit) |
| "Servicio de Administracion Tributaria: tienes un adeudo fiscal pendiente https://sat-pagos.top" | suspicious 40 (agency +25) |

No new MX tier-1 alert this cycle (CONDUSEF is `expect: geofenced`, not
re-probed outside the live rotation). The fix proposed on 2026-10-16 stands
unchanged.

#### Ireland (`full`) → **D8** (carried, unchanged)

FraudSMART's alerts page has nothing newer than the 14 September 2026
consumer-survey item already recorded on 2026-10-16, and no mention of
Gardaí, Fixed Charge Notices, penalty points or fines in anything published
since. `garda.ie` remains unreachable to automated fetch (`expect:
blocked`). No new evidence; D8 is unchanged and still unfiled.

#### Nigeria (`minimal`) — watchlist re-check only

The primary SEC Nigeria circular for WayvePay, unlocated on 2026-10-16, is
now read via the registered RSS feed: "SUSPECTED FRAUDULENT ACTIVITIES OF
WAYVEPAY", dated 10 Oct 2026, confirming the earlier Premium Times report.
This resolves the sourcing gap but not the underlying tier-policy question
(see *Corrections*, item 4). Separately, noted in passing while reading
`ng.ts`: its `reportingUrl` still points at `efccnigeria.org`, which
`sources.yml` already records as gone (the registry's own EFCC entry moved
to `efcc.gov.ng` on 2026-09-29). That is a pack-hygiene drift, not a
threat-intel finding, and is flagged here rather than silently fixed, per
the separation between roadmap and code.

#### Great Britain (`full`) — probe-lead re-check only

Re-measured the pre-existing false positive 2026-10-16 surfaced: "Your
direct debit has been set up with Octopus Energy for £64.00 a month. Any
questions call us on 0808 164 1088." still scores **suspicious 40**
(deferred brand mention + the generic "asks you to call a number" row).
Unchanged by the D1 composite that shipped from 2026-10-16 — that composite
requires a transaction-disown clause this message doesn't carry. Still a
probe lead, not a sweep finding; carried forward unchanged.

### Brief triage (#447) — not re-done

2026-10-16 already triaged every item in #447 in full (see that roadmap's
*Brief triage* section) because the brief's 65 items were all dated inside
its own window. Re-triaging the same 65 items here would be re-covering
ground the archive's discipline says to record once. The four
consumer-facing items it already measured (MailGuard Secure Folder,
BleepingComputer Claude ClickFix, Malwarebytes BlueKit, Malwarebytes ccTLD
hijack) were spot-checked for anything newer at their source — see
*Corrections*, item 2 — and nothing has changed.

### New item found outside the brief: Malwarebytes feed, 14–16 Oct 2026

The MX/US/IE/NG/GB re-checks above exhausted the carried items, so the
Malwarebytes feed (registered, tier 2) was read past the brief's window for
anything dated after it, consistent with reading from a registered source
rather than open search. Two items stood out:

- **"Fake Calendly 'Meta Careers' pages steal Facebook and Google logins"**
  (14 Oct 2026) → **D1**, below.
- **"'Spray and pray' job applications could make it harder for you to spot
  a scam"** (16 Oct 2026). A roundup of job-scam tactics (unsolicited
  recruiter contact, task-scam "rate products" offers, deposit-to-withdraw
  requests, WhatsApp hand-off) rather than a new one. The one quoted lure —
  "Work just 60-90 minutes per day… Daily earnings range from £500 to
  £1,000… please contact us via WhatsApp" — is already the shape
  `jobSignals` is built for:

  | Lure | Verdict |
  |---|---|
  | "Work just 60-90 minutes per day. Daily earnings range from £500 to £1,000, depending on your availability. Please contact us via WhatsApp." (GB) | **likely_scam 50** (`work from home`-class + `earn $` pattern ×2 + WhatsApp hand-off) |

  Already covered. No proposal from this item.

#### D1 — Job-interview phishing domains (`.info`/`.works`)

Malwarebytes (14 Oct 2026) detailed a fake "Calendly \| Meta Careers"
funnel: a convincing cloned booking page leads to a fake CAPTCHA, a fake
Facebook login (with 2FA relay), then a fake Google sign-in requesting the
linked Gmail password and its own verification step — credentials and
one-time codes are relayed to the attacker in real time so they can be used
before they expire. The article names 11 live domains, all following a
`join` + recruiting-word pattern, across three TLDs: `.cfd`, `.info`,
`.works` (e.g. `joinhire.cfd`, `joinquest.works`, `jointheteam.cfd`,
`joinconnect.info`, `jointalent.cfd`). Exfiltration goes to an AWS API
Gateway endpoint, not a domain carrying any Meta/Calendly branding.

Measured against the live engine, by TLD:

| Domain | Verdict |
|---|---|
| `https://joinhire.cfd/` | suspicious 30 (`.cfd` already in `SUSPICIOUS_TLDS`) |
| `https://jointheteam.cfd/` | suspicious 30 |
| `https://jointalent.cfd/` | suspicious 30 |
| `https://joinquest.works/` | **safe 0** |
| `https://joinconnect.info/` | **safe 0** |
| `https://calendly.com/meta-recruiter/30min` (genuine, control) | safe 0 |
| `https://randomname123.works/` (neutral control, no job framing) | safe 0 |
| `https://randomname123.info/` (neutral control, no job framing) | safe 0 |

Two of the three reported TLDs — `.works` and `.info` — score exactly the
same as any ordinary domain. `.cfd` already carries the "high-abuse 2026
TLD" weight from the 2026-08 wave, so one of the three delivery TLDs is
already caught; the other two are the gap. As SMS/message delivery, the
link check alone reaches only **safe 15** ("Contains link"), with no
job/recruitment signal firing — the message text in a real instance of this
lure ("book your 30-minute interview call here: …") does not contain two of
the `jobSignals` phrases, so the URL layer is the only place this can be
caught before the victim clicks through.

**Proposed rule:** add `.info` and `.works` to `SUSPICIOUS_TLDS` in
`base.ts`, alongside the existing high-abuse-TLD block. This is a BASE
addition (the pattern is not AU-specific and TLD abuse is global), not a
new composite — same mechanism as the existing `.cfd`/`.bar`/`.beauty`/etc.
entries, so no new code path, only two new list entries.

**Acceptance criteria:**
- `https://joinquest.works/` **safe 0 → suspicious 30**.
- `https://joinconnect.info/` **safe 0 → suspicious 30**.
- Unchanged: `https://calendly.com/…` safe 0; any other `.com`/`.org`/
  `.net` control stays unaffected (TLD list entries affect nothing but
  their own suffix).

**FP note.** `.info` and `.works` both have real legitimate use (hobby
sites, freelance portfolios, some nonprofits), the same honest trade-off
every other entry in `SUSPICIOUS_TLDS` already carries — none of them
reaches a scam verdict alone, only `suspicious`, and the list's own
pattern is "lean on compound scoring" for exactly this reason. No
independent base-rate measurement (Interisle, ICANN DAAR) was read for
`.info`/`.works` specifically this cycle, so unlike `.bond`/`.xin` this
rests on a single named vendor campaign rather than a corroborated
abuse-rate figure. A reviewer may want that corroboration before merging —
flagged here rather than silently assumed.

Source:
- [Malwarebytes Labs — Fake Calendly "Meta Careers" pages steal Facebook and Google logins](https://www.malwarebytes.com/blog/news/2026/10/fake-calendly-meta-careers-pages-steal-facebook-and-google-logins) (Tier 2, 14 Oct 2026)

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | skipped | Weekly region, but no new AU-specific lead this cycle beyond re-checks folded into the GB/NG sections; no AU tier-1 source read fresh |
| GB | light | Octopus Energy FP re-measured, unchanged; no new GB-specific lead |
| US | light | IC3 PSA index re-checked; D3 carried, unchanged |
| NZ | skipped | No new lead surfaced; not independently re-read this cycle |
| IE | light | FraudSMART re-read in full; D8 carried, unchanged |
| CA | skipped | Not re-read this cycle |
| NL | light | Fraudehelpdesk, AFM; voice-only lures, no text-side signal |
| PH | skipped | Both tier-1 sources (`acg.pnp.gov.ph`, `sec.gov.ph`) 403 to automated fetch this cycle |
| PL | light | CERT Polska, KNF (KNF unreachable); nothing current or AU-relevant |
| SE | light | Polisen, Finansinspektionen; named-platform list only, no new tactic |
| TH | light | SEC Thailand Investor Alert (current); TCSD effectively dead, unflagged in registry |
| MX | light | Re-read pack and test file; D2 (2026-10-16 D4) confirmed unchanged |
| NG | light | SEC Nigeria feed closed the WayvePay sourcing gap; policy question unchanged |
| AE, BR, ES, FR, ID | skipped | Researched 2026-10-16; the brief's rotation claim was stale, same failure as last cycle |
| DE, IN, KE, SG | skipped | Researched 2026-10-06, not due |
| IT, JP, KR | skipped | Researched 2026-10-16, not due |
| VN, ZA | skipped | Not in this cycle's rotation plan |

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| D1 | Job-interview phishing domains (`.info`/`.works`) | Add `".info"`, `".works"` to `SUSPICIOUS_TLDS` | `regions/base.ts` | BASE | LOW–MEDIUM | **HIGH** |
| D2 | Dead `caseSensitiveAuthorities` entries (2026-10-16 D4, carried) | Add `"sat"`, `"ine"` to MX `AUTHORITY_MENTIONS`; add the subset assertion `types.ts` claims exists | `regions/mx.ts`, `__tests__/acronymWordCollision.test.ts` | MX (invariant: all packs) | LOW | MEDIUM |
| D3 | Midterm voter-registration / campaign-pool lures (2026-10-16 D3, carried) | `"not registered to vote"`, `"voter registration has been flagged"`, `"voter registration is inactive"` in `URGENCY_TAX_THREAT`; `"campaign investment pool"` in `REWARD_WORDS` | `regions/us.ts` | US | MEDIUM | MEDIUM |

D2 and D3's proposed rules are unchanged from the 2026-10-16 roadmap; see
that file for the full rule text, acceptance criteria and FP notes. They
are not repeated verbatim here to avoid two documents disagreeing if one is
edited later — this file only records that both were re-verified against
the live engine today and found unchanged.

### D1's rule in full

```ts
// base.ts, SUSPICIOUS_TLDS — two new entries alongside the existing
// high-abuse-2026-TLD block:
".info", ".works",
```

```
flag: "Dodgy top-level domain (.info / .works) — commonly used by scammers"
```

(Reuses the existing TLD-check flag template verbatim; no new flag copy.)

---

## Pack-interface notes

- D1 needs no new field or composite — it is two string literals in an
  existing array, the cheapest possible change in this archive's own terms.
- D2 (carried) still asks for the subset invariant on
  `caseSensitiveAuthorities` to be tested, since `types.ts` already claims
  that test exists and it does not.
- `ng.ts`'s `reportingUrl` pointing at a domain `sources.yml` already
  records as gone is a pack-maintenance item, not a threat-intel proposal —
  noted under the Nigeria section rather than fixed here, since this
  roadmap does not modify code.

---

## Region demand signal

Not measured this cycle. The production report store is not reachable from
the research environment, consistent with 2026-10-16.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| MX D2 (was 2026-10-16 D4) — dead `caseSensitiveAuthorities` | **OUTSTANDING, unfiled** | Unchanged; re-confirmed against the live pack and test file this cycle |
| US D3 — midterm voter-registration lure | **NEEDS DECISION — more urgent** | Election 3 Nov 2026, now 16 days out; evidence unchanged since 2026-10-16, a new PSA (16 Oct) targets election officials, not voters, and doesn't change the consumer-text case |
| IE D8 — Fixed Charge Notice phrasing | **OUTSTANDING, unfiled** | Unchanged; FraudSMART has nothing newer than 14 Sep; garda.ie still unreachable |
| GB benign direct-debit confirmation scores suspicious 40 (Octopus Energy) | **PROBE LEAD** | Unchanged; re-measured this cycle, still suspicious 40 |
| NG regulator-named platforms (WayvePay, Gvest) in `fakeInvestmentPlatforms` | **NEEDS POLICY DECISION** | Primary SEC Nigeria circular now located (10 Oct 2026); the tier-policy question itself is unchanged |
| NG `ng.ts` `reportingUrl` points at a dead `efccnigeria.org` | **PACK HYGIENE — new** | `sources.yml` already records the registry's own move to `efcc.gov.ng`; not a threat-intel finding, a maintenance item |
| TH `tcsd.in.th` serves a placeholder "under construction" page | **PACK HYGIENE — new** | Not yet `retired`/`expect`-flagged in `sources.yml`; a human should confirm before editing the registry |
| MailGuard "Secure Folder" OAuth device-code phish | **MONITORING** | Unchanged; re-checked, nothing newer at source |
| BlueKit PhaaS (SMS sender, 97 brands) | **MONITORING** | Unchanged |
| ccTLD registry compromise (`.gh`/`.sl`/`.as`) | **MONITORING** | Unchanged |
| ASOS breach follow-on phishing | **MONITORING** | Unchanged; no follow-on lure reported yet |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Unchanged from 2026-10-16; not independently re-checked this cycle |
| Path-embedded redirect through security-gateway rewrite URLs | **MONITORING** | Unchanged |
| Clipboard-swap ClickFix behind genuine install commands | **MONITORING** | Unchanged |
| Class-action settlement payment lures (CA Bread) | **WATCHLIST** | Unchanged; CA not re-read this cycle |
| Sextortion "relief" services | **WATCHLIST** | Unchanged; the FTC's $60M figure recurs in the Malwarebytes feed (15 Oct) with no new channel/text shape |
| IT AdE IRPEF-refund / Bonus Vacanze phrasing; AdE lookalike-domain list | **NEEDS NATIVE REVIEW** | Unchanged; IT not in this cycle's rotation |
| KR post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW** | Unchanged; KR not in this cycle's rotation |
| ES / FR / BR / ID native-review items (2026-10-11) | **NEEDS NATIVE REVIEW** | Unchanged |
| Authority + messaging-app hand-off for GB/IE/NZ | **MONITORING** | Unchanged |
| "Was this you?" bank texts with no link (PTSB, ANZ NZ) | **DEFERRED** | Unchanged |
| Bank brand in ad/giveaway text (CommBank car draw) | **DEFERRED** | Unchanged |
| India "digital arrest", LINE/KakaoTalk funnels, CA French keywords, myGov multi-benefit compound | **DEFERRED / BLOCKED** | Unchanged |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced beyond this cycle's `.info`/`.works` finding, which is filed separately as D1 |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Fraudehelpdesk — alerts | 2 | NL |
| AFM — consumer actueel | 1 | NL |
| CERT Polska | 1 | PL (reached) |
| KNF — public warnings | 1 | PL (unreachable this cycle) |
| Polisen — bedrägeri | 1 | SE |
| Finansinspektionen — varningslista | 1 | SE |
| SEC Thailand — Investor Alert | 1 | TH |
| PNP Anti-Cybercrime Group | 1 | PH (403, unreached) |
| SEC Philippines — advisories | 1 | PH (403, unreached) |
| FBI IC3 — PSA index | 1 | US-D3 re-check |
| FraudSMART — alerts | 2 | IE-D8 re-check |
| SEC Nigeria — circulars feed | 1 | NG WayvePay sourcing |
| MailGuard — blog | 2 | Brief-item re-check |
| Malwarebytes Labs — blog feed | 2 | D1 (Calendly/Meta Careers phish); job-scam roundup check |

No new sources are proposed for `sources.yml` this cycle.

---

## Issues opened

| ID | Issue | Priority |
|---|---|---|
| D1 | [#475 — BASE: job-interview phishing domain pattern, add `.info`/`.works` to `SUSPICIOUS_TLDS`](https://github.com/alekslinde/veriguard/issues/475) | HIGH |

D2 and D3 (both MEDIUM, carried from 2026-10-16) are not filed, per the
HIGH-only threshold. D3 is time-sensitive and its full detail is above and
in the 2026-10-16 roadmap for a human to triage this week.
