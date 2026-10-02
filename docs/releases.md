# Releases

Every shippable part releases on its own, from a **release pull request** that
release-please keeps open and you merge when you choose.

```
feature PR → main → release PR (open, updating itself) → merge → tag + Release → shipped
```

Merging to `main` ships nothing. Merging a part's release PR is the deliberate
act: it bumps that part's version, writes its changelog, creates its prefixed
tag, publishes its GitHub Release, and then ships it.

There is one release PR per part, so releasing the engine does not release the
app. A part that no merged commit has touched has no release PR open at all.

See [`versioning.md`](versioning.md) for which commit type produces which bump,
and for the five version lines.

---

## What a release actually does

`release.yml` runs release-please on every push to `main`, then runs one job per
part, gated on whether that part was released in this run.

| Part released | What ships |
|---|---|
| App | `production` is fast-forwarded to the `app-v` tag; the host deploys that branch |
| Engine | `@veriguard/detect` is **staged** on npm, awaiting your 2FA approval |
| MCP server | `@veriguard/mcp` is staged on npm, after the engine |
| Extension | The Chrome and Firefox zips are built and attached to the Release; you upload them to the stores |
| Email worker | The Worker is deployed from its tag |

### Why those jobs live in the release workflow

A tag created with the workflow's default `GITHUB_TOKEN` **does not start other
workflows**. A publish workflow keyed on `engine-v*` would therefore sit silent
forever when release-please created that tag. So each shipping step is a job in
the release run, gated on release-please's `release_created` outputs.

The publish and deploy workflows are still callable on their own — by a tag
pushed by hand, or from the Actions tab — so nothing lost a manual path.

---

## The app

`production` is what users see, and only the release workflow moves it. When an
app release is cut, the workflow fast-forwards `production` to the new `app-v`
tag and the host deploys it exactly as before. No host configuration changed.

`production` therefore equals an app release by construction, which is the point:
there is no state the deployed branch can be in that no tag names.

The fast-forward is `--ff-only`. If someone has committed directly to
`production` — a hotfix that never reached `main` — the job **fails** rather than
discarding that commit. Merge `production` back into `main` and release again.

**Hotfix:** a `fix:` commit on `main`, then merge the app release PR. That is the
whole procedure; there is no branch off `production` any more, and the release is
immediate rather than waiting for a promotion window.

**Rollback:** re-point `production` at the previous `app-v` tag and force-push
only `production` (the one branch where this is acceptable, with maintainer
sign-off). Shipping a revert forward as a new release is usually better.

### Knowing when to release the app

`scripts/check-deploy-drift.ts` measures two things separately, because they go
wrong separately: **age** (how long since production moved — detection sitting on
`main` helps nobody) and **size** (how many commits are unreleased — a big
release is harder to review and roll back, which is what makes the next one feel
risky enough to defer again). Past 14 days or 40 commits it refreshes a
"🚢 Production is behind main" issue; releasing closes it.

Run it locally any time: `npm run check-deploy-drift`.

There is no fixed cadence. Merge the app's release PR when the drift issue lands,
or whenever the work on `main` warrants it.

### What rides a release

**Rides the next app release:**
- Detection changes (new patterns, region packs, new input types)
- User-visible fixes (`ui`, `api`, false-positive removals)
- Batched Radar / Calendar content — daily sweeps accumulate on `main` and ship
  together, never one deploy per sweep

**Produces no release at all:** docs-only, CI-only, tests, tooling. A `chore:`
or `test:` commit opens no release PR, so there is nothing to decide.

**Release the same day for:** broken production, a wrong verdict in the wild, or
a security / privacy fix.

---

## Publishing a package

`@veriguard/detect` and `@veriguard/mcp` publish when their release PRs merge.
`production` is not involved.

| Package | Tag | Reusable workflow |
|---|---|---|
| `@veriguard/detect` | `engine-vX.Y.Z` | `publish-engine.yml` |
| `@veriguard/mcp` | `mcp-vX.Y.Z` | `publish-mcp.yml` |

Each workflow still refuses to run if the tag disagrees with the version in
`package.json`. With release-please writing both, that check should never fire —
which is exactly why it stays: it is now an assertion about the tooling.

### Approving the release

The workflow **stages**; it does not publish. The tarball is held until a
maintainer approves it with 2FA:

```bash
npm stage list
npm stage approve <id>
```

That is the point of the arrangement. A version on npm cannot be replaced and
unpublishing is restricted after 72 hours, so no workflow run puts code in front
of users by itself. Merging the release PR reviews the change; approving the
stage reviews the artifact.

### Order: engine first, always

`publish-mcp.yml` refuses to run until a **published** `@veriguard/detect`
satisfies the range in the server's manifest. A staged engine does not count: the
check asks the public registry, which sees approved versions only.

**So when both parts release in one run, the MCP job fails by design.** Its
engine is staged and not yet approved. The recovery is:

1. Approve the engine's stage, then **wait for it to resolve** — confirm with
   `npm view @veriguard/detect version`.
2. Re-run the failed `publish-mcp` job from the Actions tab.

Step 1's wait is real. A newly published package can 404 from
`registry.npmjs.org` for several minutes after npmjs.com shows it live, and the
server's gate reads the registry, not the website.

Publishing the server by hand to get around the gate ships a tarball that cannot
resolve its own scorer on install — permanently, under a version number that
cannot be reused.

### First publish of a new package

Trusted publishing is configured per package on npmjs.com, so a package that has
never been published may have nowhere to attach it — the first release can need a
package that only a first release creates. Check npmjs.com for a pending
publisher on the scope first; if there is none, publish the first version from a
maintainer's machine to create the package, after which CI owns every version:

```bash
npm publish --workspace @veriguard/<name> --access public --provenance=false
```

`--provenance=false` is required: provenance needs an OIDC token that only CI
has, and the manifest sets `publishConfig.provenance`, so without the override the
command fails rather than publishing unattested. That bootstrap version carries no
provenance — prefer burning a throwaway `0.1.0` over a version anyone should
install.

Then register the trusted publisher on the package's settings page: this repo,
the workflow filename from the table above, environment blank, and **"Allow npm
publish" unchecked** so the staging gate cannot be bypassed.

---

## The extension

A release builds the Chrome and Firefox zips with `npm run ext:pack` and attaches
them to the GitHub Release. **Store upload stays manual** — you download them and
submit. Automating store submission is a separate decision.

The build happens before the test run on purpose: `extensionBundle.test.ts` greps
the built bundle to enforce the one-network-call property and skips when `dist/`
is absent, so building first is what makes that check mean anything.

Every store submission needs a number higher than the last one shipped, and a
shipped number can never be reused — which the version line now guarantees
without anyone remembering to bump.

---

## When it fails

| Symptom | Cause |
|---|---|
| No release PR opened after a merge | The commit type produces no release (`chore:`, `docs:`, `test:`), or the title did not parse |
| A part released but nothing shipped | An output key in `release.yml` does not match the part's path. A wrong key reads as empty, so the gate is false and the run still reports green |
| `publish-mcp` fails right after a joint release | Expected — the engine is staged, not published. Approve it, wait, re-run |
| `EUSAGE … provider: null` | `--provenance` run outside CI. Provenance needs the Actions OIDC token |
| `E401` after "Signed provenance statement" | OIDC worked, the registry exchange did not — no trusted publisher matching this workflow filename |
| Registry 404 right after a successful publish | Propagation. The website leads the registry by minutes |
| `no published @veriguard/detect matching …` | The engine is unpublished, or staged and not yet approved |
| The app deploy job fails on `--ff-only` | `production` holds a commit `main` does not. Merge it back to `main`, then release again |
