# Threat Intelligence Roadmaps

Periodic research briefs for Veriguard. Each roadmap surveys new and
evolving scam tactics targeting Australians, then proposes concrete detection
changes to `lib/`.

**Roadmaps are research-and-proposals only. They never modify `lib/`.** The
detection code ships separately, via numbered issues, in its own PR with tests.
That separation is deliberate — it keeps the evidence layer reviewable on its
own terms, and keeps detection PRs small enough to review as code.

---

## Why these are kept

Detection here is hardcoded keyword lists, regexes, and weighted scores — the
kind of code that rots into unexplainable magic strings. These files are the
provenance layer that stops that happening.

1. **Evidence for every rule.** Why is `.bond` worth +30? Why is
   `"quantum ai"` +50? Without a roadmap those are arbitrary. With one, `.bond`
   traces to Interisle's measurement that it is 100% maliciously registered, and
   `"quantum ai"` to a named ASIC warning. For a tool that publicly tells people
   "this is a scam", being able to show the working matters.

   This cuts both ways, which is the point. `.monster` was the example used here
   until 2026-08-29, when checking it against Interisle's *Phishing Landscape
   2025* showed the CSC DBS ">60% abuse" figure behind it has no independent
   corroboration — `.monster` is not individually measured by anyone. It stays
   in the list on cohort grounds, but the traceability is what surfaced the weak
   citation. See the evidence correction in the 2026-07-26 roadmap.

2. **Negative results.** The watchlist section is as valuable as the proposals.
   *SIM swap — no text-side signal, existing brand+request detection already
   covers the preparatory SMS.* *LINE/KakaoTalk funnels — insufficient AU
   evidence, FP risk too high.* Recording these stops each cycle
   re-investigating the same threats and reaching the same conclusion. The
   `.shop`/`.store` promotion is the payoff: watchlisted on 2026-07-01 for
   insufficient evidence, promoted on 2026-07-26 once Barracuda and Brandsec
   published. That only works because the deferral was written down.

3. **False-positive discipline.** Every proposal carries an explicit FP-risk
   assessment. It's the guardrail against the obvious failure mode of keyword
   detection — flagging legitimate messages. It demonstrably works: two
   2026-07-26 proposals (D3, D5) were changed during implementation on FP and
   correct-advice grounds.

---

## The Status block convention

A roadmap is written as a forward-looking proposal, so it goes stale the moment
its proposals ship. **Once any proposal from a roadmap lands, add a Status block
directly under the title** and keep it current. Without this, a reader can't
tell a shipped roadmap from a wishlist, and the file gets misread as a
description of how the detector actually behaves.

The block has three parts. See
[`2026-07-26-threat-roadmap.md`](2026-07-26-threat-roadmap.md) for a worked
example.

### 1. A status table — one row per proposal

```markdown
## Status — as at YYYY-MM-DD

| Proposal | Issue | Shipped in | Status |
|---|---|---|---|
| D1 — High-abuse TLDs (`.shop`, `.store`, …) | #101 | #111 | ✅ Shipped |
| D7 — PDF + QR hybrid body signal | #113 | — | ⬜ Outstanding |
```

### 2. Deviations — where the implementation differed from the proposal

Record these, with the reason. They're the most valuable part of the block: a
deviation is usually a proposal that was wrong, and the reason is what stops it
being re-proposed next cycle.

> - **D3** — the foreign-authority terms did *not* go into `govMentions` as
>   proposed. That list emits "verify directly via official channels", which is
>   actively wrong advice for a Chinese police impersonation. They live in a
>   separate `foreignAuthorityMentions` list scored at +35 with its own wording.

### 3. Corrections — where the research itself was wrong

Verify proposals against the live code before shipping, and correct the file
in place (marked, not silently rewritten) when they don't hold up:

> **Correction (2026-08-02):** tested against the live regex, `"scan the QR code
> in the attached PDF…"` is already caught, so that pattern is redundant. Only
> the inverted `"the attachment contains a QR code"` phrasing is a real gap.

**Leave the original research as written.** The Status block is the only part
updated after the fact. The value of the file is what was known and argued at
the time — rewriting it to match the outcome destroys that.

---

## Cadence — what runs when

Three different rhythms, easy to conflate because all three touch this
directory:

| | Rhythm | Automated? |
|---|---|---|
| **Sweep** (threat roadmap) | Roughly weekly, by hand | No |
| **Probe** | Event-triggered — see below | No |
| **Source check** | Weekly, Tuesday ~07:00 AEST | **Yes** — the only cron here |

Only the source check is a machine. It verifies that citation links still
resolve and nothing more; it never decides a sweep is due, and a green run says
nothing about whether the research is current.

**The sweep cadence is a habit, not a schedule.** Nothing enforces it and
nothing will chase a missed week — the ~7-day spacing is visible in the
filenames and that is the whole of it. Worth knowing before reading a gap in the
dates as a system failure.

**A probe never discharges a sweep, or the reverse.** They answer opposite
questions — outward from sources, inward by attack — and running one leaves the
other exactly as outstanding as it was.

---

## Adversarial probes

A **probe** is the inward-looking counterpart to a sweep. A sweep asks *"what
are scammers doing that we don't detect?"* and answers it from sourced
advisories. A probe asks *"can our existing rules be evaded?"* and answers it by
attacking them.

This archive holds sweeps. Probing is a working practice rather than a
published one, and what follows is the method — when to run one, and why the
trigger matters more than a schedule. Same workflow as a sweep: research first,
then implementation in a separate PR with tests, then a Status block. Two
differences:

- **No sources.** The evidence is a reproduction measured against the live
  detector, so `sources.yml` is not involved.
- **The negative results are most of the value.** As with a sweep's watchlist,
  recording what was ruled out is what stops the next run re-covering it.

### When to run one

Probes are **event-triggered, not scheduled** — but they are *recurring*, and
those two things are easy to confuse. A timer would have you probing quiet code
on a due date; the trigger points you at code that just moved, which is where
the defects have actually been. Run one when:

- **a parser changes** — anything that reads untrusted input and decides what it
  is;
- **a new input form is accepted** — a new surface, or an existing one starting
  to receive a different *shape* of input;
- **a run of false positives** suggests the rules were never pushed on;
- **a phase is about to widen the surface** — probe before, not after. This is
  the one the ecosystem roadmap cares about: breadth multiplies whatever the
  engine already gets wrong across every new client.

**Why the trigger beats a schedule.** A due date sends you at whatever is
quiet; a trigger sends you at what just moved, which is where defects are. Aim
at the machinery the new code *uses*, not only at the lines it changed — a
change's blind spots are inherited by anything scoped to its diff.

The honest limit: **a probe only finds what the person running it thought to
try.** A record of attempts is never a clean bill of health.

---

## The source registry

[`sources.yml`](sources.yml) is the curated list of sources this research draws
on, tiered by how much weight a claim from each carries: **1** authoritative
(government / regulator), **2** reputable vendor and press, **3** low-trust,
cited once and unvetted.

Research should read **from the registry** rather than from open web search. The
citation census that built it turned up `scamwatchhq.com` — not the ACCC, an
unaffiliated lookalike — cited beside `asic.gov.au` with nothing marking the
difference. Open search will keep finding sites like that. Adding a source is a
deliberate, reviewed act; tier 3 exists so a source that has already been looked
at and found wanting is not silently rediscovered next cycle.

Tier 2 holds two different kinds of source, and the distinction matters when
you are justifying a number. Most of it is vendor and press reporting —
commercially interested, so corroborate before it carries a score alone. The
rest is **measurement**: peer-reviewed venues (APWG eCrime, USENIX, NDSS, IMC)
and independent measurement bodies (Interisle, ICANN DAAR). Those have no
product to sell and publish their methodology, so for a *base rate* — TLD abuse
percentage, typosquat prevalence, URL lifetime — they are the strongest evidence
in the file and the intended corroborator for vendor-measured magic numbers like
the `cscdbs.com` figure behind the `.monster` score.

They stay in tier 2 rather than tier 1 because tier 1 means authority over a
*live AU threat*, sufficient on its own for a rule; a measurement paper is not
that however rigorous. Two limits travel with them: publication lags the threat
by 6-18 months, so they calibrate a score but never source a new pattern; and
their sampling is overwhelmingly US/EU, so an AU-specific claim still needs an
AU tier 1 source.

Two conventions matter:

- **`indicators:`** at the bottom of the file is *not* a source list. Those are
  scam domains quoted as evidence in the roadmaps. They are never fetched, and
  the checker fails the run if one is ever moved into a source tier.
- **`retired: true`** marks a source that is known-gone and kept as a record.
  Retired sources are skipped by the checker but stay in the file, because a
  roadmap claim resting on a dead citation is a claim that needs re-sourcing.

`scripts/check-sources.mjs` verifies every source URL still resolves:

```bash
node scripts/check-sources.mjs             # human-readable report
node scripts/check-sources.mjs --validate  # structure only, no network
node scripts/check-sources.mjs --markdown  # issue-body format
```

[`.github/workflows/source-check.yml`](../../.github/workflows/source-check.yml)
runs it weekly (Tuesday ~07:00 AEST) and refreshes a single
**🔗 Threat-intel source check** issue. It checks *reachability only* — whether a
source has published anything new is research, not a cron job. It flags; it never
edits the registry.

Link rot is the quiet failure here. When a citation 404s, the evidence for a
hardcoded score in `lib/` is gone and only the magic number is left — the exact
decay the archive exists to prevent.

---

## Verify against the live engine before filing

**Every proposed phrase is measured against the live detector before it reaches
an issue.** Same before/after discipline a probe uses — a sweep looks outward
for threats, but a proposal is a claim about *our code*, and that claim is
checked the same way either direction.

The region word lists are not the whole detector. `packages/engine/src/scamDetector.ts`
carries composite signals — `jobSignals`, `investmentGroupSignals`, the quishing
regex — that already cover patterns a word-list grep reports as missing. Grep
both, or the proposal describes a gap that isn't there.

For each candidate phrase, record the current verdict and score, then:

- **Already ≥ `suspicious` on the phrase alone** — drop it, or state in the
  proposal what the addition buys beyond the existing signal. It may still be
  worth adding to sharpen a generic hit into a specific one; that is an argument
  to make explicitly, not to leave implied.
- **Substring of an existing entry** — drop it. Lists are substring-matched and
  `checkCustom` sums every hit, so an overlapping entry scores one phrase twice
  and can move a verdict on its own. The engine records three prior instances of
  exactly this bug: `mygovid` and `new bsb` (`regions/au.ts`), and `updated bank details`
  (`regions/base.ts`, with the fix in `scamDetector.ts`).
- **Covered by a composite** — propose extending the composite, not the word
  list. A phrase bolted onto a list to catch something a composite nearly
  catches will usually double-score against the composite's own regex.

**Acceptance criteria must assert a verdict the engine does not already return.**
A criterion of "→ `suspicious` or `likely_scam`" on a phrase that already scores
24 passes before anyone writes a line of code, which makes the issue unfalsifiable
and the eventual PR unreviewable. Name the target verdict, the score, or the
specific signal that must fire.

### Why this is a gate and not a review note

This check already exists in this archive as a *correction*. The 2026-07-26
roadmap proposed two QR patterns; testing them against the live regex on
2026-08-02 found one already caught and one a genuine gap — "half right", as the
correction puts it. That is the useful shape of the result, and it arrived
during implementation, after the proposal was written and filed. Running the
same test before the issue is opened costs one scratch test file instead of a
wasted implementation PR, and files an issue scoped to the half that is real.

The audit of the 2026-08-31 cycle is the argument for the move: of three HIGH
proposals, one was already fully caught by `jobSignals`, one was half-caught by
the quishing regex, and both carried a phrase that would have double-scored.
None of that was visible from the word lists alone.

---

## Workflow

1. Branch `threat-intel/YYYY-MM-DD`, write the roadmap, open a docs PR.
   Every proposed phrase carries a measured before-score — see
   [Verify against the live engine](#verify-against-the-live-engine-before-filing).
2. Open one issue per HIGH-priority proposal, tagged `[threat-intel]`, each
   linking back to the roadmap file and its D-number.
3. Implement in a **separate** PR, with tests in `__tests__/` — detection
   changes must ship with coverage.
4. Add or update the Status block on the roadmap, then **merge the docs PR**.
5. **Promote the cycle into the user-facing surfaces**, with test coverage:
   - `lib/threatRadar.ts` — add the cycle's *consumer-facing* campaigns (the
     ones a member of the public could actually meet; infrastructure findings
     stay in docs), set their `lastSeen`/`roadmap` to this sweep, and re-check
     every entry's `status` against the authoring rule in `threatRadar.ts`:
     `active` means a sweep in the last fortnight confirmed it, so an entry
     whose `lastSeen` is older than the two most recent sweeps becomes
     `watchlist`.

     **Nothing is removed or replaced by a promotion.** Entries are added to
     the existing set, and `watchlist` is not a demotion or a statement that a
     threat has stopped — the entry stays on the page with its content and
     provenance intact. The status records *how recently a sweep confirmed
     it*, not how dangerous it is; an entry is still relevant simply by being
     listed. Keeping entries `active` because they still feel current is the
     one thing the rule exists to prevent: `active` stops carrying information
     the moment it covers everything ever recorded. Standing tactics that run
     continuously rather than in waves are the documented exception — see the
     `RadarStatus` authoring rule for what earns it.
   - `lib/scamCalendar.ts` — re-review the seasons against the fresh intel and
     bump their `reviewed` date. Only add a season for a genuinely *seasonal*
     spike; a year-round campaign belongs on the radar, not the calendar.

   This is the step that feeds the public `/radar` and `/calendar` pages. It is
   an editorial call (what a member of the public can act on), so it stays a
   human step rather than being auto-generated — but it is **not optional**, and
   [`promotion-freshness.yml`](../../.github/workflows/promotion-freshness.yml)
   now flags a sweep that has merged without it (see below).

Steps 4 and 5 are the ones that get skipped. See below.

---

## Known gaps in this archive

**The 2026-07-05 and 2026-07-12 roadmaps are missing.** Their detection code
shipped to main (issues #73–#85, implemented in #87), but both docs PRs (#79,
#86) were closed unmerged, so the research files never landed. Thirteen shipped
detection rules currently have no evidence trail on main. The files still exist
on `origin/threat-intel/2026-07-05` and `origin/threat-intel/2026-07-12` and
could be recovered.

This is exactly the failure the Status-block convention is meant to prevent:
the code shipped, the research was treated as disposable once it had served its
purpose, and the provenance was lost. **Merge the docs PR — it is not
optional.**

The 2026-06-21 and 2026-07-01 roadmaps predate this convention and have no
Status block. Their header notes record implementation status in prose
("all D1–D17 from that run are now implemented"), which is weaker but adequate;
they have not been backfilled.

**"No new threats identified" has meant "no sources registered."** Until
2026-09-09 the registry held tier-1 sources for AU (17) and US (1) and none at
all for GB, NZ, CA, IE or SG. Because the research reads *from* `sources.yml`
rather than from open search, a region with no registered authority could only
ever yield no findings — and several sweeps then recorded "no new materially
distinct threats identified" for NZ, CA and IE. Read those lines as *not
researched to the same depth*, never as *nothing is happening*: they are an
artifact of an empty source list, not an observation about those countries.

The 2026-09-06 NZ section names CERT NZ and Netsafe as checked while neither was
in the registry, which is the clearest symptom — and CERT NZ had by then been
folded into NZ's NCSC, so the body named in the prose no longer published under
that name.

Tier-1 sources for all five regions were registered on 2026-09-09, and
[`check-source-coverage.ts`](../../scripts/check-source-coverage.ts) now reports
any supported region with none (`npm run check-source-coverage`). What that does
**not** do is backfill the cycles already written: the NZ, CA and IE sections of
sweeps before 2026-09-09 remain unevidenced, and the surfaces promoted from them
should not be treated as reviewed for those regions. The affected calendars are
deliberately left showing their real, older `reviewed` dates rather than being
bumped forward — a visibly stale date is the honest signal when the review did
not happen.
