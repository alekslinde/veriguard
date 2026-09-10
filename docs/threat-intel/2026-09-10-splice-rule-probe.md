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
| P9 — Schemeless-host strip deletes prose, removing the splice signal | — | this branch | ✅ Fixed |
| P10 — ASCII-only host labels strip a spliced host partially | — | this branch | ✅ Fixed |

Both were found and fixed in the same cycle, so neither was filed separately.

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

- **`AMBIGUOUS_BARE_TLDS` is not consulted by the strip — confirmed, not
  theoretical.** `extractBareHosts` treats `.zip`, `.mov` and `.bond` as needing
  a path or `www.` before they count as hosts, because they read as ordinary
  words. The strip's TLD gate does not make that distinction, so:

  ```
  the deposіt.bond is refundable        0  safe   no flag
  ```

  This is P9 surviving in miniature: the same class of word the fix was about,
  through the corroboration rule the fix did not inherit. Left as a watchlist
  item rather than fixed in this cycle, deliberately — the rule has now been
  wrong three times about conditions, and the right fix is to consult
  `extractBareHosts`'s judgement wholesale rather than to bolt on a fourth
  condition. That is a refactor, and it wants its own change.
