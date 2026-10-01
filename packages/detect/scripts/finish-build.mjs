// The last build step: make the emitted output resolvable.
//
// Runs after both tsup (`.js`) and tsc (`.d.ts`), because the rewrite has to
// see both. See rewrite-specifiers.mjs for what it changes and why neither
// output can keep the source's extensionless spelling.

import { rewriteRelativeSpecifiers } from "./rewrite-specifiers.mjs";

const dist = new URL("../dist/", import.meta.url);
const changed = await rewriteRelativeSpecifiers(dist);

console.log(`[finish-build] rewrote relative specifiers in ${changed} file(s)`);
