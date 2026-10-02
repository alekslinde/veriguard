# Releases

This file covers two release paths that do not touch each other. **The app**
deploys from a branch, below. **The packages** under `packages/` publish from a
tag and never see `production` at all — see *Publishing a package*, at the end.

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
   `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`. `production` must
   always equal a tag. The tag is the deploy marker and is all a promotion
   needs; nothing reads a GitHub Release. Create a Release from the tag only
   when the maintainer decides the version is a milestone worth announcing.
3. Verify the production deployment, then move on.

**Hotfix:** branch off `production`, fix, merge to `production` (deploys now)
*and* to `main` (keeps them in sync). Tag `PATCH`.

**Rollback:** revert on `production`, or reset it to the previous tag and
force-push only `production` (the one branch where this is acceptable, with
maintainer sign-off).

---

## Publishing a package

`@veriguard/detect` and `@veriguard/mcp` publish from **tags**, independently of
the app's promotion. A merge to `main` publishes nothing; `production` is not
involved. Each package has its own prefix, because this repo also tags the app
with a bare `vX.Y.Z`:

| Package | Tag | Workflow |
|---|---|---|
| `@veriguard/detect` | `engine-vX.Y.Z` | `publish-engine.yml` |
| `@veriguard/mcp` | `mcp-vX.Y.Z` | `publish-mcp.yml` |

Bump the version in a PR as usual ([`versioning.md`](versioning.md)), merge it,
then tag the merge commit on `main`:

```bash
git tag -a engine-v0.1.1 -m "engine 0.1.1"
git push origin engine-v0.1.1
```

`git push` alone does not carry tags — push the tag by name, or nothing
triggers. The workflow refuses to run if the tag disagrees with the version in
`package.json`, so a mistyped tag fails instead of publishing a number nothing
in the history points at.

### Approving the release

The workflow **stages**; it does not publish. The tarball is held until a
maintainer approves it with 2FA:

```bash
npm stage list
npm stage approve <id>
```

That is the point of the arrangement. A version on npm cannot be replaced and
unpublishing is restricted after 72 hours, so no workflow run — including one
started by a mistyped tag — puts code in front of users by itself. Merging
reviews the change; approving the stage reviews the artifact.

### Order: engine first, always

`publish-mcp.yml` refuses to run until a **published** `@veriguard/detect`
satisfies the range in the server's manifest. A staged engine does not count:
the check asks the public registry, which sees approved versions only. So the
full order for a release touching both is

1. tag the engine → approve its stage → **wait for it to resolve**
2. tag the server

Step 1's wait is real. A newly published package can 404 from
`registry.npmjs.org` for several minutes after npmjs.com shows it live, and the
server's gate reads the registry, not the website. Confirm with `npm view
@veriguard/detect version` before tagging the server, rather than reading the
404 as a failed publish.

Publishing the server by hand to get around the gate ships a tarball that
cannot resolve its own scorer on install — permanently, under a version number
that cannot be reused.

### First publish of a new package

Trusted publishing is configured per package on npmjs.com, so a package that
has never been published may have nowhere to attach it — the first release can
need a package that only a first release creates. Check npmjs.com for a pending
publisher on the scope first; if there is none, publish the first version from
a maintainer's machine to create the package, after which CI owns every
version:

```bash
npm publish --workspace @veriguard/<name> --access public --provenance=false
```

`--provenance=false` is required: provenance needs an OIDC token that only CI
has, and the manifest sets `publishConfig.provenance`, so without the override
the command fails rather than publishing unattested. That bootstrap version
carries no provenance — prefer burning a throwaway `0.1.0` over a version
anyone should install.

Then register the trusted publisher on the package's settings page: this repo,
the workflow filename from the table above, environment blank, and **"Allow npm
publish" unchecked** so the staging gate cannot be bypassed.

### When it fails

| Symptom | Cause |
|---|---|
| `EUSAGE … provider: null` | `--provenance` run outside CI. Provenance needs the Actions OIDC token. |
| `E401` after "Signed provenance statement" | OIDC worked, the registry exchange did not — no trusted publisher matching this workflow filename. |
| Registry 404 right after a successful publish | Propagation. The website leads the registry by minutes. |
| `no published @veriguard/detect matching …` | The engine is unpublished, or staged and not yet approved. |
