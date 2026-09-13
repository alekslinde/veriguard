import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// `reports.contact` is the reporter's OWN contact info, submitted so we can
// follow up with them — unlike `content`/`description`, it is never scrubbed,
// because scrubbing would redact the very email/phone the reporter gave us on
// purpose. That's only safe because no public-facing read includes it: today,
// PublicReport and getPublicReports'/getPublicReportsCount's SELECT column
// lists simply omit `contact`.
//
// That safety is by omission, not by a check, which makes it fragile — a
// column list is an easy thing to widen without anyone thinking about privacy
// in the moment. This test makes the omission structural: it fails the day
// `contact` is added to the public read path, rather than staying silent
// until someone notices the reporter's own PII is on the public feed.
//
// Source-grep on purpose, matching the style of docsArePublic.test.ts — this
// is a property of the SQL and the exported type, not of runtime behaviour a
// mocked DB could exercise.

const ROOT = resolve(__dirname, "..");
const REPORT_STORE = readFileSync(resolve(ROOT, "lib/reportStore.ts"), "utf8");

describe("reports.contact never reaches a public read", () => {
  it("PublicReport does not declare a contact field", () => {
    const match = REPORT_STORE.match(/export interface PublicReport \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\bcontact\b/);
  });

  it("getPublicReports' SELECT does not list the contact column", () => {
    // Bounded by the next export rather than the first "\n}", since the
    // function's own opts type closes with "}" long before the function body
    // does.
    const match = REPORT_STORE.match(
      /export async function getPublicReports\([\s\S]*?\n(?=export )/
    );
    expect(match).not.toBeNull();
    const sqlBlock = match![0].match(/SELECT[\s\S]*?FROM reports/);
    expect(sqlBlock).not.toBeNull();
    expect(sqlBlock![0]).not.toMatch(/\bcontact\b/);
  });
});
