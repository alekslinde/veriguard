# Corpus eval

Aggregate quality measurement for the detection engine. Run it with:

```bash
npm run eval                          # gate against thresholds + baseline
npm run eval -- --suspicious-as=clean # sensitivity: treat "suspicious" as a pass
npm run eval -- --update-baseline     # re-record after an intended change
npm run eval -- --json                # machine-readable
```

## Why this is not in `__tests__/`

Unit tests assert **behaviour** — "this input must raise that flag" — and a red
one is a bug. The eval asserts **aggregate quality** — "recall ≥ 0.90 without
FPR getting worse" — and a red one is a judgement call about a trade someone
made. Keeping them in one suite makes both harder to read, and makes `npm test`
slow and flaky as the corpus grows. `npm test` stays the fast gate; `npm run eval` is
the deliberate one.

`__tests__/evalHarness.test.ts` is the exception: it unit-tests the harness
itself, because a metrics bug that scored everything correct would leave the
gate green and useless.

## What it measures

The runner calls `analyzeContent` — the same entrypoint as
`app/api/check/route.ts` — and reduces the resulting cards to the worst verdict,
because that is the one a user acts on. Measuring the per-type checkers instead
understates the engine: a message whose only signal is the hostname scores 0 as
a message and 85 as a URL card.

Two things are deliberately excluded so a run is reproducible:

- **The URLhaus blocklist.** `getUrlhausBlocklist()` is network-backed; including
  it would make a corpus regression and an abuse.ch feed update look identical.
- **URL expansion.** The fetcher is stubbed to throw.

A run is therefore a pure function of (corpus, region packs, engine).

## Metrics

| Metric | Reading it |
|---|---|
| Recall | Share of scams caught. |
| **FPR** | Share of benign content flagged. The one that matters most for a consumer tool — telling someone a real AusPost message is a scam costs trust that is hard to win back. |
| Precision | Depends on the corpus scam:benign ratio, which is not the real-world one. Reported with the committed counts beside it; do not quote it alone. |
| Coverage rate | Share of cases where the engine committed rather than abstaining. |
| Score p50/p90 | Verdicts are thresholded, so a change can erode margin with no metric movement and then flip many cases at once. This gives warning. |

### Confidence intervals

Every rate is printed with a 95% Wilson interval and the denominator it came
from. This is not decoration: at corpus sizes in the tens the sampling error
dwarfs the differences the thresholds try to police.

```
recall    96.0%   95% CI [80.5, 99.3]  n=  25   ±9pp
FPR       23.5%   95% CI [9.6, 47.3]   n=  17   ±19pp
```

A recall of 96% that could plausibly be 80% is not a measurement, and the
interval is what makes that impossible to miss. In the slice tables the effect
is starker still — a region with one scam case reports `100.0% [21-100]`, which
reads correctly as "we know nothing about this region".

Wilson rather than the textbook normal approximation because the corpus lives
exactly where the normal one fails: small n and proportions near 0 or 1. At
12/12 the normal interval is [1.0, 1.0] — certainty from twelve observations —
while Wilson gives roughly [0.76, 1.0].

The headline block ends with the widest gated interval and what it supports.
Rough guide, **per slice** rather than per corpus:

| Cases per class | Half-width | Supports |
|---|---|---|
| 45 | ±15pp | Nothing quantitative |
| 150 | ±7pp | Coarse gating |
| 400 | ±4pp | Real thresholds |
| 1000+ | ±2pp | Detecting small regressions |

Gating still compares **point estimates** against the thresholds, and a breach
still fails the run even when the interval is wide — a gate that ignored what it
could not prove would pass everything at small n, which is the opposite of what
a ratchet is for. But a breach whose limit falls inside the interval is marked
`inconclusive` and says so in the output, which tells you whether to investigate
the detector or add cases to that slice.

### Abstention

`toPrediction` returns three values, not two. Under `coverage: "partial"` or
`"none"` the engine correctly declines to assert anything, and counting that as
a miss would make an honest pack look broken. CA ships `partial` while it has no
French reviewer, so CA cases abstain in bulk — that belongs in the coverage
metric, never in recall.

### `suspicious`

Counted as `flagged` by default, since the user sees a warning either way. It is
a flag rather than a decision because the headline numbers depend on it heavily:
on the seed corpus, `--suspicious-as=clean` moves FPR from ~27% to 0% and recall
from ~96% to ~77%. Effectively the entire precision/recall trade lives in that
one tier.

## Privacy

The corpus is real submissions in a git repository: checked in, cloned,
permanent, greppable. That is a different exposure from a database row, so the
check runs at load time rather than being trusted to authoring time.

It is **not** plain `scrubPii` equality. `scrubPii` redacts every address and
number, which is right for a reporter's description and wrong here: the
scammer's `From: noreply@evil.tk` is the evidence `emailHeaders.ts` scores on.
So:

1. `stripReporterHeaders` must be a no-op. A case carrying `Delivered-To` /
   `Received` / `X-Original-To` holds the *recipient's* mailbox and relay path,
   which is never evidence.
2. Every remaining PII-shaped token must appear in the case's `identifiers`
   array, written by hand.

Scam identifiers survive because someone consciously listed them; a victim's
number pasted in by accident does not.

The span-finding behind rule 2 lives in `lib/piiScrubber.ts` (`findPii`), beside
the patterns themselves. An earlier version recovered spans out here by diffing
scrubbed output against the original, which does not work: replacements change
the string's length, so a span can only be re-located by guessing at
surrounding context. Two redactions closer together than the guess width merged
into one blob — and because the error message names the blob as the string to
declare, an author copying it into `identifiers` silently whitelisted every
address inside, victim's included. `__tests__/evalHarness.test.ts` and the
`findPii` block in `__tests__/piiScrubber.test.ts` hold that shut.

### Using real reports

No extra consent field is needed, and an earlier draft of this file was wrong to
call one a prerequisite. Submitters are already told at submission time that
their report helps protect others (`report.valuable`), and the submissions feed
publishes reports openly as "unverified, anonymised" (`subs.subtitle`). Internal
regression testing is a narrower use than the publication they have already been
told about, so it is covered.

What does differ from the public feed is **retention shape**, and that is what
the rules above are for. A feed row can be deleted; a corpus case is in git
history, effectively permanently. And unlike the feed — where
`app/api/report/route.ts` runs `scrubPii` over everything with no exceptions —
the corpus deliberately preserves declared identifiers, because
`emailHeaders.ts` scores on the sender pair. That is defensible for a scammer's
address and never for a victim's, which is precisely what the per-token
declaration gate enforces.

So when drawing cases from real reports:

- Keep `source: "report:<id>"`. Provenance is what makes a case auditable later,
  and removable if a submitter ever asks.
- Declare only the **scammer's** identifiers. If a victim's address or number is
  in the content, remove it — never declare it to quiet the error.
- Remember that removal means rewriting git history, not deleting a row. Treat
  adding a case as a durable decision.

## Adding a case

One JSON object per line in a `corpus/*.jsonl` file:

```json
{"id":"au-sms-0042","type":"sms","region":"AU","content":"...","label":"scam","category":"parcel-delivery","source":"report:r_8fk2","addedAt":"2026-08-29"}
```

`label` is binary (`scam` / `benign`) and deliberately not the four-way verdict,
so the verdict taxonomy can change without relabelling anything. `region` is
required — coverage varies by region and changes what a clean result means.
`category` is free text, because new lures appear faster than an enum can be
maintained, and slicing recall by it is where regressions actually surface.

## Thresholds — withdrawn

**This project does not quote a false-positive rate, a recall figure, or any
aggregate detection metric.** Every gate in `thresholds.json` is `null`, and
that is the settled position rather than a gap waiting to be filled.

The corpus eval is a **ratchet, not a measurement**. `baseline.json` records a
per-case prediction, and a run fails when a case that was right becomes wrong.
That question needs no statistical validity: it compares this run against the
previous run, not against a claim about the world.

### Why they went

The gates sat at 0.3 FPR against a stated target of 0.02 — deliberately, so the
run would not be permanently red. **That gap was the tell.** A gate nobody
expects to bind is not a standard, and the longer it sat in the repo the likelier
one of its numbers ended up quoted somewhere it could not be supported.

What settled it was working out what would actually *breach* each gate at the
corpus sizes we have:

| Slice | Scam cases | Recall gate | Misses to breach |
|---|---|---|---|
| AU | 26 | 0.90 | 3 |
| GB | 2 | 0.85 | 1 |
| US | 1 | 0.85 | 1 |
| NZ | 1 | 0.85 | 1 |
| IE | 0 | 0.85 | unreachable |

**One missed case breaches GB, US and NZ.** Those gates were already ratchets —
"never regress on this one case" — wearing a percentage that implied a
population estimate. `baseline.json` does that job properly and names the case
that flipped. IE's gate could never fire at all. Only AU has enough cases for a
gate to mean anything, and one region's coarse gate is not worth the misreading
the other five invite.

### What does the gating now

Three mechanisms, none of which needs a labelled population estimate:

| Mechanism | Question it answers |
|---|---|
| `baseline.json` | Did a case that was right become wrong? |
| Metamorphic relations | Can the engine be talked out of a verdict? |
| Region relations | Is a pack leaking, or suppressing a base signal? |

The last two need no labels at all, which is why they scale to regions we have
no corpus for — and that matters more as `minimal` packs make breadth cheap.

### Reading a run

The tables still print recall, FPR and confidence intervals per slice. **They are
diagnostics, not standards**, and the intervals are the reason: a slice reading
`100.0% [21-100]` is telling you it knows almost nothing. Read the interval
before the number, and carry neither into a claim.

### What would reopen this

A corpus with enough labelled cases per slice to distinguish the numbers being
gated — mechanical stratified sampling from `reports` plus blind labelling,
roughly a day of work no tooling removes. That is **blocked upstream**:
submission volume is too low to stratify. If it changes, the honest move is to
re-derive gates from the new corpus, not to un-`null` these.

## Known limits

- **The corpus is small and mostly handwritten.** Its numbers are a smoke test,
  not a measurement, and the run says so on every invocation. This is the limit
  that decided the thresholds question: rather than leave placeholder gates in
  place, they were withdrawn — see *Thresholds — withdrawn* above.
- **Intervals describe sampling error only.** They assume cases are drawn
  independently from the population being measured, and the seed corpus is
  hand-picked rather than sampled — so the true uncertainty is *wider* than the
  interval, by an amount nothing here can estimate. Mechanical sampling from
  real reports is what would make the interval mean what it says.
- **Hand-labelled corpora inherit the labeller's blind spots.** This is good for
  catching regressions and close to useless for discovering novel lure types. A
  recall figure means "against scams we already thought to collect".
- **Labels can be wrong.** One seed case was mislabelled benign by the author and
  caught on the first run: an AusPost SMS containing a link, which the AU pack
  correctly scores as a scam under the post-2024 no-link policy. It is kept as
  `au-sms-0013` because it is a good hard case.
- **AU false-positive rate is ~27%, and the gate reflects that rather than
  hiding it.** Four of the five incorrect commitments on the seed corpus are
  bare agency mentions with no scam signal ("Your myGov Inbox has a new
  message", a Medicare appointment confirmation), all scoring 25-40 in the
  `suspicious` tier. Whether that caution is right is a product decision the
  eval surfaces rather than settles.

---

# Metamorphic eval

```bash
npm run eval:metamorphic                       # all relations
npm run eval:metamorphic -- --list             # what the transforms do
npm run eval:metamorphic -- --only=zero-width  # one transform
npm run eval:metamorphic -- --json             # machine-readable
```

## Why it exists alongside the corpus eval

The corpus eval asks "how often is the engine right", which needs labels and is
capped by how many exist — currently tens of cases, with the confidence
intervals above. The metamorphic eval asks a question needing no labels at all:
**is the engine self-consistent?**

A metamorphic relation says how a verdict must respond to a transformation,
without knowing the right answer for either side. `0412 345 678` and
`+61 412 345 678` are the same number, so they must score the same — whatever
that score is. When they don't, that difference is a bug, and nobody had to
label anything to find it.

This matters most exactly where the corpus is weakest. Nine benign cases cannot
measure a false-positive rate, but every case can be *transformed*, so each
relation multiplies the existing corpus into hundreds of checks. It also probes
the surface an evader actually attacks: a scammer does not write new scams to
beat a detector, they rewrite the one they have until it slips through — which
is precisely a metamorphic transformation.

## The two relations

| Relation | Meaning | Example |
|---|---|---|
| `equal` | Meaning-preserving. Any verdict change is a bug. | Reformatting a phone number, recasing a hostname |
| `noWeaker` | Obfuscation. Scoring *higher* is fine; scoring lower means the trick worked. | Zero-width spaces, homoglyphs, padding |

`noWeaker` is not laziness. Several packs treat obfuscation as a signal in its
own right, so asserting equality there would file every correct penalty as a
failure and train everyone to ignore the output.

Both are judged on the **verdict**, not the score. The score is internal and
moves for legitimate reasons; the verdict is what the product asserts.

## Region relations

The two relations above transform the **content** and hold the region fixed:
"can this message be rewritten until it slips through?". A third family, in
`regionRelations.ts`, does the opposite — it holds the content fixed and varies
the **region pack**.

They are separated because they fail differently. A content transform finds
evasion. A region relation finds *pack leakage*, which is the defect class the
region programme has actually produced: four data-only packs, three defects, two
of them in already-shipped packs. No content transform can see those, because a
content transform never changes the pack.

| Relation | Asserts | Catches |
|---|---|---|
| `region-invariance` | Content with no national signal scores identically under every pack | A universal signal authored into one pack instead of `base.ts` |
| `coverage-monotonicity` | A national layer may only *add* signal, never subtract | An allowlist or suffix exemption swallowing a base detection |

Both were verified by **injecting the defect they guard against**, per the
project's standing rule that a green run is not evidence. Three findings from
that exercise are worth recording, because each changed the design:

- **Invariance compares the score, not just the verdict.** A leak scoring 10 on
  region-neutral text still reads as `unknown` beside AU's `safe` — below the
  20-point threshold — and would have been filed as the coverage gate working.
  It is not: it is a national signal firing on text with no national content,
  one edit from crossing the line.
- **Monotonicity catches total suppression, not partial.** An exempted `.co.uk`
  inside an ordinary scam sentence still scored 77 under GB against 27 under ZZ,
  because the authority mention and tax urgency covered the missing brand
  signal. The suppression was real and entirely invisible.
- **So the open-suffix probes are bare hosts.** Stripped to the URL alone, the
  same defect scores 25 under GB and 25 under ZZ — identical, because the
  national layer contributed nothing. The assertion is therefore *strict
  improvement* over `ZZ`, not merely "not worse": equality is the failure.

The probes live in the harness rather than the corpus because the corpus cannot
express them. A region-neutral fixture cannot name a national suffix by
definition, and the corpus holds no `.co.uk` case at all — which is precisely
how an over-broad `trustedHostSuffixes` entry survives a green run.

These matter more as breadth grows. A `minimal` pack is cheap enough to add in
bulk, and the base layer is where worldwide coverage actually comes from — but a
base edit changes every region at once while the corpus measures six countries.
These relations are what make that safe to do quickly.

## Composite stacks

```bash
npm run eval:metamorphic                                  # includes composites
npm run eval:metamorphic -- --seed=7 --stacks=200         # search harder
npm run eval:metamorphic -- --depth=2,3,4                 # deeper stacks
npm run eval:metamorphic -- --no-composites               # single transforms only
```

The transforms above are applied **one at a time**. That is a weaker result than
a clean run makes it look, because a relation holding individually does not make
it hold in composition. Each step may legitimately shed a few points — an
obfuscation penalty that does not fire twice, a keyword discount, a rule that
stops matching — while no single step crosses a verdict threshold. Stack several
and the sum can cross it, with every constituent check still green.

That is also what an evader does. Nobody picks one trick and stops; they rewrite
until it gets through, which means zero-width spaces *and* a homoglyph *and*
padding *and* a forward wrapper, on one message. The single-transform suite
cannot construct that message.

Stacks are **sampled, not exhaustive**: depth 2 and 3 over 14 transforms is 2,366
ordered stacks, and running all of them per case would take the suite from
hundreds of checks to hundreds of thousands. `--seed` makes a sample
reproducible, so a violation found in CI replays locally from the seed alone.
Order is part of the attack and is recorded in the id — defanging then recasing
is a different string from recasing then defanging, and the second may find no
URL to defang at all.

Three rules keep a composite sound, all enforced by the runner:

| Rule | Why |
|---|---|
| A stack's relation is its **weakest** member | `equal` ∘ `equal` still means the same thing; any `noWeaker` member is permitted to raise the score, and the composite inherits that permission |
| `applies` is re-checked at **every step**, against the running content | Step 2 is asked about the text step 1 produced, not the corpus content |
| A no-op **abandons** the stack rather than shortening it | A depth-3 stack reported under a three-name label must have applied three transforms, or the reproduction does not match |

### What it found

Rule 2 is not hypothetical — it is the rule the first run broke, and the defect
was in the **harness**, not the engine.

`benign-padding` excludes cases carrying email headers, because prose above a
`From:` line means the text is no longer an email and the header-derived signals
it loses were correctly earned. The guard was `/^[A-Za-z-]+:\s/`, anchored to the
start of the string, which is correct for every case in the corpus. But
`forwarded-prefix` puts a `---------- Forwarded message ----------` banner
*above* the header block, so the headers no longer sit at index 0, the guard
waved the case through, and the composite padded above a `From:` line after all.

Eight violations across four cases, all the same shape: `likely_scam (100) →
suspicious (38)`, with the drop landing entirely on the padding step. The signal
lost was *"Sender claims to be official but domain doesn't match"* — the
impersonation row the email path derives from headers. On `au-sms-0007` the
forward first *raised* the score 60 → 82, which is the wrapper correctly adding
signal, before padding took it to 42.

The guard is now `/^(?:From|Reply-To|Return-Path|Sender):\s/im` — multiline, and
named to the headers the email path actually keys on. **No single transform can
build the input it was written to exclude**, which is exactly why composition
found it.

The per-step trail in the violation report is what made the diagnosis a minute's
work rather than an afternoon's: it rescores every prefix of the stack, so the
step that shed the points names itself.

### Reading a composite run

`(no stack violated)` beside a large TOTAL is the healthy result. The abandoned
count below it is coverage, not failure — most sampled stacks cannot apply to
most cases (a phone reformatter over a URL-only case), and a run typically
abandons far more applications than it completes. A **rising** abandoned share
across seeds is worth a look, since it means the sample is drifting toward
stacks the corpus cannot exercise.

A clean composite run was verified the way the region relations were: by
**injecting the defect it guards against** — an engine stubbed to hold under
either single transform and collapse under both — and confirming the harness
reported it. `__tests__/composite.test.ts` holds that shut, along with the
header-guard regression above.

## Reading a run

There is no threshold to tune and no baseline to ratchet. A violation is a
self-inconsistency, which is a bug rather than a trade someone chose — so the
exit code is simply non-zero when any relation breaks.

A transform marked `(never applied)` is **not** passing: it means no case in the
corpus exercised it, and that is a corpus gap worth filling. `phone-e164` and
`fullwidth-digits` currently read this way because the corpus holds no
`type: "phone"` case and no AU-format number at all, while `phoneIntel.ts` is
the second-largest module in the engine.

## Corpus composition

| File | Cases | What it is |
|---|---|---|
| `au-sms.jsonl`, `au-url.jsonl`, `au-email.jsonl` | 47 | AU scams and a small benign set |
| `au-benign-senders.jsonl` | 10 | Genuine sender templates — see below |
| `au-phone.jsonl` | 5 | The phone path, previously unmeasured |
| `multi-region.jsonl` | 12 | GB / US / NZ / CA / fallback |

### Benign sender templates (AU)

`au-benign-senders.jsonl` holds messages sourced from what the impersonated
organisations publish about their own real mail, rather than invented benign
text. AusPost, the ATO, Services Australia and Scamwatch all publish the same
rule: a genuine unsolicited message carries **no login link** and directs you to
an app or to sign in yourself.

That makes these the hardest possible benign cases, and the right ones. The lure
vocabulary is identical to a scam's — parcel, myGov, claim, balance — and only
the absence of a link and of an ask separates them. They are also the cases a
false positive costs most: telling someone a real ATO message is a scam teaches
them to distrust the verdict *and* the sender.

Seven of the ten currently flag. The signals responsible are visible in a run:

- **"Claims to be from a government agency" (+25)** fires on any mention of the
  agency, including genuine mail from it. Every real ATO message says "ATO".
- **"Asks for sensitive info" (+15/+30)** fires on merely *naming* myGov or
  Medicare, with no request present.
- **"Prize/reward language: claim" (+12)** fires on "your claim has been
  processed" — a Medicare claim, not a prize.

### Benign sender templates (GB / US / NZ / IE / CA)

`intl-benign-senders.jsonl` extends the same sourcing to every other pack, and
it was needed: the AU set measured one region while every other had exactly
**one** benign case, reporting an FPR of "0.0% [0-79]" from a single
observation. NZ had none at all, so its rate was unmeasurable.

Six of the twelve cases scored suspicious or likely_scam when first written.
Postal operators sit in **both** `authorityMentions` and `brandMentions` in GB,
US, NZ and IE — AU is the only pack where they do not overlap — so one mention
scored twice and each half corroborated the other. `USPS: your package is out
for delivery today. No action needed.` reached likely_scam (45) while its AU
twin scored 0.

A carrier linking its **own** tracking page is the common shape, and the first
version of this corpus could not see it: all 12 cases were link-free. The brand
row's own-domain exemption rejected any subdomain, so `tools.usps.com` and
`www.royalmail.com` read as squats — and that false hit then corroborated the
deferred agency row, reinstating the very double-score the split removes. Five
cases now cover it, including a scam using the real domain as a *prefix* of the
attacker's (`royalmail.com.secure-pay.tk`), which is what a naive "allow a
preceding dot" fix would have whitelisted.

Two more were regional twins of already-fixed AU bugs: `social security` is a
service name in `requestWords` that the AU-only constant missed, and
`vehicle tax is due` sat in GB `urgencyWords` — a due date is what the genuine
DVLA reminder says, and the threat phrasing is `untaxed`.

### The phone slice

`phoneIntel.ts` is 839 lines and had no corpus coverage at all; two metamorphic
transforms reported "never applied" for want of an AU number to run against.
Every number in that file is from the ACMA drama range (0491 570 156-216),
reserved for fiction, or a documentation-style 02 9000 / 1900 number — none is a
number anyone answers.

`au-phone-1003` (an ordinary Sydney landline) scores suspicious (30): every AU
fixed line raises "easy to spoof". The note is educational and true, but it
lands as a *verdict* on any real number a user checks.

## The false-positive work, and what it did

**Read this as a record of what changed in the engine, not as a measurement.**
The numbers below are what the corpus showed before and after a specific piece
of work; the interval on the "after" figure reaches 12% against 29 benign cases,
which is why the thresholds were withdrawn and why neither number belongs in a
claim. What is durable here is the *diagnosis* — three signals that fired on a
message's subject rather than on anything wrong with it.

Against the AU benign corpus the flagged share went from 41.4% to 0.0% [0-12].
All three causes were found by the sender-template cases:

- **Agency mention** (+25) fired on any mention, including genuine mail from
  that agency. It now needs corroboration — a link, a callback number, urgency,
  an actual ask — and emits a zero-weight note when it stands alone, so the
  reader still sees that the name was noticed and judged unremarkable. Across
  every AU case carrying an authority mention this separates the classes
  exactly: benign ones have no other positive signal, scams all do.
- **Service-name-as-ask** (+15 each) claimed "asks for sensitive info: mygov"
  about a message that asked for nothing. Service names no longer gate the row,
  but still add weight alongside a genuine ask, since that pairing is the scam's
  actual shape.
- **"claim" as reward language** (+12) fired on "your claim has been processed".
  The noun sense is now excluded; the verb sense every lure uses still scores.

A fourth was in the phone path: fixed-line, toll-free and shared-cost numbers
carried a flat +30 for being spoofable. They are — every one of those line types
is — but that is a fact about the phone network, not evidence about the number in
front of the reader, and it made an ordinary landline, an 1800 number and a 1300
number all come back "suspicious". Someone checking their own GP's number was
told it was dodgy. The caution still reaches the reader through `spoofingNotes`;
it just no longer scores. What stays scored is a range unusual for its claimed
purpose — VoIP, premium rate, wangiri, elevated-volume origins.

Recall was unchanged by the fix. The interval on the resulting figure reaches
12%, i.e. 29 cases' worth of evidence rather than a settled number — which is
why the gates that once quoted it are gone. See *Thresholds — withdrawn*.

Fixing these also surfaced that six phrase-list matchers used a raw `includes()`
instead of `mentions()`, so they carried the whitespace bug fixed earlier for
everything that did use it. They are now routed through the one matcher.

## Known open violations

None. All 14 relations hold across 354 checks.

The last two — `benign-padding` on `au-sms-0010` and `au-sms-0014` — were closed
by giving the family gate a second way to recognise address. It anchored on
*position*, which is not the same thing: "Just letting you know, I got a new
number after my phone broke. Mum, can you transfer $200 for the rego?" carries
all three halves and scored **safe (0)** purely because the term is not first.
The relation was reporting a live false negative, not a harness artefact.

The gate now matches an opening term (which carries the no-comma cases the
corpus holds, "mum send me 400 my phone broke") **or** a vocative anywhere in
the body, marked by a following comma or exclamation. Both branches exclude the
subject reading, so "Mum's phone broke" and "dad said he'd transfer the 300"
stay out, and the pretext requirement is still the half a real family member
never writes.

## What a violation is not

Proof the original verdict was correct. These relations police consistency, not
accuracy: a relation holding across a transformation of a case the engine
already scores wrongly keeps it wrong. The corpus eval says whether the engine
is right; this says whether it can be talked out of it.
