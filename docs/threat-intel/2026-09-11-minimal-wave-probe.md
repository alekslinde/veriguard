# Adversarial probe — 2026-09-11

*Target: the surface widened by item 4 step 5's first `minimal` wave
(2026-09-10) — five packs (DE, ZA, IN, JP, BR), and with them five number
plans, five suffix regimes and five agency lists. Trigger: a phase widened the
surface, and `Standing constraints` recorded the probe as owed — the wave's
own eleven defects came from authoring discipline and code review, which
answer a different question than an adversarial probe.*

---

## Status — as at 2026-09-11

| Finding | Issue | Shipped in | Status |
|---|---|---|---|
| P12 — Pack-authored emergency numbers are region-scoped, so another country's emergency line scores `likely_scam` | — | this branch | ✅ Fixed |

One finding, fixed in-cycle. **It is older than the wave it was found by** —
the same defect existed for GB's 101, NZ's 105 and US/CA's 988 since those
packs were authored. The wave did not introduce it; it widened it from four
numbers to sixteen and made it reachable in twelve regions, which is what
brought it within reach of a probe aimed at the new surface.

---

## P12 — a national emergency number reads as `likely_scam` everywhere else

**Severity: HIGH.** A false positive on the single class of number that must
never be scored as suspicious, reachable with no evasion at all — just a user
checking a real number from the wrong country.

`analysePhone` recognises emergency numbers before any other rule, because they
are short enough to trip the "too short to be real" guard. It read two sources:
a hardcoded universal set, and `plan.emergencyNumbers` for **the active region
only**.

The hardcoded set is region-independent and its comment states the rule:

> *Union rather than per-region: dialling another country's emergency number is
> not a scam signal, and treating an unrecognised one as fabricated is the
> failure mode worth avoiding.*

**That was true of the hardcoded set and false of everything a pack authored.**
A pack's numbers were consulted only when that pack happened to be the active
region, so the twelve numbers the wave added were invisible from anywhere else.

Measured, `checkPhone(n, "AU")`:

```
190     75  likely_scam    Brazil — police
1930    75  likely_scam    India — cybercrime helpline
188     75  likely_scam    Japan — consumer hotline
10111   75  likely_scam    South Africa — police
116117  55  likely_scam    Germany / Ireland — medical on-call
```

Each returns `emergency` / `safe` in its own region and `likely_scam` in the
other eleven. The flags printed together, which is its own defect:

```
"No obvious red flags from the number format alone — caller ID can always be spoofed…"
"Number is too short to be real — caller ID has been manipulated"
```

**Why this matters more than an ordinary false positive.** The likeliest person
to check a foreign emergency number is a traveller, a migrant, or someone who
has just been contacted by a body claiming to be one — the population least able
to dismiss the verdict, being told a real police line is a scam. It is also the
exact inversion of the tier's purpose: `minimal` exists to *"name the local
authority and tell the user where to report"*, and this told them the authority's
own number was fabricated.

### The fix

`ALL_EMERGENCY_NUMBERS` in `regions/index.ts`, unioned across every pack in
`REGIONS` and consulted alongside the hardcoded set. Built from the packs rather
than hand-listed, so authoring a number in a pack is sufficient and the union
cannot drift — asserted by a test that walks every pack.

Scoped deliberately: this changes only which numbers are *recognised* as
emergency lines. It does not touch `premiumPrefixes`, which stay region-gated
and should — a premium range is a billing fact about one country's plan, and
recognising another country's premium prefix domestically would be a real
false positive. Emergency numbers are the opposite: the harm runs entirely one
way, since no scam is furthered by a user being told 190 is a police line.

---

## Held up

Recorded because a probe's negative results are the half that stops the next
cycle re-running it.

- **Premium-rate prefixes across regions.** Correctly region-gated by
  `isDomesticFormat`. ZA `0862`, JP `0990` and DE `0900` do not fire outside
  their own pack, which is right.
- **DE/JP/ZA premium prefixes being redundant with libphonenumber's
  `PREMIUM_RATE` classification.** Already recorded in the packs themselves, in
  comments that state the redundancy and the reason for keeping them. The probe
  confirms the packs' account; nothing to add.
- **Trunk-prefix authoring.** The SG `1900` defect class (a bare prefix that can
  never match because `analysePhone` compares against `"0" + nationalNumber`).
  Spot-checked against real numbers for DE, ZA and JP; all authored in correct
  trunk form.
- **`trustedHostSuffixes` vs `brandSuffixes` confusion.** The distinction the
  PSL adoption had to unpick. DE's comment shows it being applied correctly
  (`bund.de` in one field and deliberately not the other, with the reason
  stated). No pack in the wave conflates them.
- **Agency-mention substring collisions.** DE excludes bare `bundesamt` and
  `finanzamt` for naming a *kind* of office rather than a specific one — the
  generic-term trap, already handled.

## Watchlist

- **The universal `EMERGENCY_NUMBERS` set now overlaps the pack union.** Both
  are consulted and membership is all that matters, so the duplication is
  harmless today. If the hardcoded set is ever narrowed on the grounds that
  "the packs cover it", check `ZZ` first: a user in an unpacked region relies
  on the hardcoded set, and `REST_OF_WORLD` authors no numbers of its own.
- **Not probed: the six agency lists as impersonation surface.** Whether a
  scam naming `BSI` or `SARS` scores appropriately is a question about the
  keyword layer, which for five of these six regions is English against
  non-English messaging — item 4b's gap, not a defect this probe can resolve.
