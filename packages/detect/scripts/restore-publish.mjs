// Puts package.json back after packing. See prepare-publish.mjs for why the
// file is edited in the first place.
//
// npm runs `postpack` after the tarball is written, for both `npm pack` and
// `npm publish`, and runs it even when the pack fails. It does NOT run if the
// process is killed outright, which is why the publish workflow checks the
// tree is clean rather than trusting this to have happened.

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";

const PKG = new URL("../package.json", import.meta.url);
const BACKUP = new URL("../package.json.prepack-backup", import.meta.url);

if (!existsSync(BACKUP)) {
  // Nothing to restore. Not an error: `postpack` also runs when `prepack`
  // itself failed before writing the backup, and failing here would replace
  // that real error with a confusing one.
  console.log("[restore-publish] no backup present, nothing to restore");
  process.exit(0);
}

// Restored byte-for-byte rather than re-serialised, so packing never shows up
// as a formatting change to a tracked file.
writeFileSync(PKG, readFileSync(BACKUP, "utf8"));
unlinkSync(BACKUP);

console.log("[restore-publish] package.json restored to its source-resolving form");
