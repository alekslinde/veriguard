// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: Apache-2.0

// Rewrites package.json's `exports` from src/ to dist/, in place, at pack time.
//
// The workspace and the registry need different maps, and there is no
// declarative way to express that:
//
//   · In-repo, `exports` must point at `./src/*.ts`. The app, the extension and
//     vitest all resolve this package through the workspace symlink, so a map
//     pointing at dist/ means `npm test` and `npm run ext` fail on a fresh
//     clone until someone builds — and worse, succeed against a STALE dist/
//     when someone has, silently scoring with detection rules that do not match
//     the source being edited.
//
//   · On the registry, it must point at `./dist/*.js`, because `files` ships
//     dist/ and not src/.
//
// `publishConfig.exports` looks like the tool for this and is not: neither npm
// 10 nor npm 11 applies it to the tarball (verified by packing with both and
// reading package.json back out of each). A `development` condition looks like
// the other candidate and is worse — it resolves per-tool rather than per-
// audience, so `vite build` and `next build` take the `default` branch and
// break exactly like the dist/-only map above, while `vitest` takes
// `development` and hides it.
//
// So the swap happens here, in the one place that runs between "what the repo
// uses" and "what npm uploads". npm runs `prepack` before creating the tarball
// and `postpack` after, for both `npm pack` and `npm publish`.
//
// This edits the real file. `postpack` (restore-publish.mjs) puts it back, and
// the publish workflow verifies the tree is clean afterwards — a pack that dies
// between the two would otherwise leave a dist/-pointing package.json committed
// to somebody's branch.

import { readFileSync, writeFileSync } from "node:fs";

const PKG = new URL("../package.json", import.meta.url);
const BACKUP = new URL("../package.json.prepack-backup", import.meta.url);

const original = readFileSync(PKG, "utf8");
const pkg = JSON.parse(original);

// Keep the exact bytes, not a re-serialisation: postpack restores this verbatim
// so packing cannot reformat a tracked file as a side effect.
writeFileSync(BACKUP, original);

/** `./src/regions/*.ts` → `./dist/regions/*.js` */
const toDist = (target) => target.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ".js");

/** `./dist/regions/*.js` → `./dist/regions/*.d.ts` */
const toTypes = (target) => target.replace(/\.js$/, ".d.ts");

const published = {};
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target !== "string") {
    throw new Error(`exports["${subpath}"] is already a condition map; this script expects plain strings`);
  }
  if (!target.startsWith("./src/")) {
    throw new Error(`exports["${subpath}"] is "${target}", which does not point into src/`);
  }
  const js = toDist(target);
  // `types` must come first: the resolver takes the first matching condition,
  // so a `types` listed after `default` is unreachable and every consumer
  // silently gets `any` for the whole package.
  published[subpath] = { types: toTypes(js), default: js };
}

pkg.exports = published;

writeFileSync(PKG, JSON.stringify(pkg, null, 2) + "\n");

console.log(`[prepare-publish] exports rewritten to dist/ for ${Object.keys(published).length} subpaths`);
