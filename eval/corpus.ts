// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Corpus loading, with the privacy check enforced at the point of load.
//
// The corpus is real user submissions living in a git repository: checked in,
// cloned, permanent, greppable. That is a materially different exposure from a
// database row, so the check runs on every load rather than being trusted to
// have happened at authoring time.
//
// The check is NOT plain scrubPii equality, and the difference matters.
// scrubPii redacts every email address and phone number it sees, which is right
// for a reporter's free-text description but wrong for a corpus: the scammer's
// own "From: noreply@evil.tk" and callback number are the evidence, and
// emailHeaders.ts scores on exactly those. Deleting them would leave nothing to
// evaluate.
//
// So the invariant is narrower and the case must earn it:
//
//   1. stripReporterHeaders() must be a no-op — a case still carrying
//      Delivered-To / Received / X-Original-To has the *recipient's* mailbox and
//      relay path in it, which is never evidence and never belongs here.
//   2. Every remaining PII hit must be declared in the case's `identifiers`
//      list, which the author writes by hand. Declaring is cheap; forgetting is
//      caught. An undeclared address or number fails the run.
//
// The effect is that scam identifiers survive because someone consciously
// listed them, while a victim's phone number pasted in by accident does not.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findPii, stripReporterHeaders } from "@/lib/piiScrubber";
import { validateCase, type EvalCase } from "./schema";

/**
 * PII-shaped tokens in a case, normalised for comparison against the declared
 * `identifiers` list.
 *
 * Span-finding lives in piiScrubber alongside the patterns themselves (see
 * findPii). Recovering spans out here by diffing scrubbed output against the
 * original does not work: replacements change the string's length, so a span
 * can only be re-located by guessing at surrounding context, and two adjacent
 * redactions then merge into a single blob. That was not cosmetic — declaring
 * the merged blob in `identifiers` whitelisted every address inside it, so a
 * victim's address could be committed alongside a scammer's.
 */
function piiHits(text: string): string[] {
  // Surrounding punctuation is stripped so "<noreply@evil.tk>" and
  // "noreply@evil.tk" compare equal against the declared list.
  return findPii(text)
    .map((h) => h.replace(/^[<("'\s]+|[>)"',.;:\s]+$/g, ""))
    .filter(Boolean);
}

export interface LoadResult {
  cases: EvalCase[];
  errors: string[];
}

/**
 * Load every .jsonl file in a corpus directory.
 *
 * Blank lines and #-prefixed lines are skipped so a file can carry section
 * comments without a separate metadata channel.
 */
export function loadCorpus(dir: string): LoadResult {
  const errors: string[] = [];
  const cases: EvalCase[] = [];
  const seenIds = new Set<string>();

  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return { cases, errors: [`corpus directory not readable: ${dir}`] };
  }
  if (files.length === 0) errors.push(`no .jsonl files in ${dir}`);

  for (const file of files) {
    const lines = readFileSync(join(dir, file), "utf8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const where = `${file}:${i + 1}`;

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        errors.push(`${where}: invalid JSON`);
        return;
      }

      const problems = validateCase(parsed, seenIds);
      if (problems.length > 0) {
        problems.forEach((p) => errors.push(`${where}: ${p}`));
        return;
      }

      const c = parsed as EvalCase;

      // 1. No recipient-side headers.
      if (stripReporterHeaders(c.content) !== c.content) {
        errors.push(
          `${where}: content carries reporter/delivery headers (id "${c.id}") — ` +
            `run it through stripReporterHeaders before committing`,
        );
        return;
      }

      // 2. Every PII-shaped token must be a declared scam identifier.
      const declared = new Set(c.identifiers ?? []);
      const undeclared = piiHits(c.content).filter((h) => !declared.has(h));
      if (undeclared.length > 0) {
        errors.push(
          `${where}: undeclared PII-shaped content in case "${c.id}": ` +
            `${[...new Set(undeclared)].join(", ")} — if these are the scammer's own ` +
            `identifiers, list them in "identifiers"; if they belong to a real person, remove them`,
        );
        return;
      }

      seenIds.add(c.id);
      cases.push(c);
    });
  }

  return { cases, errors };
}
