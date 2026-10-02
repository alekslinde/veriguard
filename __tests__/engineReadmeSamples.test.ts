// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// The engine README's code samples, checked against the engine.
//
// Code in a README is a claim about the API, and this one had no test while the
// website's equivalent samples did — __tests__/npmDocs.test.ts runs those,
// which is why the same mistake was caught there and sat here instead:
// `await checkUrl(...)` on a synchronous function, plus prose claiming every
// check hides sync work "behind an async signature", which describes
// analyzeContent and none of the five check* functions.
//
// That asymmetry is the gap worth closing, not the one error. This README is
// the first thing an npm installer reads, and a sample that teaches the wrong
// shape costs every reader a debugging session.
//
// Parsed out of the file rather than duplicated here: a copy would drift from
// the README exactly as the README drifted from the engine.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  checkUrl,
  checkSms,
  checkEmail,
  checkPhone,
  checkCustom,
  analyzeContent,
} from "@veriguard/detect";

const README = readFileSync(
  path.join(process.cwd(), "packages/detect/README.md"),
  "utf8",
);

/** Every fenced ```ts block in the README, which is where the claims live. */
function tsBlocks(): string[] {
  return [...README.matchAll(/```ts\n([\s\S]*?)```/g)].map((m) => m[1]);
}

const TS = tsBlocks().join("\n");

/**
 * The entry points that are synchronous, paired with a call that proves it.
 *
 * The assertion is made against the function, not a list of names: each is
 * invoked and its return value checked for not being a promise, so a future
 * change making one async fails here and prompts the README to change with it.
 */
const SYNC_ENTRIES = [
  { name: "checkUrl", call: () => checkUrl("https://commbank-secure-login.tk/verify") },
  { name: "checkSms", call: () => checkSms("Your parcel is held") },
  { name: "checkEmail", call: () => checkEmail("service@mygov-verify.monster") },
  { name: "checkPhone", call: () => checkPhone("+252612345678") },
  { name: "checkCustom", call: () => checkCustom("Your parcel is held") },
] as const;

describe("engine README — the samples it shows", () => {
  it("has code samples to check", () => {
    // Guards against this suite going vacuous if the fences are renamed or the
    // samples move: every assertion below reads from TS.
    expect(tsBlocks().length, "no ```ts blocks found in the README").toBeGreaterThan(0);
    expect(TS).toContain("@veriguard/detect");
  });

  it.each(SYNC_ENTRIES)("$name is synchronous, so the README must not await it", ({ name, call }) => {
    // First establish the fact, from the engine rather than from memory.
    const result = call();
    expect(result, `${name} returned a promise — the README may need updating`)
      .not.toBeInstanceOf(Promise);
    expect(result.verdict, `${name} returned no verdict`).toBeDefined();

    // Then hold the README to it.
    expect(TS, `the README awaits ${name}, which is synchronous`)
      .not.toMatch(new RegExp(`await\\s+${name}\\b`));
  });

  it("awaits analyzeContent, which is the one async entry point", async () => {
    const pending = analyzeContent("Your parcel is held: pay at auspost-redelivery.bond");
    expect(pending, "analyzeContent is no longer async — the README must change")
      .toBeInstanceOf(Promise);
    await pending;

    // Shown with await, because dropping it here gives the reader a promise
    // they will treat as an array.
    expect(TS).toMatch(/await\s+analyzeContent\b/);
  });

  it("does not claim the check* functions hide async work", () => {
    // The previous wording ("every check is synchronous work behind an async
    // signature") was true of analyzeContent alone. Generalised to "every
    // check", it told readers to await five functions that return a value.
    expect(README).not.toMatch(/[Ee]very check is synchronous work behind an async signature/);
  });

  it("produces the verdict and score the sample prints beside it", () => {
    // The sample states both in a comment. A rule change that moves the score
    // while the README keeps claiming 85 is the drift this catches — the same
    // failure npmDocs.test.ts guards on the website.
    const result = checkUrl("https://commbank-secure-login.tk/verify");
    expect(result.verdict).toBe("likely_scam");
    expect(TS).toContain(`"${result.verdict}"`);
    expect(TS).toContain(String(result.score));
  });

  it("lists every source module in its layout block", () => {
    // The layout block had drifted by six modules — hostHash, index,
    // keyboardAdjacency, publicSuffix, publicSuffixList and verdictRank were
    // all absent. Nothing failed, because a layout diagram is prose until
    // something reads it.
    //
    // Only the top level: regions/ is listed as a directory on purpose, since
    // enumerating thirty region packs would be noise that goes stale weekly.
    const layout = /```\n(src\/[\s\S]*?)```/.exec(README)?.[1];
    expect(layout, "no src/ layout block found in the README").toBeTruthy();

    const actual = readdirSync(path.join(process.cwd(), "packages/detect/src"))
      .filter((f) => f.endsWith(".ts"));

    expect(actual.length, "no engine source modules found").toBeGreaterThan(5);
    for (const file of actual) {
      expect(layout, `the layout block does not mention ${file}`).toContain(file);
    }
  });

  it("imports only symbols the package actually exports", async () => {
    // A sample importing a renamed or removed export fails for the reader on
    // their first copy-paste, and nothing else in the suite would see it.
    const barrel = await import("@veriguard/detect");
    const imported = [...TS.matchAll(/import\s*\{([^}]+)\}\s*from\s*"@veriguard\/detect"/g)]
      .flatMap((m) => m[1].split(",").map((s) => s.trim()).filter(Boolean));

    expect(imported.length, "no imports parsed out of the samples").toBeGreaterThan(0);
    for (const symbol of imported) {
      expect(barrel, `the README imports "${symbol}", which the barrel does not export`)
        .toHaveProperty(symbol);
    }
  });
});
