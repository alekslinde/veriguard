# Releases

`main` is integration. `production` is what users see. Nothing reaches
production except through a `main` → `production` promotion.

```
feature PR → main → promotion PR → production → deployed
```

The host deploys one branch, and that branch is `production`. Merges to `main`
therefore ship nothing; production moves only when the promotion PR merges.
Tags mark the deployed state afterwards — see [`versioning.md`](versioning.md)
for the bump-in-PR / tag-after-deploy convention this builds on.

Keeping a single deployed branch is a cost control as much as a safety one: it
decouples how often work merges from how often it deploys.

---

## One-time setup (maintainer, manual)

1. Create the branch once: `git checkout main && git pull && git checkout -b production && git push -u origin production`.
2. Point the host's deployed branch at `production`, and stop it building any
   other branch — otherwise every merge to `main` still consumes a build.
3. Add a branch protection rule on `production`:
   - Require a pull request before merging, 1 maintainer approval
   - Require status checks (CI) to pass
   - No direct pushes, no deletions. Forks can't touch it regardless.

Until step 2 is done, the promotion workflow no-ops with a notice and the
drift check reports "not configured" rather than a false all-clear — until the
deployed branch actually points at `production`, every merge to `main` is
still deploying.

## Knowing when to promote

`scripts/check-deploy-drift.ts` measures two things separately, because they
go wrong separately: **age** (how long since production moved — detection
sitting on `main` helps nobody) and **size** (how many commits are waiting — a
big promotion is harder to review and roll back, which is what makes the next
one feel risky enough to defer again). Past 14 days or 40 commits it refreshes
a "🚢 Production is behind main" issue; promoting closes it.

Run it locally any time: `npm run check-deploy-drift`.

---

## What goes into prod

**Rides the next promotion:**
- Detection changes (new patterns, region packs, new input types)
- User-visible fixes (`ui`, `api`, false-positive removals)
- Batched Radar / Calendar content — daily sweeps accumulate on `main` and ship together, never one deploy per sweep

**Never triggers a promotion alone:**
- Docs-only, CI-only, tests, tooling (a `PATCH` with no verdict change)
- Anything with red CI on `main`

**Out-of-band (same-day) promotion only for:**
- Broken production, a wrong verdict in the wild, or a security / privacy fix

Anything else waits for the next promotion.

There is no fixed cadence and no scheduled PR — a weekly PR that is usually
closed unmerged trains you to ignore it. Instead, **Deploy drift** watches the
gap and opens a single flag issue once `production` is 14+ days or 40+ commits
behind. Promote when that lands, or whenever the work on `main` warrants it.

---

## How to promote

1. Run the **Promotion train** workflow (`workflow_dispatch`) to open the
   "Promote main → production" PR, then merge it. The diff review is "what
   shipped since the last tag" — line review already happened on `main`.
2. Tag the merge on `main` after it lands, never a feature branch:
   `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`, then cut a GitHub
   Release. `production` must always equal a tag.
3. Verify the production deployment, then move on.

**Hotfix:** branch off `production`, fix, merge to `production` (deploys now)
*and* to `main` (keeps them in sync). Tag `PATCH`.

**Rollback:** revert on `production`, or reset it to the previous tag and
force-push only `production` (the one branch where this is acceptable, with
maintainer sign-off).
