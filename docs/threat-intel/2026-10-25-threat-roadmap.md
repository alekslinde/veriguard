# Threat-intelligence roadmap — 2026-10-25

*Sweep period: since the 2026-10-18 roadmap. Issues opened: #494, #495, #496
— see §Issues opened.*

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from 2026-10-18. `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npm run check-research-freshness -- --plan 5` (after `npm install`, which was needed this
cycle to resolve the `@veriguard/detect` workspace link — the script fails with
`Cannot find module '@veriguard/detect/regions'` until the workspace is linked)
names this cycle's regions: **weekly AU GB US NZ CA IE**, **rotation PH VN ZA
DE IN**. Re-run at the end of the cycle to confirm it hadn't drifted: unchanged.

Read in full this cycle: `regions/types.ts`, `regions/base.ts`,
`scamDetector.ts` (all 3,306 lines — `checkUrl`, the `Signals` class and its
`mentions`/`mentionsAny`/`mentionsAsAcronym` matching machinery, `checkSms`,
`checkEmail`, `checkPhone`, `checkCustom`, `scoreToResult`/`downgradeForCoverage`),
`phoneIntel.ts`, all five `signals/*.ts` modules (clickfix, familyImpersonation,
phone, splicedWording, taskPayment), and the region packs for AU, GB, US, NZ,
IE, CA (weekly) and PH, VN, ZA, DE, IN (this cycle's rotation). Skimmed
`urlSanitizer.ts`, `urlExpander.ts`, `detectType.ts`, `emailHeaders.ts`.
Grepped `docs/threat-intel/sources.yml` for the registered sources per region
in scope. Read `docs/threat-intel/README.md` in full and the 2026-10-18
roadmap in full (its watchlist carries three live items relevant this cycle —
see *Carried items*, below).

**Detection changes since the 2026-10-18 sweep:** none found in
`packages/detect/src/` beyond the documentation/comment change in `mx.ts`
described under *Corrections* below (no functional diff — the file's own
in-code commentary was updated to record an adversarial-probe finding; the
pack's exported shape is unchanged). `git log` was not re-run against a pinned
commit from this research environment; the "no functional change" conclusion
rests on reading the current file and matching it against the 2026-10-18
roadmap's description of the same gap, not on a diff.

**Environment note.** `WebFetch` returned `ENOTFOUND` for every URL attempted
this cycle (`.gov.au`, `.com.au`, `.gov`, `.com` domains alike), so no
tier-1/tier-2 source page could be fetched directly — only `WebSearch` snippets
were available. This is a materially worse research posture than prior
cycles, which fetched pages directly per the README's fetch discipline. Where
a finding below rests on a WebSearch snippet rather than a fetched page, that
is noted. This is worth a human checking: either the tool is broken in this
run's environment, or network policy for this session blocks it, and either
way it limits what the registry-reads-first discipline could achieve this
cycle.

---

## Executive summary

**Quiet cycle for five of six weekly regions.** AU, GB, NZ, IE and CA were all
re-checked against this week's reporting and nothing genuinely new surfaced —
every live tactic found already has code-level coverage, confirmed by
re-measuring against the engine (see *Threats by region*). The substance this
cycle is in the US (one time-sensitive, newly-evidenced carried item plus one
new finding) and a correction to a 3-cycle-old carried MX item.

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | **US-D1 — Midterm election fraud lures** (promotes 2026-10-16 D3 / 2026-10-18 D3) | `regions/us.ts` | "voter registration has been flagged" + link → safe 15; "campaign investment pool" + "guaranteed returns" → safe 12 | FBI IC3 PSA I-101526-3-PSA (15 Oct 2026), dedicated to the 2026 midterm, names exactly these two lure shapes. Election is 3 Nov 2026 — **9 days out** |
| 2 | **US-D2 — IC3 self-impersonation (recovery-fraud re-victimisation)** — new | `regions/us.ts` | Bare "IC3" and "Internet Crime Complaint Center" → safe 0, no authority credit at all | FBI public warning (~19 Aug 2026, widely reported): scammers pose as IC3 staff to re-victimise people who already reported fraud, demanding a "release fee" for recovered funds |
| 3 | **MX-D1 — correction + fix of the carried `caseSensitiveAuthorities` gap** (was 2026-10-16 D4 / 2026-10-18 D2) | `regions/mx.ts`, a new test | "SAT: tienes un adeudo fiscal pendiente..." → unknown 15 (link only, no agency credit) | The carried proposal's own fix ("add `sat`/`ine` to `AUTHORITY_MENTIONS`") would reopen an adversarial-probe false positive `mx.ts`'s own comments now document. The safe fix, verified against `mentionsAsAcronym` directly, is the AU `sec`/ZA `sars` pattern — see below |

**Region demand:** not measured this cycle — see *Region demand signal*. The
production report store remains unreachable from this research environment,
same as every prior cycle.

---

## Carried items re-checked this cycle

From the 2026-10-18 watchlist, three items were re-checked against this
week's reporting and the live engine rather than re-investigated from
scratch:

- **US D3 (midterm election lure)** — **promoted to US-D1 above.** The
  2026-10-16/10-18 evidence was the general FBI election-fraud PSA update; a
  *second*, dedicated PSA (I-101526-3-PSA, 15 Oct 2026) has since published,
  naming the exact lure shapes ("campaign investment pool", AI-cloned
  candidate voices, fake voter-registration links) the 2026-10-16 roadmap's
  proposed phrases already targeted. That is new, directly on-point evidence,
  and the election is now 9 days away rather than 16 — this is the "human
  should decide this week" item the 2026-10-18 roadmap flagged, and the
  decision window is closing. See *Proposed detection improvements*.
- **MX D2 (was 2026-10-16 D4) — dead `caseSensitiveAuthorities` entries** —
  **corrected, not simply confirmed.** See *Corrections* and US-D1's sibling
  row above; full detail below.
- **IE D8 (Garda Fixed Charge Notice phrasing)** — re-checked against this
  week's reporting; no new evidence. FraudSMART and `garda.ie` turned up
  nothing beyond what 2026-10-18 already recorded (and `garda.ie` is still
  unreachable to automated fetch, consistent with its `expect: blocked`
  registry entry). This cycle's research did not have access to the exact
  proposed phrasing from the earlier cycles (not re-derivable from the
  2026-10-18 roadmap's summary alone), so it stays carried rather than being
  re-filed speculatively. **Still OUTSTANDING, unfiled.**

---

## Corrections — leads and claims that did not hold up

**MX `caseSensitiveAuthorities` — the carried fix was wrong, not just unfiled.**

The 2026-10-16/2026-10-18 roadmaps described `mx.ts`'s `caseSensitiveAuthorities:
["sat", "ine"]` as dead code (neither string appears in `AUTHORITY_MENTIONS`,
so `checkSms`'s authority-mention filter never reaches them) and proposed
adding both to `AUTHORITY_MENTIONS` as the fix. Re-reading `mx.ts` this cycle
shows that gap is still real — `checkSms("SAT: tienes un adeudo fiscal
pendiente...", "MX")` still measures **unknown 15** (link only; zero agency
credit) — but the file's own comment above `AUTHORITY_MENTIONS` now documents
*why* the carried proposal's fix is wrong: an adversarial probe
(`checkSms("I sat on the porch...", "MX")`) found that a bare, case-insensitive
"sat"/"ine" entry flags ordinary Spanish/English prose as government-agency
impersonation ("I sat down", "fine wine" collide with both acronyms as
ordinary words). That is exactly the "SARS"/"SEC"/"ICE" collision ZA, US and
AU already solved — and solved with a *different* mechanism than "add the
bare word to `AUTHORITY_MENTIONS`".

Measured directly against `mentionsAsAcronym` (the function
`caseSensitiveAuthorities` entries route through, *instead of* plain
`mentions()`, when an entry is in both lists):

```
mentionsAsAcronym("I sat on the porch all afternoon drinking fine wine.", "sat") → false
mentionsAsAcronym("I sat on the porch all afternoon drinking fine wine.", "ine") → false
mentionsAsAcronym("SAT: tienes un adeudo fiscal pendiente, regulariza hoy.", "sat") → true
mentionsAsAcronym("INE: tu credencial para votar ha sido suspendida.", "ine") → true
mentionsAsAcronym("Fine, I will pay the fine tomorrow.", "ine") → false
```

So the safe fix is the AU `sec`/`ice` and ZA `sars` pattern exactly: add
`"sat"` and `"ine"` to `AUTHORITY_MENTIONS` **as bare, lower-case entries**
(not the full names — those are already present and unaffected), while
leaving `caseSensitiveAuthorities: ["sat", "ine"]` as-is. Because both
entries are then present in *both* lists, `scamDetector.ts`'s `authorityIn()`
helper (`CASE_SENSITIVE.has(entry) ? mentionsAsAcronym(...) : mentions(...)`)
routes them through the literal-caps-only matcher instead of the
case-insensitive one — catching `"SAT:"` and `"INE:"` written in caps (the
real SMS lure shape) without reopening the ordinary-word collision the
adversarial probe found. This is now **MX-D1** below, filed as a correction
of the carried item rather than a repeat of it.

The second half of the 2026-10-18 finding — that `types.ts`'s doc comment for
`caseSensitiveAuthorities` claims a test enforces "entries here must also
appear in `authorityMentions`" and `acronymWordCollision.test.ts` does not
actually assert that subset — is still true (confirmed by re-reading the test
file's three `describe` blocks). MX-D1's acceptance criteria includes adding
that missing assertion, since without it this exact defect (a
`caseSensitiveAuthorities` entry with no matching `authorityMentions` member)
can recur silently in any pack.

---

## Threats by region

### Australia (`full`) — deep, no new finding

Re-checked this week's reporting against five of AU's live lure families, all
already covered:

- **Toll/parking smishing** — Bitdefender's ongoing global campaign (12+
  countries including AU/NZ, 79,000+ messages since Dec 2025) impersonating
  Linkt and other toll operators. Already covered: `URGENCY_TOLL` in `au.ts`,
  the ACMA Sender ID `senderIdFlag`, and the generic link/TLD checks in
  `checkUrl`.
- **Bank impersonation / "safe account" calls** — CommBank's March 2026
  warning on more sophisticated impersonation (cloned hold music, coordinated
  calls) describes a voice-channel evolution this text/SMS/email detector has
  no surface for; the SMS/email half of the same script ("safe account",
  "safe transfer") is already in `base.ts`'s `REQUEST_WORDS`.
- **myGov/Centrelink/Medicare cost-of-living texts** — still the same shape
  Services Australia's own pages describe (a link claiming a payment or
  benefit is pending); already covered by `URGENCY_TAX` in `au.ts`.
- **Fake-police "arrest warrant"/CDPP calls** — Scamwatch's standing warning
  describes the same script `URGENCY_TAX_THREAT` and `URGENCY_FOREIGN_AUTHORITY`
  already cover ("warrant issued", "federal police").
- **AI deepfake/voice-clone scams** — ThreatCluster's August 2026 report on a
  Cambodia-based compound impersonating the AFP (~300 potential victims) is an
  operational/law-enforcement story, not a new text pattern; the
  text-arriving-after-a-cloned-call shape is already in `base.ts`'s
  `URGENCY_VOICE_CLONE`.

No proposal. This is a reconfirmation cycle, not a gap in AU's coverage.

### United Kingdom (`full`) — light, no new finding

UK local-council warnings about fake QR codes on parking machines
("quishing") continued this week (several `.gov.uk`/`.police.uk` council
pages via WebSearch snippets — no page was fetchable, see the environment
note in Step 1). The tactic is already caught generically by `checkSms`'s QR
"quishing" prompt rule (+20, fires on any QR-code scan instruction regardless
of context), so a parking-specific entry would add nothing measurable. No
proposal.

### United States (`full`) — deep, two findings

See *Executive summary* and *Carried items* above for US-D1 (election fraud,
promoted from the carried item with fresh dedicated evidence) and US-D2 (IC3
self-impersonation, new). Full rule text in *Proposed detection improvements*.

### New Zealand (`full`) — light, no new finding

Netsafe's 1 September 2026 scam update (the most recent dated item found)
reports bank-impersonation complaints at their highest share of the year in
August (34%). This is a volume signal, not a new tactic or phrasing — NZ's
`TYPOSQUAT_WORD_BRANDS` (`anz`, `asb`, `bnz`, `tsb`) and `BRAND_MENTION_WORDS`
already cover the named banks, and the advice ("hang up, call the number on
your card") is unchanged. No proposal.

### Ireland (`full`) — light, no new finding

FraudSMART/Garda reporting on broadband-provider impersonation calls (callers
posing as Eir/Virgin Media claiming a fault, requesting remote-access
software or card-reader codes) — already covered by `base.ts`'s
`REQUEST_WORDS` (`teamviewer`, `anydesk`, `remote access`, `remote desktop`).
D8 (Fixed Charge Notice) carried unchanged — see *Carried items*.

### Canada (`partial`) — light, no new finding

The CAFC's own self-impersonation warning (scammers using the CAFC's name or
logo, continuing a trend first flagged in July 2026) is already covered:
`"cafc"` and `"canadian anti-fraud centre"` are both in `ca.ts`'s
`AUTHORITY_MENTIONS`, so an impersonator naming the Centre already earns
authority credit. The CAFC's H1-2026 fraud-loss figures ($351M, investment
fraud dominant) are a trend report, not a new tactic. No proposal.

### This cycle's rotation (`minimal` coverage): PH, VN, ZA, DE, IN

Consistent with the tier's own design (agencies and a reporting body only, no
brands, no campaign keywords, authored for languages this project has no
native reviewer for) — see `sg.ts`'s tier-rules comment, which every minimal
pack in this cycle follows. None of the five yielded a code-ready proposal
this cycle; two surfaced evidence worth recording as pack-seeding material
for a future, natively-reviewed deepening.

#### Philippines — light, no proposal

BSP's "text hijacking" warning (fraudulent messages inserted into a genuine
bank SMS thread, carrying a malicious link) describes a telecom/SIM-level
attack this detector cannot see from message content alone — the victim's
own bank's real messages are in the same thread, so there is no keyword or
sender-domain signal to add. PH's registered tier-1 sources
(`acg.pnp.gov.ph`, `sec.gov.ph`) were not independently re-probed this cycle
(their `expect: blocked` 403 status is unchanged per the registry); this
finding came from WebSearch snippets of secondary reporting only.

#### Vietnam — light, no proposal (native-review candidate)

An iMessage-delivered lure impersonating the Ministry of Public Security
(fake "red-light violation", 48-hour deadline, link on a non-government
domain) and a parallel VNPost parcel-delivery variant were both reported in
August 2026 coverage. VN's existing bare entries (`"bo cong an"`, `"ministry
of public security"`, `"vietnam post"`) already earn authority credit for
naming either body — but the urgency/deadline phrasing itself is Vietnamese,
and `vn.ts`'s `urgency` groups are deliberately empty by tier design (English
keyword authorship for a Vietnamese-reading population is exactly the
unverified claim the `minimal` tier declines to make). Noted on the watchlist
as native-review material, not filed.

#### South Africa — light, no proposal

SARS impersonation is seasonally active ahead of the 23 October 2026
individual-taxpayer deadline, matching the pattern `za.ts`'s own comments
already anticipated. `"sars"` is already a `caseSensitiveAuthorities` entry
in `za.ts` *and* present in `AUTHORITY_MENTIONS` — correctly wired, unlike
MX's — so the acronym-only lure ("SARS: ...") already earns authority
credit. No gap.

#### Germany — light, no proposal (native-review candidate)

Verbraucherzentrale's Phishing-Radar (tier-2, registered) logged two live
October 2026 brand-specific phishing waves: a fake comdirect "update your
account" email and a fake comdirect photoTAN-app-expiry email, plus a
separate fake-AOK-health-insurer "refund" email (€478.90, invented 7 October
deadline). `de.ts` carries no brands or campaign phrasing by design (tier
rules per `sg.ts`) — these are exactly the kind of evidence a future `full`
or `partial` DE pack would need, but authoring German keyword lists is
native-speaker-review work this cycle did not attempt. Recorded on the
watchlist as concrete pack-seeding evidence rather than filed.

#### India — light, no proposal

Indian Supreme Court directions to the RBI (4 Aug 2026) to issue a mule-account
SOP and explore an account "kill switch" are institutional/regulatory
developments, not a new consumer-facing text pattern. The "digital arrest"
script remains the obvious gap `in.ts`'s own header already names and
declines to fill for the same native-review reason as 2026-10-18 — unchanged,
stays **DEFERRED / BLOCKED**.

### Cross-region / country-independent tactics

No new base-layer finding this cycle. AI voice-clone scams continue
(an Orlando, FL case dated ~2 Oct 2026 — a cloned-voice "bail money" call) but
the phrasing is already fully inside `base.ts`'s `URGENCY_VOICE_CLONE`
("bail money", "don't tell mum/anyone", "stranded"/"stuck" framing).
Quishing (QR phishing) remains active — a 2026 FIFA World Cup domain wave and
a malformed-calendar-invite QR campaign were both reported this cycle — but
both are delivery-mechanism evolutions the generic QR-scan-prompt rule in
`checkSms` already catches regardless of the lure's theme; no new consumer
text shape to add. New-gTLD phishing concentration is unchanged since the
Interisle *Phishing Landscape 2025* figures already incorporated into
`SUSPICIOUS_TLDS`; no new TLD surfaced. One widely-syndicated German-language
claim of a joint "FBI and BaFin" QR-fraud warning this week could not be
corroborated against either agency's own material and is excluded as
low-quality — the two agencies' genuine, separate QR warnings are both
several years old (FBI 2022) or unrelated to this week.

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| US-D1 | Midterm election fraud (voter-registration phishing + "campaign investment pool") | Add `"not registered to vote"`, `"voter registration has been flagged"`, `"voter registration is inactive"` to `URGENCY_TAX_THREAT`; add `"campaign investment pool"` to `REWARD_WORDS` | `regions/us.ts` | US | MEDIUM | **HIGH** (time-sensitive — election 3 Nov 2026) |
| US-D2 | IC3 self-impersonation / recovery-fraud re-victimisation | Add `"ic3"`, `"internet crime complaint center"` to `AUTHORITY_MENTIONS` | `regions/us.ts` | US | LOW | **HIGH** |
| MX-D1 | Dead `caseSensitiveAuthorities` entries (correction of carried 2026-10-16 D4) | Add `"sat"`, `"ine"` to `AUTHORITY_MENTIONS` (bare, lower-case) — **not** the full names, which already exist; keep `caseSensitiveAuthorities: ["sat", "ine"]` unchanged so both route through `mentionsAsAcronym`. Add the missing subset-invariant assertion to `__tests__/acronymWordCollision.test.ts` (`caseSensitiveAuthorities ⊆ authorityMentions` for every pack) | `regions/mx.ts`, `__tests__/acronymWordCollision.test.ts` | MX (invariant: all packs) | LOW (verified: does not reopen the adversarial-probe FP — see *Corrections*) | **HIGH** |

### US-D1 — measured before/after

| Lure | Verdict today |
|---|---|
| `"Your voter registration has been flagged. Confirm at https://vrcheck2026.top before Nov 3 or you will not be able to vote."` | safe 15 (link only) |
| `"URGENT: your voter registration is inactive. Click here to reactivate before election day: https://vote-fix.cfd"` | suspicious 35 (generic urgency + link; no election-specific signal) |
| `"Join our campaign investment pool today - guaranteed returns once our candidate wins the midterm election."` | safe 12 ("guaranteed returns" alone) |

**Acceptance criteria:** the first lure should reach at least `suspicious`
from the new `URGENCY_TAX_THREAT` phrase alone (independent of the link);
the third should clear 20 (`suspicious`) once `"campaign investment pool"`
compounds with the existing `"guaranteed returns"` hit.

**FP note:** "voter registration is inactive" has no ordinary consumer use —
real election offices do not send unsolicited SMS/email with this framing.
"campaign investment pool" is a term with no legitimate political-fundraising
use (real campaign contributions are never framed as an investment with
returns); FP risk is low for both. Scored into `URGENCY_TAX_THREAT`'s shared
+10-per-hit/+35-cap group and `REWARD_WORDS` respectively, so neither reaches
`likely_scam` alone — consistent with every other entry in those groups.

### US-D2 — measured before/after

| Lure | Verdict today |
|---|---|
| `"IC3 case update: your lost funds have been located and are ready for release. A $200 processing fee is required to complete your recovery."` | safe 0 |
| `"We represent the Internet Crime Complaint Center and have recovered your stolen funds. A processing fee is required before release."` | safe 0 |

**Acceptance criteria:** both should earn the `+25` authority-mention credit
and, compounding with the existing base `REWARD_WORDS` recovery-fraud bait
("recover your stolen funds" already scores 12) and the small-fee lure rule
already in `checkSms`, clear `suspicious` (20) on the combined evidence.

**FP note:** "ic3" is a single token with no dictionary collision (unlike
`sat`/`ine`/`sars`/`sec`/`ice`) — it contains a digit, so ordinary English
cannot form it by accident, and `mentions()`'s automatic word-boundary
protection for short entries applies. No case-sensitivity gate is needed, so
this is a plain `AUTHORITY_MENTIONS` addition, not a `caseSensitiveAuthorities`
one. "internet crime complaint center" is a multi-word phrase with no
collision risk. The real IC3 never contacts people proactively or requests
payment, so a message naming it alongside a fee demand is as clean a signal
as this engine's agency-impersonation rules get.

### MX-D1 — see *Corrections*, above, for the full derivation and measured evidence.

---

## Pack-interface notes

None this cycle. All three proposals fit the existing `RegionDefinition`
shape exactly as documented (`AUTHORITY_MENTIONS` additions and a
`REWARD_WORDS`/`URGENCY_TAX_THREAT` addition) — no new field or composite is
needed.

---

## Region demand signal

Not measured this cycle. `lib/reportStore.ts`'s `region` column exists and is
written on every report (`storeReport`, `lib/reportStore.ts:256`), but the
production libSQL/Turso database is not reachable from this research
environment, and no local SQLite fallback (`local.db`) exists in this
checkout, nor are any Turso connection environment variables set. This is
the same finding every prior cycle recorded — no figures are estimated or
invented in its place.

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Weekly region, re-checked five live lure families against this week's reporting; all already covered, no new AU-specific lead |
| GB | light | QR-parking quishing council warnings re-checked; already covered generically |
| US | deep | Two findings — US-D1 (promoted, time-sensitive) and US-D2 (new) |
| NZ | light | Netsafe bank-impersonation volume note re-checked; no new tactic |
| IE | light | FraudSMART/Garda broadband-impersonation re-checked; already covered. D8 carried, unchanged |
| CA | light | CAFC self-impersonation and H1-2026 figures re-checked; already covered |
| PH | light | BSP "text hijacking" reviewed; telecom-level attack, no content signal to add |
| VN | light | iMessage MPS/VNPost impersonation reviewed; agency names already covered, urgency phrasing needs native review |
| ZA | light | SARS seasonal impersonation reviewed; already correctly wired (unlike MX) |
| DE | light | Verbraucherzentrale Phishing-Radar reviewed; comdirect/AOK brand phishing is real pack-seeding evidence, needs native review |
| IN | light | SC/RBI mule-account SOP reviewed; institutional news, not a text pattern. "Digital arrest" stays deferred |
| AE, BR, ES, FR, ID, IT, JP, KE, KR, NG, NL, PL, SE, SG, TH | skipped | Not in this cycle's weekly or rotation list |

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| IE D8 — Fixed Charge Notice phrasing | **OUTSTANDING, unfiled** | Unchanged; FraudSMART has nothing newer, `garda.ie` still unreachable; exact proposed phrasing from earlier cycles not available to this run |
| VN — MPS/VNPost impersonation urgency phrasing | **NEEDS NATIVE REVIEW — new** | iMessage-delivered "red-light violation" + 48hr-deadline lure; agency names already covered, Vietnamese urgency phrasing is not |
| DE — comdirect/AOK brand-specific phishing | **NEEDS NATIVE REVIEW — new** | Live, dated (Oct 2026) evidence from a registered tier-2 source that DE's `minimal` tier is leaving real brand impersonation uncaught; pack-seeding material for a future deepening, not a code change |
| IN — "digital arrest" script | **DEFERRED / BLOCKED** | Unchanged; multilingual phrasing judgement the `minimal` tier declines to make |
| PH — BSP "text hijacking" (SMS-thread injection) | **MONITORING — new** | Telecom/SIM-level attack with no message-content signal available to this detector; worth re-reading if a text-shape element emerges |
| GB benign direct-debit confirmation scores `suspicious 40` (Octopus Energy) | **PROBE LEAD** | Carried from earlier cycles, not re-measured this cycle |
| NG regulator-named platforms (WayvePay, Gvest) in `fakeInvestmentPlatforms` | **NEEDS POLICY DECISION** | Carried, unchanged — not re-researched this cycle |
| TH `tcsd.in.th` serves a placeholder page | **PACK HYGIENE** | Carried, unchanged — not re-researched this cycle |
| IT AdE IRPEF-refund / Bonus Vacanze phrasing | **NEEDS NATIVE REVIEW** | Carried, unchanged — IT not in this cycle's rotation |
| KR post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW** | Carried, unchanged — KR not in this cycle's rotation |
| ES / FR / BR / ID native-review items | **NEEDS NATIVE REVIEW** | Carried, unchanged — none in this cycle's rotation |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced this cycle |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED** | Carried, unchanged |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| FBI IC3 — PSA index (I-101526-3-PSA, 15 Oct 2026) | 1 | US-D1 |
| FBI public warning on IC3 impersonation (~19 Aug 2026, widely syndicated) | 2 (secondary reporting; no primary ic3.gov PSA number located) | US-D2 |
| CommBank newsroom (Mar 2026) | 2 | AU bank-impersonation re-check |
| Services Australia — Medicare/Centrelink scam pages | 1 | AU cost-of-living re-check |
| Bitdefender — toll/parking smishing campaign reporting | 2 | AU/GB toll-smishing re-check |
| Scamwatch / NASC — standing warrant/warning pages (via WebSearch snippet; page not fetchable) | 1 | AU digital-arrest re-check |
| UK council pages (Canterbury, Conwy, etc.) on QR parking fraud | 2/3 | GB quishing re-check |
| Netsafe — scam update, 1 Sept 2026 | 2 | NZ bank-impersonation re-check |
| FraudSMART / An Garda Síochána reporting (via WebSearch snippet) | 1/2 | IE broadband-impersonation re-check |
| Canadian Anti-Fraud Centre — self-impersonation notice, H1-2026 figures | 1 | CA re-check |
| BSP (Philippines) — text-hijacking warning | 1 | PH |
| Lao Dong / secondary VN reporting on iMessage MPS/VNPost impersonation | 2/3 | VN |
| BusinessTech / IOL — SARS seasonal impersonation | 2 | ZA |
| Verbraucherzentrale — Phishing-Radar, Oct 2026 entries | 2 (registered) | DE |
| Indian Supreme Court order (4 Aug 2026) / secondary legal reporting | 1/2 | IN |
| Interisle *Phishing Landscape 2025* (already incorporated; re-confirmed unchanged) | 2 (measurement) | Cross-region TLD re-check |

No new sources are proposed for `sources.yml` this cycle.

---

## Issues opened

All three HIGH proposals were filed as GitHub issues (checked against
existing issues first via `search_issues` — no duplicates found):

| ID | Issue | Priority |
|---|---|---|
| US-D1 | [#494 — US: midterm election fraud lures](https://github.com/alekslinde/veriguard/issues/494) | HIGH |
| US-D2 | [#495 — US: IC3 impersonation](https://github.com/alekslinde/veriguard/issues/495) | HIGH |
| MX-D1 | [#496 — MX: fix dead caseSensitiveAuthorities entries](https://github.com/alekslinde/veriguard/issues/496) | HIGH |

Full issue text, kept below for the record (identical to what was filed):

### US-D1 — Midterm election fraud lures (voter-registration phishing + "campaign investment pool")

**Title:** `[threat-intel] US — midterm election fraud lures`

**Body:**

Promotes the carried 2026-10-16 D3 / 2026-10-18 D3 item with fresh, dedicated
evidence: FBI IC3 PSA I-101526-3-PSA (15 Oct 2026), "Scammers Exploit 2026
U.S. Midterm Election to Perpetrate Multiple Fraud Schemes," names exactly
the two lure shapes below. The 2026 midterm election is 3 November 2026 — 9
days from this roadmap's date.

**Proposed rule** (`packages/detect/src/regions/us.ts`):
- Add to `URGENCY_TAX_THREAT`: `"not registered to vote"`, `"voter registration has been flagged"`, `"voter registration is inactive"`
- Add to `REWARD_WORDS`: `"campaign investment pool"`

**Measured before (today, `US` region):**
- `"Your voter registration has been flagged. Confirm at https://vrcheck2026.top before Nov 3 or you will not be able to vote."` → **safe 15** (link only)
- `"Join our campaign investment pool today - guaranteed returns once our candidate wins the midterm election."` → **safe 12** ("guaranteed returns" alone)

**Acceptance criteria:** the first lure reaches at least `suspicious` from
the new phrase alone; the second clears 20 once the new phrase compounds with
the existing "guaranteed returns" hit.

**FP risk:** LOW–MEDIUM. Neither phrase has ordinary consumer use; both are
scored into existing capped/additive groups so neither reaches `likely_scam`
alone.

**Roadmap:** `docs/threat-intel/2026-10-25-threat-roadmap.md`, proposal US-D1.

---

### US-D2 — IC3 self-impersonation / recovery-fraud re-victimisation

**Title:** `[threat-intel] US — IC3 impersonation (recovery-fraud re-victimisation)`

**Body:**

New finding. FBI public warning (~19 Aug 2026, widely syndicated across local
US news affiliates): scammers pose as staff of the FBI's Internet Crime
Complaint Center (IC3) to re-victimise people who already reported fraud to
it, via calls, email, social media, fake IC3 websites and AI deepfake videos,
typically claiming funds have been "recovered" and demanding a release fee.
IC3 has no social-media presence and does not investigate crimes or recover
funds through any of those channels.

**Proposed rule** (`packages/detect/src/regions/us.ts`): add `"ic3"`,
`"internet crime complaint center"` to `AUTHORITY_MENTIONS`.

**Measured before (today, `US` region):**
- `"IC3 case update: your lost funds have been located and are ready for release. A $200 processing fee is required to complete your recovery."` → **safe 0**
- `"We represent the Internet Crime Complaint Center and have recovered your stolen funds. A processing fee is required before release."` → **safe 0**

**Acceptance criteria:** both reach `suspicious` once the new `+25` authority
credit compounds with the existing base recovery-fraud `REWARD_WORDS` and the
small-fee lure rule already in `checkSms`.

**FP risk:** LOW. `"ic3"` contains a digit, so it has no dictionary
collision and needs no case-sensitivity gate (unlike `sat`/`ine`/`sars`); the
full name is a multi-word phrase with no collision risk.

**Roadmap:** `docs/threat-intel/2026-10-25-threat-roadmap.md`, proposal US-D2.

---

### MX-D1 — Correction + fix of the carried `caseSensitiveAuthorities` gap

**Title:** `[threat-intel] MX — fix dead caseSensitiveAuthorities entries (sat/ine), add missing subset test`

**Body:**

Corrects the carried 2026-10-16 D4 / 2026-10-18 D2 item. That item proposed
adding `"sat"` and `"ine"` to `AUTHORITY_MENTIONS` as the fix for
`caseSensitiveAuthorities: ["sat", "ine"]` being unreachable dead code.
`mx.ts`'s own current comments document why that specific fix is wrong: a
bare, case-insensitive `"sat"`/`"ine"` entry reopens an adversarial-probe
false positive (`"I sat on the porch... fine wine"` reads as government-agency
impersonation, since both acronyms are ordinary Spanish/English words).

The correct fix is the same pattern AU uses for `sec`/`ice` and ZA for
`sars`: add `"sat"` and `"ine"` to `AUTHORITY_MENTIONS` **while keeping them
in `caseSensitiveAuthorities`**, so `scamDetector.ts`'s `authorityIn()` helper
routes them through `mentionsAsAcronym` (literal-caps-only matching) rather
than plain `mentions()`.

**Measured directly against `mentionsAsAcronym`:**
```
mentionsAsAcronym("I sat on the porch all afternoon drinking fine wine.", "sat") → false
mentionsAsAcronym("I sat on the porch all afternoon drinking fine wine.", "ine") → false
mentionsAsAcronym("SAT: tienes un adeudo fiscal pendiente, regulariza hoy.", "sat") → true
mentionsAsAcronym("INE: tu credencial para votar ha sido suspendida.", "ine") → true
```

**Measured today, full pipeline (`MX` region):**
- `"SAT: tienes un adeudo fiscal pendiente. Regulariza hoy en https://sat-pagos.top"` → **unknown 15** (link only, no agency credit)

**Proposed rule** (`packages/detect/src/regions/mx.ts`): add `"sat"`, `"ine"`
to `AUTHORITY_MENTIONS` (bare, lower-case — the full expanded names already
present are unaffected). Leave `caseSensitiveAuthorities` unchanged.

**Also add:** a test to `__tests__/acronymWordCollision.test.ts` asserting
`caseSensitiveAuthorities ⊆ authorityMentions` for every region pack.
`types.ts`'s doc comment for `caseSensitiveAuthorities` already claims this
is "enforced by `acronymWordCollision.test.ts`"; it is not, which is how this
exact defect (MX) went three cycles unfixed and uncaught by any test.

**Acceptance criteria:**
- `"SAT: tienes un adeudo fiscal pendiente..."` → agency credit, reaching at least `suspicious`.
- `"I sat on the porch all afternoon drinking fine wine."` → unchanged, no agency-mention flag.
- The new subset test fails on main *before* this fix ships (MX currently violates it) and passes after.

**FP risk:** LOW — verified above not to reopen the collision the carried
proposal would have.

**Roadmap:** `docs/threat-intel/2026-10-25-threat-roadmap.md`, proposal MX-D1.
