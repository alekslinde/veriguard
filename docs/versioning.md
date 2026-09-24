# Versioning

The app version lives in `package.json` and is bumped **in the PR that makes
the change**, not in a separate release step. There is no build artefact and no
package on npm — the version exists so a person reading an issue, a verdict
screenshot, or a bug report can tell which behaviour they were looking at.

Format is [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

---

## Which number to bump

The usual semver question is "does this break a consumer's build?" That is the
wrong question here: the consumers are **people relying on a verdict**, not
programs calling an API. So the rule is framed around what a user would notice.

| Bump | When | Examples |
|---|---|---|
| **PATCH** | Nothing a user would notice differently, or a fix that only removes wrong output | Refactors, tests, docs, tooling, CI. A false positive removed with no other verdict affected. |
| **MINOR** | New capability, or detection that flags something it previously missed | A new region pack. New scam patterns. A new input type. Anything that can turn a "safe" into a "suspicious". |
| **MAJOR** | The tool's promises change | The privacy contract changes; a verdict's meaning changes; a supported surface is withdrawn. Expected to be rare, and to warrant its own discussion. |

### The asymmetry that matters

**Detection that starts flagging more is MINOR. Detection that stops flagging
something is PATCH** — but only when it is removing output that was wrong.

A change that makes the detector quieter about real scams is not a patch and
usually not a version question at all; it is a regression. If you cannot say
which false positive you removed and show a test proving real detection still
fires, the bump is not the problem you have.

### Worked examples from this repo

| Change | Bump | Why |
|---|---|---|
| Rate-limit `/api/check` (#201) | PATCH | No verdict changes |
| On-device OCR (#201) | MINOR | Images stop leaving the device — a user-visible capability change |
| Privacy-invariant test (#202) | PATCH | Test only |
| Defanged URLs scored (#202) | MINOR | Input that previously produced no verdict now produces one |
| Verdict emails explain themselves (#204) | MINOR | New user-facing content |
| SMS rule no longer applied to email (#205) | PATCH | Removes a wrong flag; nothing else moves |
| Own-domain senders (#207) | PATCH | Same — one false positive class removed |
| Word-boundary matching (#208) | PATCH | Same, and every existing test passed unchanged |

Several changes can land between bumps. Bump once per PR, to the highest level
any commit in it warrants.

---

## How to bump

In the same PR as the change:

```bash
npm version patch --no-git-tag-version   # or minor / major
```

`--no-git-tag-version` matters: it edits `package.json` without creating a tag
or a commit, so the bump joins your own commit and the PR stays a single unit
of review. Tagging is a separate, deliberate act — see below.

**Do not bump** for a PR that changes nothing shipped: a docs-only change, a CI
fix, or a revert that restores the previous version.

---

## Parts versioned on their own

Three parts ship on their own schedule, so each carries its own version in its
own `package.json`. The app's version never moves because of them, and they
never move because of the app.

| Part | File | Bump it when |
|---|---|---|
| Detection engine | `packages/engine/package.json` | Anything in `packages/engine/src` changes. The app bumps too, since it serves the engine. |
| Browser extension | `extension/package.json` | Anything in the extension build changes. Every store submission needs a number higher than the last one shipped, and a shipped number can never be reused. |
| Inbound email worker | `workers/inbound-email/package.json` | Anything in `workers/inbound-email/src` changes. |

The same table of PATCH, MINOR and MAJOR applies to each, judged by what that
part's own users would notice. For the worker, that means the reply someone
gets after forwarding an email: a reply where there used to be silence is
MINOR, and so is new wording in the reply. A fix nobody would see in their
inbox is PATCH.

Bump each from its own directory, the same way:

```bash
cd workers/inbound-email && npm version patch --no-git-tag-version
```

---

## Tagging

Tags mark a deployed state worth referring back to, not every merge. Tag when
you want to be able to say "the behaviour on the 14th was `v0.3.0`" — after a
detection change reaches production, or before a change you might need to
reason backwards from.

```bash
git tag -a v0.3.0 -m "Own-domain senders, word-boundary matching"
git push origin v0.3.0
```

Tag `main` after the merge, never a feature branch.
