#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regenerates packages/detect/src/publicSuffixList.ts from publicsuffix.org.
//
//   npm run psl
//
// Run deliberately, not on install or build. The generated file is committed,
// so a build never touches the network and a PSL update is a reviewable diff
// rather than something that silently changes detection between two builds of
// the same commit. That is the same reasoning that keeps the URLhaus blocklist
// out of the engine.
//
// WHAT IS KEPT, AND WHY
//
// · ICANN section only. The PRIVATE section is company-submitted — github.io,
//   s3.amazonaws.com, and ~3,300 others. Those are correct for cookie scoping
//   and WRONG here: treating "github.io" as a public suffix makes
//   "evil.github.io" its own registrable domain, which would trip the
//   brand-owns-the-label exemption and suppress typosquat scoring on exactly
//   the free hosting scammers use. The engine already scores those hosts via
//   suspiciousHosting; they must not become suffixes.
//
// · Multi-label rules only. A single-label rule ("com", "uk") says the
//   registrable domain is <label>.<tld>, which is what the consumer already
//   assumes when no rule matches. Keeping ~1,500 of them would inflate the
//   bundle to restate the default.
//
// Size is the binding constraint: the engine bundles standalone for the
// browser at ~280KB, and that budget is what the WebExtension depends on. The
// kept subset is ~66KB raw / ~21KB gzipped.

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE = "https://publicsuffix.org/list/public_suffix_list.dat";
const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../packages/detect/src/publicSuffixList.ts",
);

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Failed to fetch PSL: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const text = await res.text();

// The ICANN section is delimited by comment markers in the file itself.
const begin = text.indexOf("===BEGIN ICANN DOMAINS===");
const end = text.indexOf("===END ICANN DOMAINS===");
if (begin === -1 || end === -1) {
  console.error("Could not find ICANN section markers — the PSL format changed.");
  process.exit(1);
}

const rules = text
  .slice(begin, end)
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("//"))
  // Multi-label only — see the header. Wildcard and exception rules are ALWAYS
  // kept, whatever their label count: "*.np" is a single-label rule in form but
  // multi-label in effect, because it makes "com.np" a public suffix. Stripping
  // the "*." before counting dropped 7 ccTLD wildcards (ck er fk jm mm np pg)
  // and reintroduced the exact bug this list was adopted to fix —
  // "paypal.com.np" resolved its registrable label to "com". It also orphaned
  // the "!www.ck" exception, whose wildcard parent had been removed.
  .filter((l) => l.startsWith("*") || l.startsWith("!") || l.includes("."));

if (rules.length < 4000) {
  console.error(`Only ${rules.length} rules parsed — refusing to write a truncated list.`);
  process.exit(1);
}

const normal = rules.filter((r) => !r.startsWith("*.") && !r.startsWith("!")).sort();
const wildcard = rules.filter((r) => r.startsWith("*.")).map((r) => r.slice(2)).sort();
const exception = rules.filter((r) => r.startsWith("!")).map((r) => r.slice(1)).sort();

const list = (xs) => xs.map((x) => JSON.stringify(x)).join(",\n  ");

// REUSE-IgnoreStart: the generated file's header, not this script's.
const out = `// SPDX-FileCopyrightText: Public Suffix List contributors
// SPDX-License-Identifier: MPL-2.0
//! Generated from the Public Suffix List (https://publicsuffix.org/), licensed
//! under the Mozilla Public License 2.0: https://mozilla.org/MPL/2.0/
//
// GENERATED FILE — DO NOT EDIT BY HAND.
//
// Regenerate with \`npm run psl\`. Source: ${SOURCE}
// Generated from the ICANN section only, multi-label rules only.
// Rules: ${normal.length} normal, ${wildcard.length} wildcard, ${exception.length} exception.
//
// Why this is committed rather than fetched at runtime: the engine has no
// ambient network access by design — that is the property the WebExtension and
// the privacy contract both depend on. Committing it also makes a PSL update a
// reviewable diff instead of something that changes detection silently between
// two builds of the same commit.

/** Ordinary rules: an exact multi-label public suffix. */
export const PSL_RULES: ReadonlySet<string> = new Set([
  ${list(normal)},
]);

/**
 * Wildcard rules, stored WITHOUT the leading "*." — a rule "*.ck" is held as
 * "ck" and means "any single label under ck is itself a public suffix".
 */
export const PSL_WILDCARDS: ReadonlySet<string> = new Set([
  ${list(wildcard)},
]);

/**
 * Exception rules, stored without the leading "!". An exception overrides a
 * wildcard: "!city.kawasaki.jp" means city.kawasaki.jp IS registrable even
 * though "*.kawasaki.jp" would otherwise make it a suffix.
 */
export const PSL_EXCEPTIONS: ReadonlySet<string> = new Set([
  ${list(exception)},
]);
`;
// REUSE-IgnoreEnd

writeFileSync(OUT, out);
console.log(
  `Wrote ${OUT}\n  ${normal.length} normal, ${wildcard.length} wildcard, ${exception.length} exception` +
    `\n  ${(out.length / 1024).toFixed(1)}KB raw`,
);
