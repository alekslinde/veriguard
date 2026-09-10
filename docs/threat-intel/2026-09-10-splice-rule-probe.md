# Adversarial probe — 2026-09-10

*Target: the code that moved on 2026-09-10 — body-text homoglyph splicing
(`mixedScriptWords` in `packages/engine/src/urlSanitizer.ts` and its two call
sites in `scamDetector.ts`). Trigger: two of them. A parser changed — the rule
reads untrusted text and decides what part of it is prose — and a phase is
about to widen the surface, since item 4 step 5 populates 15–20 `minimal`
packs next.*

---

## Status — as at 2026-09-10

| Finding | Issue | Shipped in | Status |
|---|---|---|---|
| P9 — Schemeless-host strip deletes prose, removing the splice signal | — | PR #289 | ✅ Fixed |
| P10 — ASCII-only host labels strip a spliced host partially | — | PR #289 | ✅ Fixed |
| P11 — Strip does not share `extractBareHosts`' guard (found on review of the P9 fix) | — | PR #289 | ✅ Fixed |

All three were found and fixed in the same cycle, so none was filed separately.
**P11 is the one worth reading:** it was introduced by the fix for P9 and found
by review, not by this probe — the probe's own watchlist had named the symptom
and deferred the cause.

---

## P9 — the strip deletes prose, and one keystroke buys silence

**Severity: HIGH.** A false negative reachable by an ordinary typo, on the rule
that had just shipped to close an evasion.

`mixedScriptWords` removes URLs before splitting text into words, so a spliced
hostname stays the URL checker's business and is not scored twice. The
schemeless half of that strip was written as `/\S+\.[a-z]{2,}(\/\S*)?/` — "a
dot followed by two or more letters".

That matches ordinary prose. A missing space after a full stop is routine in
pasted SMS, and this codebase already knows it: `extractBareHosts` carries
**three separate guards** for exactly that shape, with comments citing
"the plumber came by.Work is done" and "Mum's in hospital.ICU visiting hours".

```
Your ассount has been suspended, verify now…     35  suspicious   flagged
Your ассount.has been suspended, verify now…     10  safe         no flag
Verify your ассount.Then call us                 flag lost
```

**35/suspicious → 10/safe on one keystroke.** The strip swallowed
`ассount.has` as a hostname, so the spliced word never reached the splitter.

### Why this is the interesting one

It is the **third instance in this rule of the same mistake**: approximating a
condition that already exists nearby in a guarded form. The first two were
found in review — a channel multiplier the weight was not checked against, and
a Greek range shared with the hostname rule. This one survived review, three
injection tests and both harnesses.

Nothing could have caught it. The corpus holds no spliced case; the metamorphic
transforms rewrite messages that are already caught; and the injections tested
the guards the rule *has*, not the one it was missing. It took reading the strip
against `extractBareHosts` and asking why one had three guards and the other
none.

### Fix

Gate the strip on a **known TLD** — the same union `extractBareHosts` uses
(`BARE_HOST_TLDS` plus the pack's `suspiciousTlds`), passed in from the call
site because the second half is regional. Omitted, no schemeless stripping
happens at all: a missed strip double-scores a host, an over-broad one deletes
evidence, and guessing is the worse of the two.

## P10 — an ASCII-only label class strips a spliced host halfway

**Severity: MEDIUM.** Found while fixing P9, and introduced by the first
attempt at that fix.

The replacement host pattern used `[a-z0-9]` for label characters. A spliced
host contains a Cyrillic character by definition, so the match began *after*
it: `pаypal.com` matched as `ypal.com`, leaving `pа` behind as a word. The
strip ran, removed part of the token, and re-created the double score it exists
to prevent — while looking like it had worked.

Fixed by including the confusable ranges in the label class, exactly as
`BARE_HOST_GLOBAL` does. **The generalisation is P9's, one level down:** the
pattern was written from scratch beside one that had already solved this.

---

## Held up

Attacked and found sound. Not a clean bill of health — only a record of what
was tried.

- **Zero-width and invisible characters** inserted into a spliced word —
  still flagged (25/suspicious, verified through `analyzeContent`). They cannot
  be used to hide the splice: `normaliseUnicode` removes them on the
  `analyzeContent` path, and the Cyrillic character survives either way, since
  NFKC does not fold Cyrillic to Latin.
- **Full-width and NFKC-foldable forms** — still flagged; same reason.
- **Defanged input** (`hxxp://`, `[.]`) — still flagged. Refang runs before
  extraction and the strip sees the restored form.
- **Splicing inside an email address** — stripped with the address; the header
  identity checks own that surface.
- **Non-confusable scripts abutting Latin** (`Google地图`, `Netflix에서`) —
  correctly silent; these are ordinary writing in CJK and Indic text.
- **Greek unit symbols** (`500μg`, `10μF`, `4Ω`) — correctly silent since the
  Greek range was narrowed to true Latin lookalikes.
- **A spliced word split across a hyphen** (`re-аctivate`) — still caught.
- **Score inflation by repeating spliced words** — the signal is flat at +25
  regardless of how many words match, so padding buys nothing.

## Watchlist

*Empty. The one item that stood here — the strip not consulting
`AMBIGUOUS_BARE_TLDS` — was closed on review of PR #289, along with two further
defects of the same cause found at the same time.*

### Closed on review: the strip did not share `extractBareHosts`' guard

The P9 fix gated the strip on a TLD set and its comment claimed this was "the
same union `extractBareHosts` gates on". It was the last of that function's five
checks. The four above it are what separate a hostname from a missing space
after a full stop, and without them the strip was wrong in both directions:

| Input | Before | Cause |
|---|---|---|
| `Your ассount.co has been suspended` | 10 / safe | too loose — word-like TLD |
| `Verify your ассount.app immediately` | 10 / safe | too loose — word-like TLD |
| `Your depоsit.bond is refundable` | 0 / safe | too strict — no corroboration rule |
| `Send the аrchive.zip file when you can` | 0 / safe | too strict — no corroboration rule |
| `Urgent: click -pаypal.com to verify…` | flags `"pа"` | lookbehind included `-`, truncating the match |

Fixed by extracting `extractBareHosts`' per-match decision into
`isBareHostMatch` and giving both callers the same guard. **The probe's own
watchlist entry proposed exactly this and deferred it**; the review supplied the
missing argument, which was that the gap ran in two directions rather than one.

**The lesson is the one this probe already recorded, one level up.** P9 and P10
were "approximated a condition that exists in a guarded form nearby". So was
this — and it survived the fix *for* P9, because the fix approximated the same
judgement more precisely instead of calling it. Precision is not the property
that was missing; sharing is.
