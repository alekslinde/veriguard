import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enMessages from "@/messages/en.json";

// Invocation cost on the free tier, not correctness.
//
// The homepage is force-dynamic (region comes from request headers), so it runs
// a serverless function per visit regardless. StatsBar used to fetch
// /api/stats on mount, making that TWO invocations per view. The counters are
// now resolved during the render that was already happening.
//
// These assert on source text rather than behaviour, which is a real
// limitation: the suite runs under environment "node" with no DOM, so a client
// component cannot be mounted. They are brittle to renaming and would pass on a
// semantically broken refactor that kept the strings. They are here because the
// regression is otherwise SILENT — nothing fails when the saving is lost — and
// a brittle guard beats none. Replace them with mounted tests if the suite ever
// gains a DOM environment.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("homepage resolves stats server-side", () => {
  it("fetches the counters in the page render", () => {
    const page = read("app/page.tsx");
    expect(page).toContain("getStats");
    // HomeHero is passed through CheckStage's `below` slot now — the counters
    // render under the check card rather than above it — so the assertion is on
    // the prop, not on where in the tree it appears.
    expect(page).toContain("stats={stats}");
  });

  it("tolerates the counters being unavailable", () => {
    // A stats widget must never be able to take the check flow down with it.
    const page = read("app/page.tsx");
    expect(page).toMatch(/try\s*{[\s\S]*getStats[\s\S]*}\s*catch/);
  });
});

describe("the prop is required, so the saving cannot be lost silently", () => {
  // The compiler is the real guard here — an optional prop would let a future
  // caller render <HomeHero /> or <StatsBar />, type-check cleanly, and fall
  // back to the client fetch with nothing failing. These assert the types stay
  // required; `npx tsc` is what actually enforces it.
  it.each([
    ["components/StatsBar.tsx", /initial: Stats \| null/],
    ["components/HomeHero.tsx", /stats: \{ checks: number; reports: number \} \| null/],
  ])("%s declares its stats prop as required", (file, pattern) => {
    expect(read(file)).toMatch(pattern);
  });

  it("has no default-parameter escape hatch", () => {
    // `= {}` on the props object made the required type unenforceable.
    for (const file of ["components/StatsBar.tsx", "components/HomeHero.tsx"]) {
      expect(read(file), file).not.toContain("} = {}) {");
    }
  });
});

describe("the failure path does not double the cost", () => {
  it("does not retry on the client when the server render failed", () => {
    // /api/stats calls the same getStats() against the same database, so a
    // render that failed server-side fails again — spending a SECOND
    // invocation during exactly the outage worth spending least in. The old
    // guard fell through on null and did precisely that.
    const bar = read("components/StatsBar.tsx");
    expect(bar).toMatch(/if \(!initial\) return;/);
    expect(bar).toMatch(/same getStats|same database|fail again/i);
  });
});

describe("the counter refreshes after a check", () => {
  it("listens for the check-complete event", () => {
    // StatsBar never unmounts during the check flow, so seeding from `initial`
    // and stopping there froze the number for the session — and the one person
    // guaranteed to notice is the user who just moved it.
    const bar = read("components/StatsBar.tsx");
    expect(bar).toContain("veriguard:check-complete");
    expect(bar).toContain("removeEventListener");
  });

  it("emits that event when a check succeeds", () => {
    const flow = read("components/CheckFlow.tsx");
    expect(flow).toContain('new Event("veriguard:check-complete")');
  });

  it("refreshes on an event rather than a timer", () => {
    // An interval would reintroduce per-visitor invocations on a schedule,
    // which is the cost this component exists to avoid.
    const bar = read("components/StatsBar.tsx");
    expect(bar).not.toMatch(/setInterval|setTimeout/);
  });
});

describe("the counters do not overstate what they measure", () => {
  // Both numbers come from /api/check and the inbound mail path only. The
  // WebExtension scores on-device and never calls the API, so its checks are
  // absent from these figures and always will be — the alternative would be the
  // extension phoning home about the thing it promises never to send.
  //
  // So each label has to say where it was measured. This is asserted rather
  // than left to the doc comment because it has already been lost once, to a
  // copy pass that trimmed both labels to their unqualified form.
  const messages = enMessages as Record<string, string>;

  for (const key of [
    "stats.checked.one",
    "stats.checked.many",
    "stats.reported.one",
    "stats.reported.many",
  ]) {
    it(`${key} says where the number was measured`, () => {
      expect(messages[key]).toMatch(/\b(here|this site)\b/);
    });
  }
});
