# Adversarial probe — 2026-09-09

*Target: the code that moved on 2026-09-06 — the public read endpoints'
cost controls (`app/api/reports/route.ts`, `app/api/stats/route.ts`,
`lib/readGuard.ts`) and target-region inference (`lib/targetRegion.ts`,
the `/api/check` call site). Trigger: a phase widened the surface — two
new cost controls and a new telemetry writer merged three days ago and
neither had been attacked.*

---

## Status — as at 2026-09-09

| Finding | Severity | Shipped in | Status |
|---|---|---|---|
| P6 — `limit` bypasses the 100-row cap when negative | **HIGH** | — | ⬜ Outstanding |
| P7 — Non-numeric `limit`/`offset` return 500 | MEDIUM | — | ⬜ Outstanding |
| P8 — Target-region inference never runs on the email path | MEDIUM | — | ⬜ Outstanding |

P6 and P7 are **cost/availability** findings on the free-tier read budget,
not confidentiality: the feed is PII-scrubbed and already public at
`/submissions`. P8 is a **measurement** finding — it silently narrows what
the aggregate can ever say.

Nothing here hides a scam. No detection rule was found to be evadable this
run; see *What held up*.

---

## Why this target

The roadmap's standing constraint is that a probe is event-triggered, and
points at code that just moved. Three things merged 2026-09-06:

- **API cost controls** (`4c2ef5d`, `a5ff767`) — a same-origin read guard and
  a per-IP rate limit in front of `/api/reports` and `/api/stats?breakdown=1`.
- **Target-region inference** (`8f85d4c`, `8553694`) — a new aggregate writer
  reading arbitrary submitted text on the `/api/check` response path.
- The 2026-09-06 sweep, which is a *sweep* and covers none of this. Per the
  README, a probe never discharges a sweep or the reverse.

Both are new code reading untrusted input and deciding what it is, which is
the first trigger on the README's list. Neither had been probed.

---

## Findings

### P6 — A negative `limit` bypasses the 100-row cap — **HIGH**

The feed's whole cost argument is that a call is bounded: `Math.min(limit, 100)`
caps the page, and the rate limit bounds call frequency. A negative `limit`
walks through the cap, because `Math.min(-5, 100)` is `-5`, and SQLite treats a
negative `LIMIT` as **no limit at all**.

Reproduced end-to-end against the running app:

```
GET /api/reports?limit=5    → 200, 5 rows
GET /api/reports?limit=-5   → 200, ALL rows (14 of 14 locally)
```

Isolated at the DB layer, on a 50-row table:

| Bind | Rows returned |
|---|---|
| `LIMIT 25` | 25 |
| `LIMIT -5` | **50 — the entire table** |

Locally that is 14 rows. In production it is the whole `reports` table on every
call, and it grows with the table. `Math.max(…, 0)` is already applied to
`offset` one line above, so the guard exists in the file — it was simply not
applied to `limit`, where the cap was assumed to do that job.

**Why the cap did not catch it.** `Math.min` bounds the top of the range and
says nothing about the bottom. The parameter has two ends, and only one was
constrained — the same shape as the roadmap's *"ask which side of the rule is
unbounded"* note, here with the unbounded side pointing down instead of up.

**Fix:** clamp both ends —
`Math.min(Math.max(limit, 1), 100)` — and assert the negative case, not only
the over-cap one.

### P7 — Non-numeric `limit` or `offset` returns a 500 — MEDIUM

`parseInt("abc", 10)` is `NaN`, and the `?? "25"` default only fires on a
*missing* parameter, never a malformed one. `NaN` reaches the libSQL bind
layer, which rejects it:

> `Only finite numbers (not Infinity or NaN) can be passed as arguments`

Reproduced:

```
GET /api/reports?limit=abc   → 500
GET /api/reports?offset=abc  → 500
GET /api/reports?since=abc   → 200   (NaN flows into a comparison, no bind error)
```

A 500 on malformed input is a small thing on its own. It matters here because
of what sits in front of it: the 500 is thrown **after** the rate-limit check
and **after** the two DB queries are attempted, and an error response is
`no-store`, so it is the one call shape that reaches the database and cannot
be absorbed by the edge cache. That is the opposite of the ordering the route's
own comment sets out — *"reject before querying"*.

`since=abc` returning 200 is worth noting separately: it does not throw, so
`NaN` silently reaches a `submitted_at >= ?` comparison. Not a crash, but the
filter it describes is not the filter that runs.

**Fix:** coerce once, at the edge — a helper that returns the default on any
non-finite result, applied to all three parameters. The three coercions are
already near-identical, which is the roadmap's own "extract at 2+ occurrences"
line.

### P8 — Target-region inference never runs on the email path — MEDIUM

`inferTargetRegion` is called from exactly one place, `app/api/check/route.ts`.
The email path (`app/api/inbound/route.ts`) records `check_events` and
`incrementCheckCount("email")` but never calls the inference, so no forwarded
email can ever contribute a target-region row.

This is not theoretical. In production **every check since the inference
deployed has been on the email surface**:

| Table | State in prod, 2026-09-09 |
|---|---|
| `check_events`, since 2026-09-06 | 2 checks, both `surface = email` |
| `target_region_events` | **0 rows** |

`recordTargetRegion` accepts `"email"` — it is in `CHECK_SURFACES`, and the
suppression and drop logic are surface-agnostic — so the writer is ready and
simply is not called. The empty table is *not* evidence the inference is
broken: run directly, it attributes correctly (`HMRC…co.uk` → GB/`tld`,
IRAS → SG/`authority`, `+61…` → AU/`phone`).

**Why this is worth a finding rather than a nice-to-have.** Item 3's whole
justification for building the inference immediately was that *the evidence is
discarded on every check and can never be backfilled*. That argument applies to
the email path exactly as much as the web one, and email is where the only
current traffic is. Every forwarded email since 2026-09-06 is evidence
permanently lost for the stated reason the module was built early.

It also biases the aggregate in a way a later reader cannot detect: whatever
accrues will describe web and share traffic only, while presenting as
"checks". Forward-to-check is the surface most likely to carry *cross-border*
campaigns — someone forwarding a foreign-language scam — which is the exact
disagreement between target and connection region the module exists to record.

**Fix:** call the inference from the inbound path with `surface: "email"`,
respecting the same opt-out gate. Needs one decision first: the web path gates
on `shareRegion !== false`, and the email path has no equivalent consent
signal, so what the default is there is a privacy call, not a wiring one.

---

## What held up

Recorded so the next run does not re-test this ground.

**All nine false-positive guards from the item-3 review still hold.** Each was
re-run as text, not as a unit test:

| Probe | Result |
|---|---|
| `Your purchase confirmation is attached` | no inference (`chase` not matched inside `purchase`) |
| `Please confirm your details.ca is not a domain` | no inference (bare ccTLD in prose) |
| `Our revenue figures are up this quarter` | no inference (generic institution) |
| `Postal service update: your parcel is delayed` | no inference |
| `The reserve bank said rates will hold` | no inference |
| `Check out our new tool at linear.io today` | no inference (gTLD denylist) |
| `Read more at alex.me for details` | no inference |
| `The item costs £45.99 including delivery` | no inference (currency is not a signal) |
| `H M R C refund pending` | no inference — see note |

**Evasion attempts that failed:** uppercase host (`HMRC-REFUND.CO.UK`) still
attributes GB; a punycode host still attributes on its suffix.

**Two non-findings worth writing down, because both looked like findings.**

- **`+44 7700 900123` does not attribute, and that is correct.** It reads as a
  broken GB phone rung. It is not: that is Ofcom's reserved drama range and
  libphonenumber rejects it as invalid, by design. Real GB numbers
  (`+44 20 7946 0958`, `+44 7400 123456`) attribute GB at `phone` confidence.
  This is the roadmap's *"the example you build the rule against"* lesson
  arriving from the other direction — a fixture chosen for looking realistic
  was the one shape that could not work. **Do not "fix" this next cycle.**
- **The origin guard's rule-1 hole is documented, not a defect.** A request
  with no `Origin` and no `Referer` is allowed, and `curl -H "Origin: …"`
  walks past the guard — both are stated in `readGuard.ts` in as many words,
  with the reasoning. A forged foreign origin is correctly refused (403).
  Nothing to file; the rate limit is what bounds a determined caller.

**Deliberately not attacked this run:** the rate limiter's window accounting,
and the edge-cache interaction on 403/429. Both were touched by `a5ff767` and
both deserve their own run — flagged for the next probe rather than left
implied.

---

## Two notes on the roadmap's owed items

**The `region` prod confirmation is still owed, and cannot be discharged yet.**
Item 1 asks for confirmation that the column writes a real value on the next
live submission. Queried directly:

```
SELECT region, COUNT(*) FROM reports GROUP BY region;
→ (empty)  10   2026-05-31 … 2026-07-18
```

Still ten rows, all pre-migration, none since 18 July. The read-side ambiguity
is genuinely closed — `''` now means pre-migration and nothing else — but the
confirmation itself needs a submission that has not arrived. **Nothing to do
but wait; it is not a defect and should not be re-audited until a row appears.**

**The 2026-09-06 sweep did not cover this code**, which is why this probe
exists rather than being folded into it. That sweep is a normal outward cycle
(four pack proposals, six issues). Per the README the two are not
interchangeable, so the roadmap's "2026-09-07 is a gap" line is answered by
*this* document, not by the sweep that merged on the 6th.

---

## Method

Every finding is a reproduction against the live code, per the probe
convention — no sources involved.

- Findings P6/P7: `curl` against `npm run dev` on `localhost:3000`, plus an
  isolated 50-row in-memory libSQL table to separate the route's coercion from
  SQLite's `LIMIT` semantics.
- Finding P8: read of the two route files for call sites, plus a direct query
  of the production Turso database (`db-veriguard`, read-only `SELECT`s) to
  establish that `check_events` is accruing while `target_region_events` is
  empty.
- Inference behaviour: `inferTargetRegion` called directly on scratch fixtures.

The dev server used the local SQLite fallback — `TURSO_DATABASE_URL` is
commented out in `.env.local` — so no probe traffic touched production data.
The only production access was read-only aggregate `SELECT`s.
