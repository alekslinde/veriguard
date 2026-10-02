# Versioning

Every shippable part carries its own version, and **nobody edits a version by
hand**. release-please reads the commit messages on `main`, works out the next
number for each part, and keeps a release pull request open per part. Merging
that PR is what bumps the version, writes the changelog, creates the tag and
publishes the GitHub Release.

So the question this file used to answer — "which number do I bump in my PR?" —
is now answered by the **type of your commit**. Get the type right and the
number follows.

Format is [semantic versioning](https://semver.org): `MAJOR.MINOR.PATCH`.

---

## The five version lines

Each part is versioned by what its own users would notice, and they move
independently: the app's version never changes because the engine shipped, and
the reverse.

| Part | Path | Tag | Who notices a version change |
|---|---|---|---|
| App | `.` (excluding the four below) | `app-vX.Y.Z` | People using the site |
| Detection engine | `packages/detect` | `engine-vX.Y.Z` | npm consumers, the app, the extension |
| MCP server | `packages/mcp` | `mcp-vX.Y.Z` | npm consumers, MCP clients |
| Browser extension | `extension` | `extension-vX.Y.Z` | Chrome, Edge, Firefox and Safari users |
| Inbound email worker | `workers/inbound-email` | `worker-vX.Y.Z` | People who forward emails |

The app's line continues under `app-v`. Its older bare `vX.Y.Z` tags
(`v0.26.9`, `v0.28.1`, `v0.36.0`) stay exactly as they are — tags are permanent
history, and the prefixed line starts beside them rather than replacing them.

Which part a commit belongs to is decided by the **paths it touches**, not by
its scope word. A commit editing `packages/detect/src` releases the engine; one
editing `components/` releases the app. A commit touching both appears in both
parts' release PRs.

---

## Which type to use

The usual semver question is "does this break a consumer's build?" That is the
wrong question here: most consumers are **people relying on a verdict**, not
programs calling an API. So the rule is framed around what a user would notice.

| Commit type | Bump | When | Examples |
|---|---|---|---|
| `fix:` | PATCH | A fix that only removes wrong output | A false positive removed with no other verdict affected |
| `feat:` | MINOR | New capability, or detection that flags something it previously missed | A new region pack. New scam patterns. A new input type. Anything that can turn a "safe" into a "suspicious" |
| `feat!:` or a `BREAKING CHANGE:` footer | MAJOR, or MINOR below 1.0 | The tool's promises change | The privacy contract changes; a verdict's meaning changes; a supported surface is withdrawn |
| `refactor:` `perf:` `docs:` `test:` `chore:` `ci:` `build:` | None | Nothing a user would notice | Refactors, tests, docs, tooling, CI |

Note the last row: a `chore:` or `refactor:` commit produces **no release at
all**, where the old rule asked for a PATCH bump. That is deliberate — a version
that moves without anything shipping tells a reader nothing.

### Below 1.0, a breaking change bumps the minor

Every part is on `0.x`, and `bump-minor-pre-major` is set, so a `feat!:` below
1.0 goes 0.38.0 → 0.39.0 rather than to 1.0.0. Nothing reaches 1.0.0 by
accident; see *Reaching 1.0.0*, below.

### The asymmetry that matters

**Detection that starts flagging more is `feat:`. Detection that stops flagging
something is `fix:`** — but only when it is removing output that was wrong.

A change that makes the detector quieter about real scams is not a fix and
usually not a version question at all; it is a regression. If you cannot say
which false positive you removed and show a test proving real detection still
fires, the type is not the problem you have.

### Worked examples from this repo

| Change | Type | Why |
|---|---|---|
| Rate-limit `/api/check` (#201) | `fix:` or `chore:` | No verdict changes |
| On-device OCR (#201) | `feat:` | Images stop leaving the device — a user-visible capability change |
| Privacy-invariant test (#202) | `test:` | Test only; no release |
| Defanged URLs scored (#202) | `feat:` | Input that previously produced no verdict now produces one |
| Verdict emails explain themselves (#204) | `feat:` | New user-facing content |
| SMS rule no longer applied to email (#205) | `fix:` | Removes a wrong flag; nothing else moves |
| Own-domain senders (#207) | `fix:` | Same — one false positive class removed |
| Word-boundary matching (#208) | `fix:` | Same, and every existing test passed unchanged |

---

## How to write the commit

Pull requests are **squash-merged with the PR title as the commit message**, so
the PR title is the commit release-please parses. Get that right and there is
nothing else to do.

```
feat(detector): score defanged URLs
fix(ui): stop the verdict card clipping on narrow screens
chore(config): bump eslint
```

A `pr-title.yml` check rejects a title it cannot parse. That check is
load-bearing rather than style policing: an unparseable title produces no bump
and no changelog entry, so the change would ship silently under whatever number
the last release happened to set.

For a breaking change, either mark the type or add the footer:

```
feat(detector)!: withdraw the legacy verdict shape
```

Scopes are the ones listed in `CLAUDE.md`. They do not affect the version — the
paths decide the part, the type decides the number — but they make the changelog
readable.

**Do not run `npm version`.** The version in each `package.json` is written by
release-please when a release PR merges. A hand-edited version will be
overwritten, and in the meantime it disagrees with the manifest.

---

## Reaching 1.0.0

Nothing reaches 1.0.0 by accident. The `0.x` line can take breaking changes for
as long as it needs to.

When you decide a part's v1 features are ready:

1. Plan toward it with a GitHub Milestone (`v1.0`) holding the issues v1 needs.
   Milestones track the plan, not code.
2. Optionally ship previews first as pre-releases (`app-v1.0.0-rc.1`), marked as
   pre-release on GitHub.
3. Merge a commit whose body says `Release-As: 1.0.0`. release-please then
   proposes 1.0.0 in that part's release PR.
4. Write the 1.0.0 Release notes as the announcement: what v1 promises.
5. Merge the release PR. That creates `app-v1.0.0`, its Release and the deploy.

The parts do not have to reach 1.0 together. The engine can stay `0.x` while the
app is 1.0, or the reverse.

---

## Tagging

Tags are created by the release workflow, never by hand. A tag exists because a
release PR merged, which means a tag always has a changelog entry and a GitHub
Release behind it.

A milestone is a version whose notes say so — not a separate kind of tag.

See [`releases.md`](releases.md) for what happens after a tag is created.
