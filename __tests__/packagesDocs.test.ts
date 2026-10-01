import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkUrl, checkSms, analyzeContent } from "@veriguard/detect";
import {
  INSTALL,
  QUICKSTART,
  ANALYZE,
  REGIONS,
  MCP_CLAUDE,
  MCP_CONFIG,
  MCP_OFFLINE,
  DOCUMENTED_TOOLS,
} from "@/components/PackagesDocs";
import { NPM_PACKAGE, MCP_PACKAGE } from "@/lib/npmPackage";
import { createServer, DEFAULT_OPTIONS } from "../packages/mcp/src/server";
import { parseArgs } from "../packages/mcp/src/cli";

// The published docs page shows code. Code on a documentation page is a claim
// about the API, and this is the suite that keeps it one a reader can rely on.
//
// Documentation drifts silently: the sample keeps rendering after the function
// it calls has changed shape, and the first person to notice is a developer
// whose install does not work. Two of these samples were wrong when first
// written — `checkUrl` was shown with `await` when it is synchronous, and
// `analyzeContent`'s result was destructured as `{ identifier }` when the field
// is `value` — and both type-checked as strings inside a template literal.
//
// So the assertions below run the same calls the samples show and compare the
// results against the numbers printed beside them.

describe("npm docs samples match the engine", () => {
  it("installs the package the rest of the site names", () => {
    // One source for the package name, so a rename cannot leave the install
    // line pointing at something that no longer exists.
    expect(INSTALL).toBe(`npm install ${NPM_PACKAGE}`);
    expect(QUICKSTART).toContain(`from "${NPM_PACKAGE}"`);
  });

  it("produces the verdict and score the quickstart prints", () => {
    const result = checkUrl("https://commbank-secure-login.tk/verify");

    expect(result.verdict).toBe("likely_scam");
    expect(result.score).toBe(85);
    expect(result.flags.length).toBeGreaterThan(0);

    // The sample states both values in comments. Asserting they appear keeps
    // the printed numbers and the real ones from parting company — the failure
    // this test exists for is a rule change that moves the score while the page
    // keeps claiming 85.
    expect(QUICKSTART).toContain(`"${result.verdict}"`);
    expect(QUICKSTART).toContain(String(result.score));
  });

  it("does not show `await` on a synchronous call", () => {
    // checkUrl does no I/O and returns a CheckResult, not a promise. Showing
    // `await` would be harmless at runtime and wrong in a way that teaches the
    // reader the wrong shape for every other entry point.
    expect(QUICKSTART).not.toMatch(/await\s+checkUrl/);
    expect(REGIONS).not.toMatch(/await\s+checkSms/);
  });

  it("destructures analyzeContent's results as the type defines them", async () => {
    const results = await analyzeContent(
      "Your parcel is held. Pay the fee at auspost-redelivery.bond",
    );

    expect(results.length).toBeGreaterThan(0);

    // Every field the sample destructures has to exist on the real result.
    // Reading them off the value rather than a hand-written list means a
    // renamed field fails here rather than in someone's editor.
    const [first] = results;
    for (const field of ["kind", "value", "result"] as const) {
      expect(first[field], `analyzeContent results have no "${field}"`).toBeDefined();
      expect(ANALYZE, `the sample does not destructure "${field}"`).toContain(field);
    }
  });

  it("passes region positionally, as checkSms actually takes it", () => {
    // The sample previously showed `{ region: "gb" }`, which type-checks as a
    // MessageCheckOptions object and silently scores against the default
    // region — a wrong answer rather than an error, which is the worst kind of
    // documentation bug.
    const gb = checkSms("Your parcel is held", undefined, "gb");
    expect(gb.verdict).toBeDefined();
    expect(REGIONS).toContain('checkSms("Your parcel is held", undefined, "gb")');
  });
});

// ── The MCP server's samples ─────────────────────────────────────────────────
//
// Same contract as the engine samples above: a config block on a docs page is
// a claim about what a client will accept, and a tool table is a claim about
// what the server registers. Both are asserted against the real thing, so a
// renamed tool or a changed flag fails here rather than in someone's config.

describe("MCP docs samples match the server", () => {
  it("names the package the rest of the site names", () => {
    expect(MCP_CLAUDE).toContain(MCP_PACKAGE);
    expect(MCP_CONFIG).toContain(MCP_PACKAGE);
    expect(MCP_OFFLINE).toContain(MCP_PACKAGE);
  });

  it("documents exactly the tools the server registers", () => {
    const server = createServer(DEFAULT_OPTIONS);
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    ).sort();

    // Read off the rendered table rather than a list retyped here: the failure
    // worth catching is a tool renamed in the server while the page keeps
    // advertising the old name.
    expect(DOCUMENTED_TOOLS.slice().sort()).toEqual(registered);
  });

  it("shows a config whose command the CLI actually accepts", () => {
    // The JSON is what a reader pastes into their client, so it has to parse,
    // and its args have to be ones the binary tolerates. A `-y` that npx
    // consumes is not passed through, so the server sees no arguments at all.
    const parsed = JSON.parse(MCP_CONFIG) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const entry = Object.values(parsed.mcpServers)[0];

    expect(entry.command).toBe("npx");
    expect(entry.args).toContain(MCP_PACKAGE);
    // Everything after the package name is the server's own; nothing here yet,
    // and parseArgs must accept that.
    const serverArgs = entry.args.slice(entry.args.indexOf(MCP_PACKAGE) + 1);
    expect(() => parseArgs(serverArgs)).not.toThrow();
  });

  it("shows offline flags the CLI really has", () => {
    // The page claims these two flags leave the server with no network access.
    // If either were renamed, the sample would teach a command that exits 2.
    const flags = MCP_OFFLINE.split(/\s+/).filter((a) => a.startsWith("--"));
    expect(flags).toEqual(["--no-blocklist", "--no-expand"]);

    const options = parseArgs(flags);
    expect(options).not.toBe("help");
    if (options === "help") return;
    expect(options.blocklist, "the sample does not actually disable the blocklist").toBe(false);
    expect(options.expandLinks, "the sample does not actually disable expansion").toBe(false);
  });

  it("gives the Claude Code command the package name as its server argument", () => {
    // `claude mcp add <name> -- <command>`: everything after `--` is what gets
    // run, so the package has to appear there rather than only in the label.
    const [, command] = MCP_CLAUDE.split(" -- ");
    expect(command, "nothing follows the -- separator").toBeTruthy();
    expect(command).toContain(MCP_PACKAGE);
  });
});

// ── Anchors ──────────────────────────────────────────────────────────────────
//
// Every heading is anchored so a section can be linked to and its link copied.
// That makes the ids part of the page's contract: they get pasted into support
// threads and issues, so a renamed id silently breaks a link somebody saved.
//
// Rendering the component here would need a DOM and a language provider, so
// these assertions read the source instead — enough to catch the two failures
// that matter, a TOC entry pointing at no heading and two headings sharing an
// id.

describe("the packages page's anchors", () => {
  const source = readFileSync(
    path.join(process.cwd(), "components/PackagesDocs.tsx"),
    "utf8",
  );

  /** Every id given to an AnchorHeading. */
  const headingIds = [...source.matchAll(/<AnchorHeading\s+id="([^"]+)"/g)].map((m) => m[1]);

  /** Every id the section index links to. */
  const tocIds = [...source.matchAll(/\{\s*id:\s*"([^"]+)",\s*key:/g)].map((m) => m[1]);

  it("anchors every section", () => {
    // Guards against the suite going vacuous if the component is restructured.
    expect(headingIds.length, "no AnchorHeading ids found").toBeGreaterThan(5);
  });

  it("gives every heading a unique id", () => {
    // Duplicate ids make the fragment ambiguous: the browser jumps to the
    // first, so one of the two sections becomes unlinkable.
    expect(new Set(headingIds).size, `duplicate ids: ${headingIds.join(", ")}`)
      .toBe(headingIds.length);
  });

  it("points every index entry at a heading that exists", () => {
    expect(tocIds.length, "no index entries found").toBeGreaterThan(5);
    for (const id of tocIds) {
      expect(headingIds, `the index links to #${id}, which no heading declares`).toContain(id);
    }
  });

  it("covers both packages in the index", () => {
    // The page's whole reason for existing is that both packages are on it, so
    // the index has to offer a way into each.
    expect(tocIds).toContain("library");
    expect(tocIds).toContain("mcp");
  });
});
