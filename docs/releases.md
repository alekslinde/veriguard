# Releases

Releases are cut by hand, once the work is done, with one command:

```bash
npm run release
```

Merging to `main` ships nothing. Nothing is tagged, versioned or published until
you run that command and confirm each step. A part with no unreleased commits is
skipped.

See [`versioning.md`](versioning.md) for which commit type produces which bump,
and for the five version lines.

---

## What the command does

It works through the five parts in turn. For each part with unreleased commits it
shows the commits since that part's last tag, the bump their titles call for, and
the changelog it would write. You then:

1. **Choose a version for each part.** Enter takes the suggestion; type another
   `x.y.z` to override, or `s` to skip the part.
2. **Review the plan** and optionally edit each part's notes in `$EDITOR`.
3. **Confirm once** to commit, tag and push.

After that it creates the GitHub Releases, then asks before each shipping step
(below). Every step is a separate yes, because each is the point of no return for
its part.

`npm run release -- --dry-run` prints the same plan with suggested versions and
changes nothing.

It refuses to run unless you are on `main`, the tree is clean, and `main` matches
`origin/main`.

### What each part ships

| Part | Tag | Shipping step |
|---|---|---|
| App | `app-vX.Y.Z` | `production` is fast-forwarded to the tag; the host deploys that branch |
| Engine | `engine-vX.Y.Z` | `publish-engine.yml` is dispatched and **stages** `@veriguard/detect` on npm |
| MCP server | `mcp-vX.Y.Z` | `publish-mcp.yml` is dispatched and **stages** `@veriguard/mcp` on npm |
| Extension | `extension-vX.Y.Z` | The Chrome and Firefox zips are built, tested and attached to the Release |
| Email worker | `worker-vX.Y.Z` | `deploy-inbound-worker.yml` is dispatched and deploys the Worker |

Each part is its own commit and tag, so `git log` shows which change carried which
version.

---

## The app

`production` is what users see, and only `npm run release` moves it. The push is a
plain push of the commit the tag names, not a force-push: git refuses it if
`production` holds a commit that commit does not contain. That refusal is
deliberate. If someone committed directly to `production`, merge it back to `main`
and release again.

The commit, not the tag ref: these are annotated tags, so `refs/tags/app-vX.Y.Z`
names a tag object rather than a commit, and a branch cannot be built from one.
Pushing the tag ref is refused with `fatal error in commit_refs`, which reads as
an outage rather than as the wrong kind of ref.

`production` also requires a passing `Lint & test` on the commit being pushed, and
that run only starts when the commit reaches `main` — so immediately after a
release it is usually still in flight. The release command reports the check's
state and offers to wait. Each release commit is pushed separately so it becomes a
push head and gets its own CI; a batch push would leave every commit but the last
with no checks at all, and the rule could never be satisfied for them.

**Hotfix:** a `fix:` commit on `main`, then `npm run release`, and promote the app.

**Rollback:** re-point `production` at the previous `app-vX.Y.Z` tag and force-push
only `production`, with maintainer sign-off. Shipping a revert forward as a new
release is usually better.

### Knowing when to release the app

`scripts/check-deploy-drift.ts` measures two things separately: **age** (how long
since production moved) and **size** (how many commits are unreleased). Past 14
days or 40 commits it refreshes a "🚢 Production is behind main" issue; releasing
closes it. Run it locally with `npm run check-deploy-drift`.

There is no fixed cadence.

### What rides a release

**Rides the next app release:** detection changes, user-visible fixes, and batched
Radar and Calendar content.

**Produces no release on its own:** docs, CI, tests and tooling. A `chore:`,
`test:` or `refactor:` commit adds nothing to the version.

**Release the same day for:** broken production, a wrong verdict in the wild, or a
security or privacy fix.

---

## Packages

`@veriguard/detect` and `@veriguard/mcp` are published from their tags, never by
hand. Each publish workflow refuses to run if its tag disagrees with the version in
`package.json`.

### Approving the release

The workflow **stages**; it does not publish. A maintainer approves with 2FA:

```bash
npm stage list
npm stage approve <id>
```

A version on npm cannot be replaced, and unpublishing is restricted after 72 hours.
Approving the stage is the review of the artifact, the way the command's confirmation
is the review of the change.

### Engine first, always

`@veriguard/mcp` depends on `@veriguard/detect` by range, and its publish workflow
checks that a **published** engine satisfies that range. A staged engine does not
count. So when both release together:

1. Approve the engine's stage and wait for `npm view @veriguard/detect version` to
   show it.
2. Re-run the MCP publish from the Actions tab, or dispatch it again.

If an engine release moves outside the MCP server's range, the script moves the range
in the same commit and says so.

Publishing the server by hand to get around the check ships a tarball that cannot
resolve its own scorer on install, under a version number that cannot be reused.

### First publish of a new package

Trusted publishing is configured per package on npmjs.com, so a package that has
never been published may have nowhere to attach it. Publish the first version from a
maintainer's machine, then register the trusted publisher:

```bash
npm publish --workspace @veriguard/<name> --access public --provenance=false
```

`--provenance=false` is required locally, because provenance needs the Actions OIDC
token. Prefer burning a throwaway `0.1.0` over a version anyone should install. Then
register the publisher with this repo, the workflow filename, environment blank, and
**"Allow npm publish" unchecked** so the staging gate cannot be bypassed.

---

## The extension

The command builds the zips with `npm run ext:pack`, runs the suite against the built
bundle with `VERIGUARD_REQUIRE_BUILT=extensionBundle`, and attaches the zips to the
Release. The bundle check is what enforces the one-network-call property, and it
skips unless the bundle is built, so building first is what makes it mean anything.

**Store upload stays manual.** Every submission needs a number higher than the last
one shipped; the version line guarantees that.

---

## When it fails

| Symptom | Cause |
|---|---|
| `main is not level with origin/main` | Pull or push first. The script will not release from a tree that differs from what is pushed |
| A part shows no commits you expected | Its paths did not change, or the commit is in another part's territory. The app excludes the four other parts |
| A commit is missing from the notes | Its title is not a Conventional Commit. The script lists it as unreadable and it adds no bump |
| `publish-mcp` fails right after an engine release | Expected: the engine is staged, not published. Approve it, wait, re-run |
| `EUSAGE … provider: null` | Provenance run outside CI. Use the dispatched workflow, not a local publish |
| `E401` after "Signed provenance statement" | OIDC worked, the registry exchange did not. No trusted publisher matches this workflow filename |
| Registry 404 right after a successful publish | Propagation. The website leads the registry by minutes |
| The app deploy fails on the fast-forward | `production` holds a commit `main` does not. Merge it back to `main`, then release again |
| `Required status check "Lint & test" is expected` | CI has not finished on the release commit yet. Wait for it, then `git push origin <app tag>^{commit}:refs/heads/production` |
| `remote: fatal error in commit_refs` | A branch was pushed from an annotated tag ref. Push the commit instead: `<tag>^{commit}:refs/heads/production` |
