# Threat-intelligence roadmap — 2026-09-13

*Sweep period: 2026-09-07 – 2026-09-13 (regular weekly cycle). Next sweep due 2026-09-20.*

---

## Status — 2026-09-06 proposals

| ID | Proposal | Status |
|---|---|---|
| D1 | GB energy allowance phrases / October price cap | **Shipped (partial)** — `URGENCY_ENERGY_ALLOWANCE` added to `gb.ts`; `"energy payment allowance"` and `"energy support scheme payment"` deliberately excluded (code comment: near-duplicate coverage from existing `"energy bill support"` entry) |
| D2 | IE: NTMA / State Savings impersonation | **Shipped** — `"ntma"`, `"state savings"`, `"national treasury management agency"` in `ie.ts` `authorityMentions`; `"personal investment account"`, `"state savings scheme"` in `ie.ts` `REWARD_WORDS`; `"ntma.ie"`, `"statesavings.ie"` in `legitDomains` |
| D3 | BASE: Crypto seed-phrase solicitation | **Shipped** — `"seed phrase"`, `"recovery phrase"` (and variants) in `base.ts` `REQUEST_WORDS` |
| D4 | US: Jury duty warrant SMS | **Shipped** — `"missed jury duty"`, `"failed to appear for jury duty"`, `"bench warrant for your arrest"` in `us.ts` `URGENCY_FOREIGN_AUTHORITY` |
| D5 *(carry-forward)* | BASE: Money mule recruitment | **Shipped** — `"money mule"`, `"financial courier"`, `"act as a payment agent"` etc. in `base.ts` `REQUEST_WORDS` |
| D6 *(carry-forward)* | US: Veterans benefits scam | **Shipped** — `"veterans savings program"`, `"va benefits claim assistance"`, `"veteran benefit entitlement review"` in `us.ts` `URGENCY_PENSION` |

All six 2026-09-06 proposals are shipped or deliberately partially shipped. No carry-forwards from that cycle.

---

## Executive summary

A quiet week for new text-side signals in AU, NZ, CA, and IE. Three proposals this cycle, none requiring new pack-interface fields.

The standout gap is **FEMA missing entirely from US authority mentions** — confirmed by an FTC National Preparedness Month alert (September 2026) and FEMA's own Beware of Disaster Fraud advisory (July 2026). September–October is peak disaster-season in the US; FEMA impersonation SMS reporting spikes every time there is a named storm, wildfire, or declared emergency. The false-positive risk is very low: "fema" is a specific acronym with no consumer use outside disaster-management context.

The two smaller proposals (GB DVLA payment-failure phrasing, BASE account-compromised variants) are low-priority but genuine gaps — both supported by tier-1 sources and confirmed absent by grep.

| Rank | Proposal | Pack | Why first |
|---|---|---|---|
| 1 | D1 — US: FEMA impersonation | US | Confirmed absent; disaster season; FTC Sep 2026 + FEMA Jul 2026 tier-1 alerts |
| 2 | D2 — GB: DVLA vehicle tax payment-failure phrasing | GB | Most-reported UK text scam 2026; distinct payment-failure framing not in pack |
| 3 | D3 — BASE: "account compromised" variants | BASE | NASC/AFP Sep 2026 advisory; "account was compromised" not caught by existing entry |

**No new pack-interface fields needed.** All proposals target existing arrays.
**Region demand:** Turso DB unavailable in cloud environment — see §Region demand signal.

---

## Threats by region

### Australia (primary)

**Quiet cycle for new text-side signals.**

#### AU — ACCC phone spoofing advisory

The ACCC issued an advisory in September 2026 on phone-number spoofing by scammers impersonating Telstra, NBN Co, and major banks to claim account compromise. The consumer-facing lure text includes "your account may have been compromised" and "your account was compromised by an unauthorised login" — a framing not yet in `URGENCY_GENERIC`.

**Coverage check:** `"your account has been"` (substring in `base.ts URGENCY_GENERIC`) catches `"your account has been compromised"` (+10). `"account suspended"`, `"account is locked"` cover adjacent state-change phrases. `"account was compromised"` and the standalone `"account compromised"` are **not** caught by any current entry. See D3 below.

Source: ACCC media release (`accc.gov.au`, Sep 2026) — Tier 1; NASC advisory Sep 2026 (`nasc.gov.au`) — Tier 1.

#### AU — NASC crypto exchange impersonation

NASC published a September 2026 alert on impersonation of Coinspot, Swyftx, and CoinJar customer support, using fake "security alerts" to push victims to a phone number and then to a screen-share session. The consumer-facing SMS text follows the standard callback pattern (`base.ts CALLBACK_BRANDS` handles Coinbase; `au.ts BRAND_MENTIONS` has Coinspot and Swyftx).

**Coverage check:** `base.ts CALLBACK_BRANDS` covers the phone-number-in-SMS shape for Coinbase; `au.ts BRAND_MENTIONS` covers the brand name for Coinspot and Swyftx. The `"account compromised"` gap is addressed in D3. No distinct new signal beyond what D3 addresses. **No additional AU proposal.**

Source: NASC media release (`nasc.gov.au`, Sep 2026) — Tier 1.

#### AU — No new proposals this cycle

All active AU campaign signals are covered. The ACCC spoofing advisory feeds into D3 (BASE) below.

---

### United Kingdom

#### GB-1 — DVLA vehicle tax payment-failure phrasing (MEDIUM) → **D2**

The DVLA identified a new variant in its September 2026 scam advisory: SMS claiming that the recipient's vehicle tax **payment has failed** (as opposed to the existing "overdue"/"untaxed" framing). The distinction matters because payment-failure phrasing implies a recent action by the victim — "Your last vehicle tax payment has failed. Your vehicle will be flagged unless you update your payment details within 24 hours" — and is psychologically more convincing than a generic "your vehicle is untaxed" notice.

**Coverage check:** `gb.ts URGENCY_TOLL` currently has `"your vehicle is untaxed"`, `"vehicle tax is overdue"`, and `"untaxed vehicle"` — all deadline-state framing. The payment-failure variant (`"vehicle tax payment has failed"`, `"failed vehicle tax payment"`) is absent. `"dvla"` is in `AUTHORITY_MENTIONS` (+25) and `NO_LINK_SENDERS` — any message claiming to be from DVLA with a link already scores at least +25 (suspicious). The payment-failure phrase adds +10 urgency, raising the combined score to 35 (suspicious) without a brand hit, or +55 with a typosquat link (likely_scam).

The DVLA is the most impersonated UK government body in consumer SMS in 2026 (Action Fraud data, Tier 1). The payment-failure framing is confirmed in the DVLA's own advisory, making this a tier-1 evidenced gap with low FP risk (DVLA never contacts by SMS about payment failures — it sends paper letters).

**Proposed additions:**

To `gb.ts URGENCY_TOLL`:
```
"vehicle tax payment has failed",
"vehicle tax payment failed",
```

**FP risk: LOW.** DVLA processes tax by Direct Debit notice and paper reminder, not SMS. The phrasing "vehicle tax payment has failed" has no plausible legitimate SMS use.

**Source:** DVLA scam advisory (`gov.uk/government/news/dvla-warns...`, Sep 2026) — Tier 1; Action Fraud annual fraud report 2026 — Tier 1.

---

#### GB — Not proposed this cycle

- **Dart Charge / ULEZ surge** — existing `URGENCY_TOLL` entries (`"dart charge"`, `"congestion charge"`, `"ulez charge"`) cover documented lure text; no new phrasing identified.
- **Royal Mail parcel redelivery** — existing `URGENCY_PARCEL` entries cover the redelivery-fee shape.
- **HMRC PAYE underpayment wave** — `"self assessment penalty"` and `"late filing penalty"` are in `URGENCY_TAX_THREAT`; no new distinct phrasing documented this week.

---

### United States

#### US-1 — FEMA impersonation: missing from AUTHORITY_MENTIONS (HIGH) → **D1**

The FTC published a National Preparedness Month consumer alert in September 2026 warning that scammers impersonate FEMA (Federal Emergency Management Agency) after natural disasters, offering disaster-relief payments via text or phone. FEMA itself published a "Beware of Disaster Fraud" press release on July 17, 2026 documenting the pattern and explicitly noting that FEMA **never** initiates contact by text message to offer disaster assistance — victims must register via DisasterAssistance.gov or by calling 1-800-621-FEMA.

**Coverage check:** `us.ts AUTHORITY_MENTIONS` currently includes `"irs"`, `"ssa"`, `"medicare"`, `"usps"`, `"fbi"`, `"ftc"`, `"e-zpass"`, `"sec"`, `"fdic"`, `"tax resolution oversight department"`, `"va"`, `"veterans affairs"`. **`"fema"` and `"federal emergency management agency"` are absent.** A message reading `"Your FEMA disaster assistance has been approved — click to claim"` scores 0 from authority signal. Combined with `"disaster assistance"` absent from `URGENCY_TAX`, the score may not reach `suspicious` unless a suspicious TLD is also present.

`us.ts NO_LINK_SENDERS` currently has `"irs"`, `"ssa"`, `"medicare"`, `"usps"`. FEMA's own guidance confirms it never sends SMS links — this is the same pattern as the existing no-link-sender entries. **`"fema"` is absent from `NO_LINK_SENDERS`.**

**Observed phishing lure phrasing (FTC Sep 2026, FEMA Jul 2026, National Hurricane Center seasonal context):**
- `"fema disaster assistance"` — the fake approval notice
- `"fema relief payment"` — payment-transfer variant
- `"disaster assistance approved"` — shorter form that omits "fema" but uses the programme name
- `"claim your fema benefit"` — newer variant documented by the FTC
- `"federal emergency management"` — long-form reference used in phishing SMS when scammers want to appear official without using the acronym

**Proposed additions:**

To `us.ts AUTHORITY_MENTIONS`:
```
"fema",
"federal emergency management agency",
```

To `us.ts NO_LINK_SENDERS`:
```
"fema",
"federal emergency management agency",
```

To `us.ts URGENCY_TAX` (disaster-assistance approval lures follow the same benefit-payment pattern as IRS/SNAP entries):
```
"fema disaster assistance",
"fema relief payment",
"disaster assistance approved",
"claim your fema benefit",
```

**FP risk: VERY LOW.** `"fema"` is a highly specific acronym. No legitimate service other than FEMA itself uses the term in consumer SMS, and FEMA does not initiate contact by text. `"disaster assistance approved"` without `"fema"` has slightly higher FP risk (e.g. a community organisation); however at +10 urgency alone it cannot reach any verdict threshold unassisted, and it only compounds with the `"fema"` authority hit to score meaningfully. `"federal emergency management agency"` has effectively zero FP risk.

**Scoring example:** `"Your FEMA disaster assistance payment of $1,800 has been approved — click [link]"` → `"fema"` authority (+25) + `"disaster assistance approved"` urgency (+10) = 35 → suspicious. If the link uses a suspicious TLD → +30 → 65 → likely_scam.

**Source:** FTC consumer alert September 2026 (`consumer.ftc.gov`) — Tier 1; FEMA "Beware of Disaster Fraud" press release July 17, 2026 (`fema.gov`) — Tier 1.

---

#### US — Not proposed this cycle

- **IRS Tax Resolution Oversight Department** — shipped 2026-08-23.
- **Medicare Part D cap lure** — still no new SMS evidence; DEFERRED again.
- **Jury duty warrant** — shipped 2026-09-06 (D4).
- **Veterans benefits** — shipped 2026-09-06 (D6).

---

### New Zealand

No new materially distinct threats identified this cycle.

#### NZ — Coverage checks

- **ClickFix phishing** (CERT NZ Sep 2, 2026 alert): `"press windows+r"` and `"press cmd+space"` are in `base.ts REQUEST_WORDS`. Covered.
- **NZ Police impersonation + seed phrase**: `"police"` in `nz.ts AUTHORITY_MENTIONS`; `"seed phrase"` shipped in `base.ts` (D3 from 2026-09-06). Covered.
- **Netsafe Q3 2026 advisory on task-scam SMS**: `"complete simple tasks"` and `"earn money from home"` already in `base.ts REQUEST_WORDS` or `REWARD_WORDS` at the composite level. No new phrasing documented.

**No NZ proposals this cycle.**

---

### Canada

No new materially distinct threats for CA this cycle.

- CRA/CAFC impersonation is covered by existing authority mentions and urgency entries.
- CAFC recovery-fraud impersonation signal covered by base `REWARD_WORDS` (D2 from 2026-08-23, shipped).
- CA French-keyword gap remains BLOCKED pending native reviewer.

**No CA proposals this cycle.**

---

### Ireland

No new materially distinct text-side signals for IE this cycle.

#### IE — FraudSMART APP fraud data (not a new text signal)

FraudSMART (Banking and Payments Federation Ireland) reported a 27% year-on-year increase in Authorised Push Payment (APP) fraud in Q2 2026. The driving campaigns are investment and romance fraud — not new SMS lure phrasings, but a confirmed escalation of threat volume. The IE pack (NTMA/State Savings, investment promise lures) shipped in D2 from 2026-09-06; no new text-side additions evidenced this cycle.

**No IE proposals this cycle.**

---

### Cross-regional (BASE)

#### BASE-1 — "account compromised" variants (LOW-MEDIUM) → **D3**

NASC (AU, Sep 2026) and the AFP documented crypto exchange impersonation SMS using "your account was compromised" / "account compromised" as the opening lure, followed by a link to a fake Coinspot/Swyftx support page. The ACCC advisory (see §Australia) confirms the same phrasing in bank-impersonation variants.

**Coverage check:** `base.ts URGENCY_GENERIC` has `"your account has been"` — this substring catches `"your account has been compromised"` (+10). It does **not** catch:
- `"account was compromised"` — past-tense framing, absent from all urgency groups
- `"account compromised"` — standalone phrase (no "your" prefix), absent

The `"your account has been"` entry uses substring matching, so `"your account has been compromised"` is caught. But `"account was compromised"` (past tense, common variant) and `"account compromised"` (two-word form found in shorter SMS) are not caught by any current entry.

**FP risk: MEDIUM** for `"account compromised"` alone — the two-word form could appear in news forwarding or corporate IT alerts. However, at +10 alone it cannot reach any verdict threshold; it only matters when compounding with a link, authority mention, or other urgency signal. `"account was compromised"` has lower FP risk in consumer SMS — it is the scammer's phrasing, not a system notification style.

**Proposed additions:**

To `base.ts URGENCY_GENERIC`:
```
"account was compromised",
"account compromised",
```

No shadowing issue: `"account compromised"` is a proper substring of `"account was compromised"` — if both are in the list, only the longer needs to be listed (since matching is substring-based and the shorter will match anything the shorter does, plus more). Prefer the more specific form `"account was compromised"` and keep `"account compromised"` as a separate shorter-form entry — both have distinct surface forms.

**Implementation note:** Confirm that `"account was compromised"` does not shadow or duplicate the existing `"your account has been"` entry. They are independent: `"your account has been"` requires the possessive prefix; `"account was compromised"` is past-tense with no possessive. Adding both is correct.

**Source:** NASC media release (`nasc.gov.au`, Sep 2026) — Tier 1; ACCC media release (`accc.gov.au`, Sep 2026) — Tier 1.

---

## Proposals

*All phrases verified absent from `packages/engine/src/` by grep before filing (no matches for any proposed phrase).*

| ID | Tactic | Region | Target file / array | Priority | FP risk |
|---|---|---|---|---|---|
| D1 | FEMA impersonation — authority + no-link-sender + lure phrases | US | `packages/engine/src/regions/us.ts` → `AUTHORITY_MENTIONS`, `NO_LINK_SENDERS`, `URGENCY_TAX` | **HIGH** | VERY LOW |
| D2 | DVLA vehicle tax payment-failure phrasing | GB | `packages/engine/src/regions/gb.ts` → `URGENCY_TOLL` | MEDIUM | LOW |
| D3 | "account compromised" / "account was compromised" variants | BASE | `packages/engine/src/regions/base.ts` → `URGENCY_GENERIC` | LOW-MEDIUM | MEDIUM |

---

## Implementation notes

### D1 — US: FEMA impersonation

**Add to `AUTHORITY_MENTIONS` in `us.ts`:**
```
"fema",
"federal emergency management agency",
```

**Add to `NO_LINK_SENDERS` in `us.ts`:**
```
"fema",
"federal emergency management agency",
```

**Add to `URGENCY_TAX` in `us.ts`:**
```
"fema disaster assistance",
"fema relief payment",
"disaster assistance approved",
"claim your fema benefit",
```

`"disaster assistance approved"` is gated in practice by the `"fema"` authority hit: at +10 alone it cannot reach `suspicious`; combined with the +25 authority signal the message scores 35 (suspicious) without a link, or higher with a suspicious domain. `"federal emergency management"` alone — as a substring of `"federal emergency management agency"` — should be verified for shadowing before adding. If `"federal emergency management agency"` is listed, `"federal emergency management"` is redundant (substring match) and should be omitted unless the implementation requires word-boundary matching.

Ship with a test case: `checkSms("Your FEMA disaster assistance payment has been approved — update at fema-benefits.top", "us")` → `likely_scam`.

### D2 — GB: DVLA payment-failure phrasing

**Add to `URGENCY_TOLL` in `gb.ts`:**
```
"vehicle tax payment has failed",
"vehicle tax payment failed",
```

Scoring: `"dvla"` authority (+25) + `"vehicle tax payment has failed"` urgency (+10) = 35 → suspicious. If link uses a suspicious TLD or the message includes `"update your payment details"` (already in base `REQUEST_WORDS`?) → pushes toward likely_scam.

Check that `"vehicle tax payment has failed"` does not shadow or duplicate an existing entry before committing.

### D3 — BASE: "account compromised" variants

**Add to `URGENCY_GENERIC` in `base.ts`:**
```
"account was compromised",
"account compromised",
```

Confirm the negation guard (if any) applies to `"account compromised"` — a message reading "this is how scammers claim your account was compromised" should not score. If no negation guard exists for this form, document it as a known FP edge case.

---

## Pack-interface notes

No new fields required this cycle. All proposals target existing array types (`AUTHORITY_MENTIONS`, `NO_LINK_SENDERS`, `URGENCY_TAX`, `URGENCY_TOLL`, `URGENCY_GENERIC`). The `RegionDefinition` and `BaseSignals` interfaces in `packages/engine/src/regions/types.ts` do not need modification.

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
| "Hi Mum" / "Hi Dad" first-contact opener | **DEFERRED** | Still no distinct SMS opener pattern documented this cycle. |
| Medicare Part D cap lure | **DEFERRED** | No new SMS evidence this cycle. |
| Kali365 PhaaS | **MONITORING** | Infrastructure; no distinctive consumer SMS template confirmed. |
| IC3/FBI recovery scam — `"ic3 agent"`, `"ic3 case number"` | **MONITORING** | Still waiting for US-specific SMS evidence. |
| LINE/KakaoTalk recruitment funnels | **DEFERRED** | Insufficient AU/IE/NZ evidence; FP risk too high for general population. |
| Ledger/Trezor TOAD callback variants | **MONITORING** | Current vector is physical letter + phishing site, not the phone-number-in-SMS shape. Promote to proposal if SMS-based callback variant documented. |
| CA French-keyword gap | **BLOCKED** | Pending native reviewer. |
| FEMA post-hurricane surge | **IN D1** | Proposed this cycle; should be revisited after each named storm or disaster declaration in the US. |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| FTC consumer alert September 2026 — National Preparedness Month (`consumer.ftc.gov`) | 1 | D1 US FEMA |
| FEMA "Beware of Disaster Fraud" press release July 17, 2026 (`fema.gov`) | 1 | D1 US FEMA |
| DVLA scam advisory September 2026 (`gov.uk`) | 1 | D2 GB DVLA payment-failure |
| Action Fraud annual fraud report 2026 (`actionfraud.police.uk`) | 1 | D2 GB corroboration |
| NASC media release September 2026 — crypto exchange impersonation (`nasc.gov.au`) | 1 | D3 BASE / AU coverage check |
| ACCC media release September 2026 — phone spoofing (`accc.gov.au`) | 1 | D3 BASE / AU coverage check |
| CERT NZ advisory September 2, 2026 — ClickFix (`cert.govt.nz`) | 1 | NZ coverage check (already covered) |
| FraudSMART BPFI Q2 2026 report (`fraudsmart.ie`) | 2 | IE threat volume context (not a new text signal) |

All direct HTTP fetches to government/consumer-protection domains returned `EGRESS_BLOCKED` in this execution environment. Findings were obtained via `WebSearch` tool. Source URLs are cited as published; content was not directly verified via HTTP this cycle.
