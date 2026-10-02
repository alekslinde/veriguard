// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: Apache-2.0

// Adds `.js` to the relative import specifiers in the built output.
//
// The source writes them extensionless, which is correct in-repo: the workspace
// resolves this package's TypeScript directly under "bundler" resolution.
// Neither emitted form can keep that spelling:
//
//   · `.js` — Node's ESM resolver does not guess extensions, so the package
//     throws ERR_MODULE_NOT_FOUND on its first import.
//   · `.d.ts` — a consumer on `moduleResolution: "nodenext"` gets TS2835 on
//     every relative specifier, nine from the barrel alone, before any of their
//     own code is checked.
//
// Declarations point at `.js` too, not `.d.ts`: TypeScript resolves the runtime
// specifier and finds the declaration beside it. `./regions` is a directory, so
// it becomes `./regions/index.js` in both.
//
// Run over both outputs rather than from tsup's `onSuccess`, which only ever
// saw the `.js` files — `build:types` runs afterwards, so declarations were
// emitted after the rewrite had already finished.

import { readdir, readFile, writeFile } from "node:fs/promises";
import { sep } from "node:path";

/**
 * A relative specifier in a static import/export or a dynamic import, without a
 * recognised extension. The quote is captured and replayed so the rewrite
 * cannot change how the string is delimited.
 */
const SPECIFIER =
  /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*?)(?<!\.[cm]?js|\.json|\.[cm]?ts)\2/g;

/**
 * @param {URL} dist the build output directory
 * @returns {Promise<number>} how many files were changed
 */
export async function rewriteRelativeSpecifiers(dist) {
  const all = (await readdir(dist, { recursive: true, encoding: "utf8" })).map((f) =>
    f.split(sep).join("/"),
  );

  // What actually exists on disk, used to tell a module import from a directory
  // one. `./regions` and `./detectType` are indistinguishable as text, resolve
  // differently, and appending `.js` to the first produces a path as broken as
  // the one it replaced — just later, and only for the import naming a folder.
  const modules = new Set(all.filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)));

  const targets = all.filter((f) => f.endsWith(".js") || f.endsWith(".d.ts"));
  let changed = 0;

  for (const file of targets) {
    const path = new URL(file, dist);
    const before = await readFile(path, "utf8");
    const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";

    const after = before.replace(SPECIFIER, (_match, keyword, quote, spec) => {
      const resolved = new URL(spec, new URL(dir, dist)).href.slice(dist.href.length);
      const suffix = modules.has(resolved) ? ".js" : "/index.js";
      return `${keyword}${quote}${spec}${suffix}${quote}`;
    });

    if (after !== before) {
      await writeFile(path, after);
      changed++;
    }
  }

  return changed;
}
