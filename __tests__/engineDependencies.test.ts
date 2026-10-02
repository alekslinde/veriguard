// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// Guards the import structure that makes the detection engine extractable into
// its own package (roadmap Phase 0). Both invariants held by construction once
// and regressed silently, so they are asserted rather than assumed.

// The engine now lives in its own workspace package. These invariants are what
// made that extraction possible, so they follow it rather than being relaxed.
const ENGINE = path.join(process.cwd(), "packages/detect/src");

function importsOf(file: string): string[] {
  const src = readFileSync(path.join(ENGINE, file), "utf8");
  return [...src.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("engine import structure", () => {
  it("keeps detectType off scamDetector, so the two do not form a cycle", () => {
    // detectType classifies input for the scorer; the scorer calls detectType.
    // If detectType imports the scorer back, the cycle returns.
    expect(importsOf("detectType.ts").some((i) => i.includes("scamDetector"))).toBe(false);
  });

  it("keeps the shared types module free of engine imports", () => {
    // engineTypes.ts is the cycle-breaker. It may reference sibling types, but
    // importing the scorer would defeat the point.
    expect(importsOf("engineTypes.ts").some((i) => i.includes("scamDetector"))).toBe(false);
  });

  it("keeps Next.js out of the engine's module closure", () => {
    // The engine must stay portable — a Next import anywhere in this closure is
    // what would block bundling it into an extension or a worker. Now enforced
    // for the whole package rather than a hand-listed closure: anything added
    // to packages/detect/src is covered automatically.
    const closure = readdirSync(ENGINE, { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts"));
    expect(closure.length).toBeGreaterThan(10); // guard against a silent empty glob
    for (const file of closure) {
      const offenders = importsOf(file).filter((i) => i === "next" || i.startsWith("next/"));
      expect(offenders, `${file} imports Next.js`).toEqual([]);
    }
  });
});
