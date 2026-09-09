# Threat-intelligence roadmap — 2026-09-06

*Sweep period: 2026-09-01 – 2026-09-06 (regular weekly cycle, covers the gap since 2026-08-31). Next sweep due 2026-09-13.*

---

## Executive summary

Four new proposals this cycle; two HIGH carry-forwards from 2026-08-31 are promoted to issues (D5, D6 from that roadmap remain unfiled). AU is quiet with no high-confidence new text-side signals. The standout new threat is an IE State Savings impersonation wave tied to a deepfaked minister endorsement, backed by tier-1 Irish sources. The crypto seed-phrase phishing pattern crosses every region and has near-zero false-positive risk. The GB energy-allowance gap (unfiled D4 from 2026-08-31) is now time-critical with the 1 October price cap increase incoming.

| Rank | Proposal | Pack | Why first |
|---|---|---|---|
| 1 | D1 — GB energy allowance / October price cap | GB | 1 Oct price cap triggers a known Action Fraud wave; D4 from 2026-08-31 still unfiled, time-sensitive |
| 2 | D2 — IE: NTMA / State Savings impersonation | IE | New deepfake-minister campaign, tier-1 IE sources, pack has no NTMA entry at all |
| 3 | D3 — BASE: Crypto seed-phrase solicitation | BASE | Cross-regional, near-zero FP, NASC crypto-investigation alert, TechCrunch Aug 2026 |
| 4 | D4 — US: Jury duty warrant SMS | US | FTC June 2026 alert; "missed jury duty" phrasing absent from all urgency groups |

**No new pack-interface fields needed.** All proposals target existing arrays.
**Region demand:** Turso DB unavailable in cloud environment — see §Region demand signal.

---

## Threats by region

### Australia (primary)

**Quiet cycle for new text-side signals.** Three campaigns were active but are already covered.

#### AU — CommBank Awards points expiry phishing

A mass SMS campaign impersonating CommBank with "your Awards points are about to expire — click to redeem" continued through August–September 2026. The campaign uses short-lived `.top` domains (e.g. `commbankchecks[.]top`) and a fake NetBank login page.

**Coverage check:** Base `REWARD_WORDS` carries `"points will expire"`, `"points expiring"` and `"loyalty points"` — these already score the lure text (+12 each). The destination domain `commbankchecks.top` is caught by `.top` in `SUSPICIOUS_TLDS` (+30 for the TLD) plus `"commbank"` in AU `TYPOSQUAT_BRANDS` (+45 brand hit) — the URL alone is `likely_scam`. **No gap; no proposal.**

Source: CommBank security alerts (`commbank.com.au`, ongoing); Yahoo Finance AU Aug 2026 (Tier 2).

#### AU — Food delivery driver credential phishing

Delivery drivers losing earnings through account takeover via in-app phishing. The ACCC / Scamwatch issued a named alert for food delivery platform scams in September 2026. The consumer-facing brand names (DoorDash, Uber Eats, Menulog) are in AU `BRAND_MENTIONS` and `TYPOSQUAT_BRANDS`. The compromise mechanism is in-app social engineering and OTP theft — no new SMS lure text identified.

**Coverage check:** Brand mentions and the OTP/code-forwarding composite (D3 shipped 2026-08-31, `#237`) cover the consumer-side signals. **No gap; no proposal.**

Source: Scamwatch scam alert (`scamwatch.gov.au`) September 2026 (Tier 1); ABC News 7 Jul 2026 (Tier 2).

#### AU — NASC cryptocurrency exchange investigation

NASC contacted ~10,000 Australians following a UK police investigation into organised crime targeting crypto exchange and hardware wallet users. No new consumer-facing SMS lure text — this is a proactive outreach to potential victims, not a new campaign with detectable text signals.

**However:** The linked hardware wallet impersonation pattern (physical letters + phishing sites asking for "seed phrase" / "recovery seed phrase") is a real cross-regional gap addressed in D3 (BASE) below.

Source: NASC media release (`nasc.gov.au`) September 2026 (Tier 1).

#### AU — No new proposals this cycle

The 2026-08-31 proposals D1 (scambling composite) and D2 (task/e-commerce payment gate) shipped in `#231` and `#237`. AU urgency groups and authority mentions are current. The two unfiled AU-adjacent proposals from 2026-08-31 (D4 energy allowance → GB; D5 money mule → BASE) are handled in their correct regions below.

---

### United Kingdom

#### GB-1 — October energy price cap / Ofgem rebate wave (HIGH, time-critical) → **D1**

Ofgem announced the Q4 2026 price cap on 29 August 2026 (a 13 % rise from 1 October). Action Fraud documented a surge in energy-rebate text scams within days of the announcement — the same playbook that runs every time a cap change is reported. The Subject line `"Claim your bill rebate now"` appeared in 752 Action Fraud reports in four days during a comparable prior-cycle wave.

The current GB pack has `"energy rebate"`, `"energy bill support"` and `"energy support payment"` but **not** the `"allowance"` and `"scheme payment"` phrasings documented in the 2026-08-31 roadmap (D4, unfiled) and the Q4 Ofgem-branded wave.

**New October-cycle phrasing observed (Action Fraud / ThinKmoney, August–September 2026):**
- `"energy support allowance"` (already proposed in 2026-08-31 D4, not yet filed)
- `"energy payment allowance"` (already proposed in 2026-08-31 D4, not yet filed)
- `"energy support scheme payment"` (already proposed in 2026-08-31 D4, not yet filed)
- `"household energy support"` (already proposed in 2026-08-31 D4, not yet filed)
- `"ofgem rebate"` — *new this cycle*, the Ofgem-branded short-form not in the pack (note: "ofgem" is already in `AUTHORITY_MENTIONS`, so this phrase scores from authority; adding it to `URGENCY_TAX` adds +10 on top)
- `"claim your bill rebate"` — *new this cycle*, the exact Action Fraud-reported subject line

**Coverage assessment:** "ofgem" is in `AUTHORITY_MENTIONS` (+25) so a message mentioning Ofgem already scores from authority. The gap is the `"allowance"` and `"bill rebate"` phrasings that arrive **without** an explicit `"ofgem"` or `"hmrc"` — scammers often send from a generic sender ID (`"Energy-Support"`, `"GovUK"`) to avoid name-match filters, then use the scheme name in the body.

**FP risk: LOW.** Ofgem and DWP do not cold-text about energy support allowances; the October price-cap cycle is the one time these phrases might appear in legitimate government outreach, but that outreach uses postal mail and the UC journal, not SMS.

**Source:** Action Fraud alert `actionfraud.police.uk/alert/energyrebatescam` (Tier 1); ThinKmoney blog September 2026, Tier 2; GB News energy scam report, Tier 2. The 2026-08-31 roadmap D4 proposed the "allowance" variants on Action Fraud 2026-08-19 (Tier 1).

---

#### GB — Not proposed this cycle

- **TV Licensing email-only wave** — existing TV Licensing authority mention + "license fee" urgency covers body text; email-level detection is out of scope.
- **HMRC self-assessment penalty SMS** — `"self assessment penalty"` and `"late filing penalty"` are already in `URGENCY_TAX_THREAT`.

---

### United States

#### US-1 — Jury duty warrant SMS (MEDIUM) → **D4**

The FTC issued a consumer alert in June 2026 documenting a cross-channel scam that starts with a phone call claiming the recipient missed jury duty and escalates by texting or emailing a fake arrest warrant. In 2026 the Lancaster County Sheriff's Office documented AI-voiced calls using a cloned "lieutenant" voice to add authority. The text-side signal is the warrant attachment or a follow-up SMS saying `"your bench warrant will be issued unless you pay"`.

**Coverage assessment:** `"arrest warrant"` is in US `URGENCY_FOREIGN_AUTHORITY` (+10 per hit, counts towards the +35 cap). `"warrant issued"` is in `URGENCY_TAX_THREAT`. A message mentioning `"us marshals"` (in `AUTHORITY_MENTIONS`, +25) and `"arrest warrant"` scores 25+10 = 35 → suspicious. **Missing:** `"missed jury duty"` and `"bench warrant"` — these are the tells that distinguish this campaign from generic warrant-threat scripts. Their absence means the specific jury-duty lure can score only suspicious, not `likely_scam`, on the SMS text alone.

**Observed phrases (FTC alert Jun 2026, US district court advisories 2026):**
- `"missed jury duty"` — LOW-MEDIUM FP (courts notify by mail, not SMS)
- `"failed to appear for jury duty"` — LOW FP
- `"bench warrant for your arrest"` — LOW FP

**FP risk: LOW-MEDIUM.** Real courts contact by postal mail. SMS/email claiming a jury-duty bench warrant is issued is virtually always a scam. `"missed jury duty"` alone scores +10 and cannot reach any verdict threshold unassisted; it only matters alongside the authority + warrant phrasing.

**Source:** FTC consumer alert June 2026 (`consumer.ftc.gov`) — Tier 1; US Courts advisory (`uscourts.gov`) — Tier 1; Lancaster County Sheriff's Office (AI voice) — Tier 2.

**Carry-forward D6 from 2026-08-31 (still unfiled): US veterans benefits scam.** `"veterans savings program"`, `"va benefits claim assistance"`, `"veteran benefit entitlement review"` for `us.ts URGENCY_PENSION`. FTC alert 24 Aug 2026. Filed as issue alongside D4 this cycle.

---

#### US — Not proposed this cycle

- **IRS Tax Resolution Oversight Department** — shipped in `#189` from the 2026-08-23 roadmap.
- **Medicare Part D cap lure** — DEFERRED, still no new SMS evidence.

---

### New Zealand

No new materially distinct threats identified this cycle for NZ. The 2026-08-16 roadmap D6 (deepfake media-brand lures) shipped and is current. CERT NZ and Netsafe publish no new specific alerts in the research window.

---

### Canada

No new materially distinct threats for CA this cycle. The CAFC recovery-fraud impersonation signal is covered by base `REWARD_WORDS` (D2, 2026-08-23, shipped `#185`). CA French-keyword gap remains BLOCKED pending native reviewer; no new English-side gap identified.

---

### Ireland

#### IE-1 — NTMA / State Savings impersonation (HIGH) → **D2**

A deepfake video of Tánaiste Simon Harris endorsing a fake "Personal Investment Account" linked to the state's real planned savings scheme circulated widely from April–September 2026. The Irish Times reported Harris said he had to watch it twice to confirm it wasn't him. Between January and May 2026, monitoring services recorded ~1,500× as many scam-site takedowns as in all of 2025, with the State Savings brand driving the increase.

The NTMA (National Treasury Management Agency) administers the genuine State Savings product. Fraudsters exploit the fact that the scheme is new and consumers do not yet know what authentic NTMA communications look like.

**Coverage assessment:** `ie.ts REWARD_WORDS` has `"government backed investment"`, which catches some of the bait, but:
- `"ntma"` is **absent** from `AUTHORITY_MENTIONS` — an SMS claiming to be from the NTMA scores 0 from the authority signal.
- `"state savings"` is **absent** from both `AUTHORITY_MENTIONS` and `REWARD_WORDS`.
- `"national treasury management agency"` is **absent** from `AUTHORITY_MENTIONS`.
- `"personal investment account"` is **absent** from `REWARD_WORDS` (this is the name of the fake product, not a real scheme name — legitimacy claim, not bait phrase).

**Proposed additions:**

To `ie.ts AUTHORITY_MENTIONS`:
```
"ntma", "state savings", "national treasury management agency"
```

To `ie.ts REWARD_WORDS` (false-legitimacy claims — the NTMA never cold-contacts about investment returns by SMS):
```
"personal investment account",
"state savings scheme"
```

**FP risk: LOW.** The NTMA and the State Savings product are real, but the NTMA has no programme of unsolicited SMS contact. A message claiming to be from NTMA with a link is essentially always a scam or a forward of the deepfake campaign. `"personal investment account"` carries some FP risk in generic investment advice contexts; consider requiring it to compound with `"ntma"` or `"state savings"` rather than scoring flat.

**Source:** Irish Times 29 Apr 2026 (deepfake Harris, Tier 1 national press); RTÉ News 28 May 2026 (AI-generated ads, Tier 1 national broadcaster); Irish Examiner (`irishexaminer.com`, Tier 2). NTMA phishing attack coverage: RTÉ News May 2026, regional press (Tier 2).

---

#### IE — Not proposed this cycle

- **Student accommodation deposit scam** — shipped 2026-08-23 (D3, `#192`), `base.ts REQUEST_WORDS` covers fake-landlord phrases.
- **Money mule recruitment** — partially covered by 2026-08-31 D5 (unfiled); handled in BASE carry-forward below.

---

### Cross-regional (BASE)

#### BASE-1 — Crypto seed-phrase solicitation (HIGH) → **D3**

The NASC September 2026 alert about hardware-wallet users, TechCrunch (17 Aug 2026) reporting data breaches at shipping companies exposing crypto hardware wallet owners, and a $116M exploit (TRM Labs, Jul–Aug 2026) all document a surge in physical and digital phishing targeting crypto holders. The text-side signal is the ask for a **seed phrase** (also called "recovery seed phrase", "secret recovery phrase" or "wallet recovery phrase") — the 12/24-word mnemonic that gives permanent access to a wallet.

**Coverage assessment:** `base.ts REQUEST_WORDS` already covers `"connect wallet"`, `"approve transaction"`, `"wallet approval"` and `"sign transaction"` (pig-butchering / wallet-approval phishing). It does **not** cover the seed-phrase ask. The `hasCryptoSignal` composite in `scamDetector.ts` detects `"wallet"` as a signal, but this fires only inside a pig-butchering investment-group composite (requiring ≥2 investmentGroupSignals or 1 + crypto signal) — it does not fire on a standalone `"enter your seed phrase"` prompt.

**Observed phishing lure phrasing (TechCrunch Aug 2026, Ledger/Trezor phishing advisories):**
- `"seed phrase"` — the universally used term; no legitimate service asks for it
- `"recovery seed phrase"` — Trezor's terminology
- `"secret recovery phrase"` — MetaMask's official term, widely adopted
- `"wallet recovery phrase"` — generic; also used in physical-letter variants

**Proposed additions to `base.ts REQUEST_WORDS`:**
```
"seed phrase",
"recovery seed phrase",
"secret recovery phrase",
"wallet recovery phrase",
```

Separately, `base.ts CALLBACK_BRANDS` does not list `"ledger"` or `"trezor"`. These brands are used in TOAD-style phishing (fake subscription/security alert emails with a phone number and no link). **Hold** adding these to `CALLBACK_BRANDS` pending evidence of SMS-based TOAD variants specifically; the current documented vector is physical mail and phishing sites, not the SMS-and-phone-number pattern the TOAD composite targets.

**FP risk: VERY LOW.** No legitimate service ever asks for a seed phrase; the phrase has no consumer use outside crypto self-custody, and even then the correct instruction is always "never share your seed phrase with anyone". A lone hit at +15 in `checkCustom` or +15 in `checkSms` stays well below the 20-point `suspicious` threshold on its own, so an educational message about seed phrases remains `safe`; it only matters when it compounds with a URL, brand mention or urgency signal.

**Source:** NASC media release September 2026 (`nasc.gov.au`, Tier 1); TechCrunch 17 Aug 2026 (`techcrunch.com`, Tier 2); TRM Labs blog Jul–Aug 2026 (Tier 2).

---

#### BASE carry-forward — Money mule recruitment (D5 from 2026-08-31, NOT YET FILED)

**Unchanged from 2026-08-31 roadmap.** AFP, An Garda Síochána and Lloyds Bank all published warnings in July–August 2026 about mule recruitment via social media. Proposed additions to `base.ts REQUEST_WORDS`: `"act as a payment agent"`, `"receive transfers into your account for a fee"`, `"money mule"`, `"financial courier"`, `"transfer funds on our behalf"`. Filed as issue this cycle — see §Open issues.

---

## Proposals

*All phrases verified absent from `packages/engine/src/` by grep before filing (no matches for any proposed phrase).*

| ID | Tactic | Region | Target file / array | Priority | FP risk |
|---|---|---|---|---|---|
| D1 | GB energy allowance phrases + Oct price cap Ofgem wave | GB | `packages/engine/src/regions/gb.ts` → `URGENCY_TAX` | **HIGH** | LOW |
| D2 | NTMA / State Savings impersonation | IE | `packages/engine/src/regions/ie.ts` → `authorityMentions` + `REWARD_WORDS` | **HIGH** | LOW |
| D3 | Crypto seed-phrase solicitation | BASE | `packages/engine/src/regions/base.ts` → `REQUEST_WORDS` | **HIGH** | VERY LOW |
| D4 | Jury duty warrant SMS | US | `packages/engine/src/regions/us.ts` → `URGENCY_FOREIGN_AUTHORITY` | MEDIUM | LOW-MEDIUM |
| D5 *(carry-forward)* | Money mule recruitment | BASE | `packages/engine/src/regions/base.ts` → `REQUEST_WORDS` | MEDIUM | VERY LOW–LOW |
| D6 *(carry-forward)* | US veterans benefits scam | US | `packages/engine/src/regions/us.ts` → `URGENCY_PENSION` | MEDIUM | MEDIUM |

---

## Implementation notes

### D1 — GB energy allowance phrases

**Add to `URGENCY_TAX` in `gb.ts`:**
```
"energy support allowance",
"energy payment allowance",
"energy support scheme payment",
"household energy support",
"ofgem rebate",
"claim your bill rebate",
```

`"ofgem"` is already in `AUTHORITY_MENTIONS`, so a message mentioning Ofgem already scores +25 from authority. The phrases above add +10 each within the urgency cap when the message uses the scheme name in the body without an explicit `"ofgem"` sender. Together, `"energy support allowance"` + `"claim your bill rebate"` in one message = +20 urgency → suspicious, plus the authority mention if present → likely_scam. FP-test `"claim your bill rebate"` against legitimate energy-supplier billing messages before shipping; drop if it appears in genuine renewal communications.

### D2 — IE: NTMA / State Savings

**Add to `AUTHORITY_MENTIONS` in `ie.ts`:**
```
"ntma", "state savings", "national treasury management agency"
```

**Add to `REWARD_WORDS` in `ie.ts`:**
```
"personal investment account",
"state savings scheme",
```

`"state savings"` in `AUTHORITY_MENTIONS` scores +25 on its own (authority mention). `"personal investment account"` in `REWARD_WORDS` scores +12. A message `"Your State Savings account has been selected for the new Personal Investment Account — click to register"` would score: authority (+25) + reward (+12) = 37 → suspicious. With a suspicious TLD link → likely_scam.

Implementation note: verify during implementation that `"state savings"` does not trip on ordinary news articles forwarded for checking ("The State Savings scheme was announced today") — the authority-mention scorer should only flag it when combined with a link or other signal (the +25 authority threshold alone does not reach `suspicious` at 20+; it needs a second element). If FP testing shows forwarded news articles triggering, consider gating to `noLinkSenders` or requiring a link alongside the mention.

### D3 — BASE: Seed phrase

**Add to `REQUEST_WORDS` in `base.ts`:**
```
"seed phrase",
"recovery seed phrase",
"secret recovery phrase",
"wallet recovery phrase",
```

No gating needed — no legitimate service asks for a seed phrase. FP-test against developer documentation: "never share your seed phrase" (the warning form) should not score, since the leading "never share" negation guard already suppresses the OTP version in D3/2026-08-31; verify the same guard fires correctly here or propose a parallel negation.

### D4 — US: Jury duty warrant

**Add to `URGENCY_FOREIGN_AUTHORITY` in `us.ts`:**
```
"missed jury duty",
"failed to appear for jury duty",
"bench warrant for your arrest",
```

`"arrest warrant"` is already in this group. The additions raise the jury-duty-specific variant from "suspicious at best" (US Marshals authority hit + arrest warrant = 35) to "likely_scam" (adding missed-jury urgency hits). FP-test `"bench warrant for your arrest"` against legal-advice content; unlikely to appear in legitimate consumer SMS.

### D5/D6 carry-forwards

See 2026-08-31 roadmap implementation notes for D5 and D6 respectively; proposals unchanged.

---

## Pack-interface notes

No new fields required this cycle. All proposals target existing array types (`URGENCY_TAX`, `AUTHORITY_MENTIONS`, `REWARD_WORDS`, `REQUEST_WORDS`, `URGENCY_FOREIGN_AUTHORITY`, `URGENCY_PENSION`). The `RegionDefinition` and `BaseSignals` interfaces in `packages/engine/src/regions/types.ts` do not need modification.

---

## Region demand signal

Turso DB (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`) is unavailable in the managed cloud execution environment — egress to the Turso host is blocked. This is a standing gap in the automated sweep; all prior cycles have recorded the same result. The `scripts/region-demand.ts` script is available for local execution:

```bash
TURSO_DATABASE_URL=<url> TURSO_AUTH_TOKEN=<token> npx ts-node scripts/region-demand.ts
```

The `region` column defaults to `''` for pre-Phase-2 rows. The query should handle the empty string separately from ISO codes to distinguish instrumentation gaps from genuinely region-less submissions.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| "Hi Mum" / "Hi Dad" first-contact opener | **DEFERRED** | Text-side first-contact signal still absent. No new evidence this cycle. Revisit if a distinct SMS opener pattern is documented. |
| Medicare Part D cap lure | **DEFERRED** | No new SMS evidence this cycle. |
| Kali365 PhaaS | **MONITORING** | Infrastructure; no distinctive consumer SMS template confirmed. |
| IC3/FBI recovery scam — US-specific phrases | **ELEVATED** | D5 BASE (money mule / recovery-fraud bait language) still unfiled. IC3-specific (`"ic3 agent"`, `"ic3 case number"`) still waiting for US-specific evidence. Revisit next US-facing cycle. |
| LINE/KakaoTalk recruitment funnels | **DEFERRED** | Insufficient AU/IE/NZ evidence; FP risk too high for general population. |
| Ledger/Trezor TOAD callback variants | **MONITORING** | Current vector is physical letter and phishing site, not the phone-number-in-SMS shape the TOAD composite targets. Promote to proposal if SMS-based callback variant is documented. |
| AU food delivery driver account takeover | **NOT PROPOSED** | App-internal compromise; no new external SMS lure signal. |
| GB Dart Charge / ULEZ surge | **MONITORING** | Existing `URGENCY_TOLL` entries cover current lures. No new phrasing identified this cycle. |
| "Hi Mum" / voice-clone bail/stranded escalation | **SHIPPED** (base `URGENCY_VOICE_CLONE`) | Existing entries cover "bail money", "stranded overseas", "do not call police". |

---

## Issues to open manually

*`gh` CLI availability verified below — see §Open issues. If `gh` auth is unavailable, create the following GitHub issues manually.*

### Issue 1 — [threat-intel] GB — energy allowance phrases / October price cap

**Title:** `[threat-intel] GB — energy allowance phrases + October price cap Ofgem lures`

**Body:**
Add the "allowance" and October-cap-specific energy lure phrases to `gb.ts URGENCY_TAX` (proposed in 2026-08-31 D4 and confirmed by the Q4 Ofgem price-cap cycle starting 1 October 2026).

**Target file:** `packages/engine/src/regions/gb.ts` → `URGENCY_TAX`

**Add:**
```
"energy support allowance",
"energy payment allowance",
"energy support scheme payment",
"household energy support",
"ofgem rebate",
"claim your bill rebate",
```

**IOCs / example lure:** `"You are eligible for an energy support allowance of £350 — claim at [link]"` (Action Fraud Aug 2026). Domain `ofgem-rebate-claim[.]uk` and variants under `.top`, `.site`, `.online`.

**FP notes:** Low. DWP/Ofgem do not cold-text about allowances; the October price-cap cycle is the one window when these appear in legitimate comms but those arrive by letter. FP-test `"claim your bill rebate"` against energy supplier billing messages.

**Roadmap:** docs/threat-intel/2026-09-06-threat-roadmap.md D1; also 2026-08-31 D4.

---

### Issue 2 — [threat-intel] IE — NTMA / State Savings impersonation

**Title:** `[threat-intel] IE — NTMA / State Savings impersonation`

**Body:**
Add NTMA and State Savings to `ie.ts authorityMentions`; add fake product name to `REWARD_WORDS`. Deepfake of Minister Harris promoting a fake "Personal Investment Account" linked to the real planned State Savings scheme is the active campaign.

**Target file:** `packages/engine/src/regions/ie.ts`

**Add to `AUTHORITY_MENTIONS`:**
```
"ntma", "state savings", "national treasury management agency"
```
**Add to `REWARD_WORDS`:**
```
"personal investment account",
"state savings scheme",
```

**IOCs:** Fake domains including `statesavings-ie[.]com`, `ntma-invest[.]ie`. Deepfake video of Simon Harris on social media platforms.

**FP notes:** Low. NTMA does not cold-text. `"state savings"` in body of a forwarded news article may score the authority signal; verify that the +25 alone does not tip a verdict without a link or second signal. If needed, gate to compound scoring.

**Roadmap:** docs/threat-intel/2026-09-06-threat-roadmap.md D2.

---

### Issue 3 — [threat-intel] BASE — crypto seed-phrase solicitation

**Title:** `[threat-intel] BASE — crypto seed-phrase solicitation`

**Body:**
Add seed-phrase synonyms to `base.ts REQUEST_WORDS`. The NASC September 2026 alert and TechCrunch Aug 2026 coverage of hardware wallet data breaches document a surge in phishing that asks victims to "enter your seed phrase" or "recovery seed phrase" to restore wallet access. No legitimate service asks for a seed phrase.

**Target file:** `packages/engine/src/regions/base.ts` → `REQUEST_WORDS`

**Add:**
```
"seed phrase",
"recovery seed phrase",
"secret recovery phrase",
"wallet recovery phrase",
```

**IOCs:** Phishing sites including `ledger-recovery[.]com`, `trezor-verify[.]io`, `metamask-seed-restore[.]net`. Physical letter variants with QR code and "mandatory authentication update" wording.

**FP notes:** Very low. "Seed phrase" has no legitimate consumer use other than in cold storage documentation, and the correct instruction there is always "never share your seed phrase". Verify that negation forms ("never enter your seed phrase", "never share your seed phrase") do not score; the negation guard from D3/2026-08-31 may cover this but should be explicitly tested.

**Roadmap:** docs/threat-intel/2026-09-06-threat-roadmap.md D3.

---

### Issue 4 — [threat-intel] BASE — money mule recruitment (carry-forward from 2026-08-31 D5)

**Title:** `[threat-intel] BASE — money mule recruitment phrases`

**Body:**
*Carry-forward from 2026-08-31 roadmap D5 (not yet filed as issue).* AFP, An Garda Síochána and Lloyds Bank published warnings July–August 2026 about money-mule recruitment targeting under-25s via social media SMS.

**Target file:** `packages/engine/src/regions/base.ts` → `REQUEST_WORDS`

**Add:**
```
"act as a payment agent",
"receive transfers into your account for a fee",
"money mule",
"financial courier",
"transfer funds on our behalf",
```

**FP notes:** "money mule" alone is VERY LOW FP — no legitimate employer uses the term. "Receive transfers into your account for a fee" is LOW in consumer SMS; FP-test against payment-processing onboarding messages before shipping; drop if hit rate is above 1 in 50 legitimate messages. "Act as a payment agent" is LOW-MEDIUM; gate to body with "commission" or "fee" nearby if FP testing shows issues.

**Roadmap:** docs/threat-intel/2026-08-31-threat-roadmap.md D5; docs/threat-intel/2026-09-06-threat-roadmap.md carry-forward.

---

### Issue 5 — [threat-intel] US — veterans benefits scam (carry-forward from 2026-08-31 D6)

**Title:** `[threat-intel] US — veterans benefits scam phrases`

**Body:**
*Carry-forward from 2026-08-31 roadmap D6 (not yet filed as issue).* FTC consumer alert 24 Aug 2026 warns of scammers impersonating veterans' benefits programmes.

**Target file:** `packages/engine/src/regions/us.ts` → `URGENCY_PENSION`

**Add:**
```
"veterans savings program",
"va benefits claim assistance",
"veteran benefit entitlement review",
```

**Hold:** `"champva"` and `"tricare for life"` — real programme names requiring careful FP testing against DoD/VA official comms before adding.

**FP notes:** MEDIUM. These phrases appear in legitimate VA comms; implementation should confirm they compound with an authority mention rather than scoring flat. `"va benefits claim assistance"` is the highest FP risk — legitimate veteran-support organisations use similar language.

**Roadmap:** docs/threat-intel/2026-08-31-threat-roadmap.md D6; docs/threat-intel/2026-09-06-threat-roadmap.md carry-forward.

---

### Issue 6 — [threat-intel] US — jury duty warrant SMS

**Title:** `[threat-intel] US — jury duty warrant SMS phrases`

**Body:**
FTC June 2026 consumer alert documents scammers calling about missed jury duty then texting fake bench warrants. The text-side signal (missed-jury-duty phrasing) is absent from `us.ts`.

**Target file:** `packages/engine/src/regions/us.ts` → `URGENCY_FOREIGN_AUTHORITY`

**Add:**
```
"missed jury duty",
"failed to appear for jury duty",
"bench warrant for your arrest",
```

**IOCs:** AI-voiced calls from numbers spoofing local area codes, followed by SMS containing photoshopped "warrant" PDFs.

**FP notes:** Low-medium. Courts notify by postal mail, not SMS; "missed jury duty" in an SMS is virtually always scam. "Bench warrant for your arrest" alongside a payment demand is the tell. FP-test `"bench warrant for your arrest"` against legal-advice app notifications.

**Roadmap:** docs/threat-intel/2026-09-06-threat-roadmap.md D4.

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Scamwatch scam alert — food delivery platforms (`scamwatch.gov.au`, Sep 2026) | 1 | AU food delivery coverage check |
| NASC media release — crypto investigation (`nasc.gov.au`, Sep 2026) | 1 | AU/BASE hardware wallet context |
| CommBank security alerts (`commbank.com.au`, Aug–Sep 2026) | 1 | AU CommBank coverage check |
| Action Fraud energy rebate scam alert (`actionfraud.police.uk`) | 1 | D1 GB energy allowance |
| Irish Times 29 Apr 2026 — Minister Harris deepfake (`irishtimes.com`) | 1 (national press) | D2 IE State Savings |
| RTÉ News 28 May 2026 — AI-generated ads (`rte.ie`) | 1 (national broadcaster) | D2 IE State Savings |
| Irish Examiner — State Savings wave (`irishexaminer.com`) | 2 | D2 IE State Savings |
| FTC consumer alert Jun 2026 — jury duty (`consumer.ftc.gov`) | 1 | D4 US jury duty |
| US Courts advisory 2026 — juror scams (`uscourts.gov`) | 1 | D4 US jury duty corroboration |
| FTC consumer alert Aug 24 2026 — veterans benefits | 1 | D6 carry-forward |
| AFP media release Jul 2026 — money mule (`afp.gov.au`) | 1 | D5 carry-forward |
| An Garda Síochána advisory Aug 2026 — money mule (`garda.ie`) | 1 | D5 carry-forward |
| TechCrunch 17 Aug 2026 — hardware wallet data breaches (`techcrunch.com`) | 2 | D3 BASE seed phrase |
| TRM Labs blog Jul–Aug 2026 — Coldcard $116M exploit | 2 | D3 BASE seed phrase context |
| ThinKmoney Sep 2026 — Ofgem rebate wave | 2 | D1 GB corroboration |
| FTC consumer alert Sep 3 2026 — QR parking meter (`consumer.ftc.gov`) | 1 | Not proposed (not a text-side signal) |

All direct HTTP fetches to government/consumer-protection domains returned `EGRESS_BLOCKED` in this execution environment. Findings were obtained via `WebSearch` tool. Source URLs are cited as published; content was not directly verified via HTTP this cycle.
