# Threat-intelligence roadmap — 2026-08-29

*Sweep period: 2026-08-24 – 2026-08-29 (short cycle). Next sweep due 2026-09-06,
unchanged — this one was prompted rather than due.*

---

## Status — as at 2026-08-29

Both proposals shipped. The research above is kept as written; this block is the
only part updated after the fact.

| Proposal | Shipped in | Status |
|---|---|---|
| D1 — AU parcel address-correction lure | `9be74ef` (0.4.0) | ✅ Shipped |
| D2 — Generic held-parcel framing | `9be74ef` (0.4.0) | ✅ Shipped |

**Result: 7 of the 10 measured phrasings now flag, up from 1.** All eight
legitimate messages still score 0 — including `Please confirm your address for
our records before we ship`, the one that decided the gated design.

### Deviations

- **The gate is on a plain delivery noun, not a parcel-urgency hit.** The
  proposal said these should score "only alongside an existing parcel or
  delivery signal", which was implemented first as *a hit in
  `urgency.parcel`* — and it almost never fired. These messages are engineered
  to sound routine, so they carry no urgency phrase at all: `Your parcel is
  waiting. Update your address to complete delivery` produces **zero** urgency
  hits. Gating on one meant the gate could only open for messages already
  scoring, which is backwards. It now tests for `parcel|package|shipment|
  deliver*|courier|consignment|tracking`, which separates every measured scam
  from every measured legitimate message.

- **`PARCEL_ADDRESS_PHRASES` needed its own pack field, not a list entry.** The
  proposal flagged this as "confirm at implementation" and the answer was the
  one it suspected: every urgency group is flattened into one `urgencyWords`
  union and scored by hit count, so a list entry cannot express a condition.
  Added as an optional `parcelAddressPhrases` on `RegionDefinition`, resolved to
  `[]` on `RegionPack` for the five regions that define none.

- **`select your desired delivery solution` was not added**, as proposed.
  Confirmed at implementation: it stays at 0/safe, which is the intended
  outcome for a tail phrase a paraphrase defeats.

- **Scored +20, not the +10 an urgency hit carries.** The pairing is the
  complete lure on its own, and the delivery half usually contributes nothing.
  +20 reaches `suspicious` (20-44) without reaching `likely_scam` (45+) — the
  right ceiling for a signal whose two halves are each individually innocent.

### Corrections

- **D2's headline case still scores 10/safe, not suspicious.** `Your parcel is
  held. Pay the fee now` now matches (`parcel is held` is a hit where it scored
  0 before), but a single urgency hit caps at +10. That is the shared urgency
  cap working as designed — one signal should not reach `suspicious` alone — and
  the phrase does its job in combination: `Your package is being held pending
  payment` scores 20/suspicious. Recorded because the sweep implied D2 would
  resolve the probe's residual case outright, and on its own it does not.

---

## Why this sweep is off-cycle

It was triggered by a **residual gap left by a probe**, not by the calendar. The
share-path probe of the same date fixed a class of bare-host false positive, and
in doing so removed a URL card that had been quietly compensating for a
message-scoring weakness:

> `Pay at shop.top now` scored 0/safe once the phantom URL card went away.
> Isolating it showed the message alone — `Your parcel is held. Pay the fee now`
> — also scores **0**, with no flags, host or no host.

The probe recorded that as *"worth a look next probe, on the message rules
rather than the extractor"*. Looking at it turned up something wider than one
phrase, and sourcing it is a sweep's job rather than a probe's.

---

## The finding: AU's parcel list is the largest and still misses the AU campaign

> **Corrected while writing.** This section first claimed AU was "the thinnest
> of the six packs, five entries against nine to eleven". That is wrong and the
> correction is the finding. Counted from the live source, `URGENCY_PARCEL` is:
> **AU 17**, US 13, IE 13, CA 13, GB 12, NZ 12. **AU is the largest pack.** The
> miscount came from reading only the first two lines of the AU list and missing
> the customs block a previous cycle added below it — the cohort framing made
> "AU is behind" the expected answer, and the number was taken to fit it.
>
> The gap is real but **qualitative, not quantitative**: AU is well covered on
> customs and redelivery-fee framing and carries *nothing* for the
> address-correction campaign that its own carrier says is dominant. A size
> comparison would have shipped the wrong conclusion.

| Phrase | AU | GB | US | NZ | IE | CA |
|---|---|---|---|---|---|---|
| `parcel held` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `delivery failed` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `couldn't be delivered` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `redelivery fee` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| customs / import-duty terms | **10** | 1 | 1 | 1 | 2 | 2 |
| `package held` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `reschedule your delivery` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `incomplete address` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `arrange redelivery` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `parcel is waiting` | ❌ | ✅ | — | ✅ | ✅ | ✅ |

**This is a known-shape gap, not a new one.** [`au.ts`](../../lib/regions/au.ts)
already carries a comment from an earlier cycle closing exactly this asymmetry
for the customs half — *"us.ts and ca.ts already carry `customs fee`; AU was the
gap."* The redelivery half was not closed at the same time.

**But the cohort is not the evidence.** Copying phrases across because five
other packs have them is precisely the cohort reasoning this archive exists to
catch — it is how the weak `.monster` citation survived. Each of those packs
cites its own national carrier. So does this proposal, below.

---

## Evidence

**Primary source — tier 2 brand, authoritative for its own brand:**
[auspost.com.au scam alerts](https://auspost.com.au/about-us/about-our-site/online-security-scams-fraud/scam-alerts).
Australia Post publishes dated alerts naming the wording of live campaigns. The
alerts below are quoted from that page.

| Alert | Published | Wording AusPost names |
|---|---|---|
| High-volume iMessage/RCS | 2025-05-12, upd. 2026-02-25 | "Update your correct address", "Shipment has been suspended due to missing house number", "Select your desired delivery solution" |
| Confirm your address | 2024-11-13 | "confirm your address" to complete delivery |
| Update your address | 2024-07-08 | "update your address" for delivery completion |
| Correct address label | 2024-05-28 | "correct address label" to complete delivery |
| Verify your postcode | 2026-03-18 | "verify your postcode within 48 hours" |
| Attempted delivery (email) | 2026-07-01 | "delivery attempt was unsuccessful", parcel returned if unresolved |
| StarTrack redelivery (email) | 2025-02-27 | "Schedule Redelivery" to prevent package return |
| Redelivery fee | 2026-07-10 | payment for redelivery after a failed attempt |

**What the AU evidence actually says, and it is not what the cohort implied.**
The dominant AU variant is **address correction**, not the redelivery-fee
framing the other packs are built around. Six of the eight alerts above are
address-shaped. AU's existing list has `redelivery fee` and no address entry at
all — so the largest parcel list of the six is aimed at the wrong half of the
campaign its own carrier documents.

**Corroboration attempted and not found — recorded as a negative result.**
[Scamwatch news and alerts](https://www.scamwatch.gov.au/about-us/news-and-alerts)
carries no parcel or postal alert in its current listing (10 alerts, 2026-03 to
2026-08; crypto, ATO/myGov, food delivery, recruitment, romance, loans). This
proposal therefore rests on a **single tier-2 brand source**. That is
sufficient here — AusPost is authoritative about impersonation of AusPost, and
the alerts are dated and specific — but it is weaker than a tier-1 corroborated
rule and is recorded as such. If a Scamwatch parcel alert appears, cite it.

**Measured against the live detector.** Ten phrasings taken verbatim from the
alerts above:

| Message | Score | Verdict |
|---|---|---|
| `AusPost: we could not complete delivery. Confirm your address to receive your parcel` | 25 | suspicious *(brand rule, not the lure)* |
| `Your parcel is waiting. Update your address to complete delivery` | **0** | **safe** |
| `Delivery paused: correct address label required` | **0** | **safe** |
| `StarTrack: schedule redelivery to prevent your package being returned` | **0** | **safe** |
| `Shipment has been suspended due to missing house number` | **0** | **safe** |
| `Update your correct address to release your shipment` | **0** | **safe** |
| `Select your desired delivery solution to continue` | **0** | **safe** |
| `Please verify your postcode within 48 hours to complete delivery` | 10 | safe |
| `Your delivery attempt was unsuccessful. Act within 24 hours or your parcel is returned` | 10 | safe |
| `Delivery unsuccessful. Pay the redelivery fee to reschedule` | 10 | safe |

**Nine of ten score `safe`.** The only one that clears suspicion does so because
it says "AusPost" — the brand rule, which a scammer simply omits. The three that
reach 10 do so on generic urgency (`within 48 hours`, `redelivery fee`), not on
the lure.

---

## D1 — AU parcel address-correction lure (HIGH)

**Target:** `URGENCY_PARCEL` in [`lib/regions/au.ts`](../../lib/regions/au.ts).

Add the address-correction half the pack is missing, sourced to the alerts
above rather than to the other packs:

```
"update your address", "confirm your address", "correct your address",
"correct address label", "verify your postcode", "missing house number",
"shipment has been suspended", "schedule redelivery", "arrange redelivery",
"package held", "reschedule your delivery", "delivery attempt was unsuccessful"
```

**FP risk: MEDIUM — and this is the part that needs implementation judgement.**

Measured against legitimate messages, the bare address phrases are **not
safe to add flat**:

| Legitimate message | Contains |
|---|---|
| `Please confirm your address for our records before we ship` | `confirm your address` |
| `Thanks for updating your address with us` | *(near-miss)* |
| `Your redelivery is booked for Thursday` | *(near-miss)* |

A retailer asking a customer to confirm a shipping address is ordinary
commerce. **The scam signal is not the address request — it is the address
request as the thing blocking a delivery.** `confirm your address` alone would
flag the legitimate message above.

**Recommended shape, decided at implementation:**

- **Add flat** (no clean legitimate use in a consumer SMS): `correct address
  label`, `verify your postcode`, `missing house number`, `shipment has been
  suspended`, `delivery attempt was unsuccessful`, `package held`.
- **Gate behind a delivery-blocked context** (the D3 `KEYS_BY_POST_PHRASES`
  pattern from 2026-08-23 is the precedent): `update your address`, `confirm
  your address`, `correct your address`, `schedule redelivery`, `arrange
  redelivery`, `reschedule your delivery`. These score only alongside an
  existing parcel or delivery signal.
- **Do not add**: `select your desired delivery solution`. Named in the alert,
  but it is a long tail-phrase that a paraphrase defeats entirely, and it reads
  as machine-translated filler rather than a stable campaign marker.

**Confirm at implementation**, not assumed here: whether `URGENCY_PARCEL` is
flattened into the `urgencyWords` union and scored by hit count, as
`urgency.tax` was found to be in the 2026-08-23 compound-scoring note. If it is,
a "gate" needs its own list and check rather than a list entry.

---

## D2 — The generic held-parcel framing scores nothing (MEDIUM)

**Target:** the same list, and the reason the probe surfaced this at all.

`Your parcel is held. Pay the fee now` scores **0** with no flags. `parcel held`
is in the AU list, but the message says "parcel **is** held" — the entry is a
literal substring, so the inflected form misses.

Propose adding `parcel is held`, `package is being held`, `held pending
payment`, `release fee`.

**FP risk: LOW.** No legitimate carrier asks for a payment to release a parcel
by SMS; AusPost's own page states it will never *"call you out of the blue to
request payment (for example, for an undeliverable mail item)"*, and legitimate
duty is billed by invoice rather than a click-through.

**Not proposed:** `pending payment` bare. It is ordinary invoicing language and
would flag every legitimate overdue-account message.

---

## Watchlist — considered, not proposed

- **`incomplete address` / `insufficient address`** — carried by GB, US, NZ, IE
  and CA, and the obvious cohort port. **Deferred: no AU evidence.** The AusPost
  alerts name *missing house number* and *correct address label*, not the
  "incomplete address" phrasing that dominates the UK and US campaigns. Adding
  it would be the cohort reasoning this sweep set out not to do. Revisit if an
  AU alert names it.
- **`Y` / reply-to-confirm trick** — the 2026-02-25 alert warns that replying
  "Y" makes the device treat the sender as a trusted contact. Real and current,
  but it is a *device behaviour* warning with no text-side signal: a message
  saying "reply Y" is indistinguishable from legitimate opt-in confirmation.
  No detection proposed. Possible `learn/` content instead.
- **StarTrack as a brand mention** — appears in two alerts. Not proposed
  standalone; check whether `govMentions`/brand handling already covers it
  before adding, since AusPost is presumably already there.

---

## Method note

Read from [`sources.yml`](sources.yml) rather than open search, per the README.
Both sources consulted are in the registry (`auspost.com.au` under `brands`,
`scamwatch.gov.au` under tier 1). The Scamwatch negative result above is
recorded because a future sweep should not re-check it blind.
