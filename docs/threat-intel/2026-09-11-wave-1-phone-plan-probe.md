# Adversarial probe — 2026-09-11 (wave-1 phone plans)

*Target: the surface widened by item 4 step 5's first `minimal` wave — five
packs (DE, ZA, IN, JP, BR), and with them five number plans, five suffix
regimes and five agency lists. Trigger: the wave merged and the probe was
recorded as owed. This is the second probe aimed at that wave; the first
(`2026-09-11-minimal-wave-probe.md`) found P12 in the emergency-number union
and explicitly deferred the three surfaces below.*

---

## Status — as at 2026-09-11

| Finding | Severity | Shipped in | Status |
|---|---|---|---|
| P13 — BR asserts a numbering-plan negative that is false, losing localised premium copy | MEDIUM | this branch | ✅ Fixed |
| P14 — US and CA's `premiumPrefixes` are dead, not redundant; `976` names a range that cannot fire | MEDIUM | this branch | ✅ Fixed |

Two findings, both fixed in-cycle, **both in phone plans**. The other two
surfaces — agency lists and suffix regimes — held under adversarial input; see
*Held up*.

**P14 is not in the code the wave touched.** It sits in US and CA, two `full`
packs authored months earlier, and was reachable only because the invariant was
written over every pack with a phone plan rather than over the wave's five.
That is the transferable result here: the trigger correctly aimed the probe at
this mechanism, and scoping the *assertion* to the diff would have missed the
larger half of what the mechanism was hiding.

---

## P13 — a false negative claim about Brazil's numbering plan

**Severity: MEDIUM.** No scam is missed and no score is wrong; a Brazilian
reader loses the localised explanation every other pack gives.

`br.ts` carried this reasoning for omitting `premiumPrefixes` and
`premiumFlag`:

> *Brazil allocates no consumer premium-rate range comparable to DE's 0900, so
> premiumPrefixes and premiumFlag are omitted rather than filled with a
> speculative entry.*

The omission is careful and the justification is wrong. Parsed rather than
read:

```
BR 0500123456    valid=true  type=PREMIUM_RATE
BR 0900123456    valid=true  type=PREMIUM_RATE
BR 03001234567   valid=true  type=SHARED_COST
```

Brazil has two consumer premium ranges: 0500 (donation and charity-appeal
lines) and 0900 (general premium).

**Why the score was still right, and what was actually lost.** Both ranges
already reached `analysePhone`'s `PREMIUM_RATE` branch, which bumps spoofing
risk to `very_high` from the line type alone, and `checkPhone` adds its own
generic premium flag — so a 0500 number scored 95/`likely_scam` before this
fix. But that branch pushes the pack's own copy only `if (plan.premiumFlag)`,
and the flag was absent:

```
BR 0500 123 456   lineType=premium  spoofingRisk=very_high  notes=[]
DE 0900 123 456   lineType=premium  spoofingRisk=very_high  notes=["…German 0900 and 0137…"]
```

An empty note list beside a `very_high` risk is the shape to look for: the
engine is confident and has nothing to say about why.

**The part worth carrying.** A test asserted the false claim —

```ts
expect(plan.premiumPrefixes).toBeUndefined();
expect(plan.premiumFlag).toBeUndefined();
```

— under a comment restating it as fact. That is the wave's own "a comment
cross-referencing a neighbour certifies it as verified" defect, promoted from
prose into an assertion, where it reads as verification rather than as a claim.
**A negative claim is harder to review than a wrong entry**, because there is
nothing in the list to look at.

**Fixed** by authoring both ranges in the trunk-0 form the rule compares
against, naming both in the copy, and replacing the test with one that asserts
the parser agrees.

---

## P14 — US and CA's premium prefixes never fired

**Severity: MEDIUM.** Same shape: the score survived on a second mechanism, and
the copy named a range that could never produce it.

Both packs authored:

```ts
premiumPrefixes: ["1900", "900", "1976", "976"],
premiumFlag: "…900 and 976 numbers bill the caller at a premium rate…",
```

with a comment claiming they are "matched on the national (1-stripped) form".
They are not. `analysePhone` builds `national = "0" + parsed.nationalNumber`,
so the value the prefix rule sees is `"09005551212"` — which none of the four
entries prefixes. Measured:

```
US 1-900-555-1212   lineType=premium   ← from libphonenumber's PREMIUM_RATE branch
US 900 555 1212     lineType=premium   ← same
US 1-976-555-1212   lineType=unknown   "doesn't match any known phone number format"
US 976 555 1212     lineType=unknown   same
```

`900` scored only because libphonenumber classifies NANP premium numbers
independently and that branch pushes the same `premiumFlag`. `976` has no such
backstop — libphonenumber rejects `+1 976` as **invalid**, the legacy premium
exchange having been withdrawn from the NANP — so it reached nothing, and the
copy promised a warning that could not be shown. Identical to ZA's 0861 and
JP's 0570, in two `full` packs rather than a `minimal` one.

**This corrects a recorded conclusion.** The wave's post-mortem measured
breaking DE/ZA/JP's prefixes as changing "nothing observable" and read that as
redundancy, generalising a NANP trap the roadmap already held as understood.
The correct reading is that **"changed nothing observable" is the same
observation for a redundant rule and a dead one**, and the two had not been
distinguished. For DE, ZA and JP it was redundancy; for US and CA it was death.

**Fixed** by authoring `["0900"]` in the form the rule matches, and dropping
`976` from both the list and the copy rather than reauthoring it — there is no
live range left to warn about.

---

## The invariant both findings now sit behind

Written over **every** pack with a phone plan, not the wave's five, in both
directions:

- every authored premium prefix must reach `premium` **and** carry the pack's
  own copy — catches P14 and the SG trunk-0 class;
- a pack omitting `premiumPrefixes` must not be omitting a range the parser
  recognises — catches P13, and any future pack that explains an empty field
  with prose;
- an authored prefix list and a flag must be present or absent together.

Both directions verified by injection: reverting each fix fails the suite.

**One methodological note.** The first three attempts at the positive assertion
failed against packs that were *correct* — synthetic numbers built by padding a
prefix to a fixed length are invalid in most plans, and variable-length stems
(GB `09`, IE `15`) and a five-digit spread in national lengths across these
packs made a single construction useless. The passing version sweeps lengths
and fillers and probes both the authored and trunk-stripped forms. Worth
knowing before writing the next one: **a phone-plan assertion is mostly a
number-construction problem**, and a failure is more likely to be the fixture
than the pack.

---

## Held up

- **Agency lists as a false-positive surface.** The ZA `saps` / `hawks` class —
  a bare entry that is also a dictionary word. Every acronym of six characters
  or fewer across all six `minimal` packs was swept against benign English
  prose carrying a link (`trai` in "training", "straight", "restraint"; `rica`
  in "africa", "america"; `ters` in "letters", "characters"; `sars` in
  "sarsaparilla"; `bsi` in "absinthe"; `uif` in "fruitful"). **All scored 15 /
  `unknown`.** Agency mentions are matched on word boundaries, so the substring
  collision this class depends on is structurally unavailable. The ZA finding
  was real precisely because `saps` and `hawks` match as *whole words*, which
  no boundary rule can help with.
- **Suffix regimes.** Every `trustedHostSuffixes` entry across the six packs
  was probed with global brand squats (`paypal-secure-login.gov.za`,
  `.bund.de`, `.go.jp`, …). All exempted — correctly: every suffix in those
  lists is eligibility-gated, which is the documented bar for the field, and a
  scammer cannot register under them. Every `brandSuffixes` entry was probed
  with a global brand as the registrable label; the government-suffix entries
  that look questionable (`paypal.gov.br`) match all five `full` packs and are
  a pre-existing convention, not a wave-1 defect.
- **`premiumPrefixes` trunk form for DE, ZA, JP.** Re-checked by parse rather
  than by spot-check this time. Correct in all three, as the previous probe
  reported.

## Watchlist

- **The `national` form is built from a leading `"0"` unconditionally**, which
  is why every prefix in every pack must be authored with it. This is a real
  coupling between pack data and one line of engine code, documented in three
  pack comments and now asserted, but **it would break silently for a country
  whose trunk prefix is not `0`** — BR's comment already flags this, and no such
  pack exists yet. The invariant would catch it as a failing assertion rather
  than as silent non-detection, which is the improvement.
- **`premiumPrefixes` is checked before validity, deliberately** (so AU 190x
  works), but a range libphonenumber rejects *and* the pack does not author
  reaches nothing at all. That is the `976` case. There is no general sweep for
  "ranges this country has that we author nothing for" — the new negative
  assertion covers premium only, against a fixed candidate list.
- **Not probed: the agency lists as impersonation surface.** Unchanged from the
  previous probe — whether a scam naming `BSI` or `SARS` scores appropriately
  is a question about the keyword layer, which for five of these six regions is
  English against non-English messaging. Item 4b's gap, not a defect a probe
  can resolve.
