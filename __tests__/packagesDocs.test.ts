import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { checkUrl, checkSms, analyzeContent } from "@veriguard/detect";
import {
  QUICKSTART,
  ANALYZE,
  REGIONS,
  mcpClaudeCommand,
  mcpConfig,
  mcpOfflineCommand,
  DOCUMENTED_TOOLS,
} from "@/components/PackagesDocs";
import { MANAGERS, installCommand, execCommand } from "@/components/InstallTabs";
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
    expect(installCommand("npm", NPM_PACKAGE)).toBe(`npm install ${NPM_PACKAGE}`);
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
  it("names the package in every runtime's command", () => {
    for (const manager of MANAGERS) {
      expect(mcpClaudeCommand(manager)).toContain(MCP_PACKAGE);
      expect(mcpConfig(manager)).toContain(MCP_PACKAGE);
      expect(mcpOfflineCommand(manager)).toContain(MCP_PACKAGE);
    }
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

  it("emits a parseable, spawnable config for every runtime", () => {
    // The JSON is what a reader pastes into their client, so it has to parse,
    // and `command`/`args` have to be split the way a process spawn expects
    // rather than left as a shell string.
    for (const manager of MANAGERS) {
      const parsed = JSON.parse(mcpConfig(manager)) as {
        mcpServers: Record<string, { command: string; args: string[] }>;
      };
      const entry = Object.values(parsed.mcpServers)[0];

      expect(entry.command, `${manager}: command contains a space`).not.toMatch(/\s/);
      expect(entry.args, `${manager}: package missing from args`).toContain(
        manager === "deno" ? `npm:${MCP_PACKAGE}` : MCP_PACKAGE,
      );
    }
  });

  it("passes the CLI only arguments it accepts", () => {
    // Everything after the package name is the server's own. A runner flag
    // leaking through (npx's -y, deno's --allow-*) would make the server exit 2
    // on an unknown option, and the client would report a server that will not
    // start.
    for (const manager of MANAGERS) {
      const spec = manager === "deno" ? `npm:${MCP_PACKAGE}` : MCP_PACKAGE;
      const { args } = Object.values(
        (JSON.parse(mcpConfig(manager)) as {
          mcpServers: Record<string, { command: string; args: string[] }>;
        }).mcpServers,
      )[0];

      const serverArgs = args.slice(args.indexOf(spec) + 1);
      expect(() => parseArgs(serverArgs), `${manager}: ${serverArgs.join(" ")}`).not.toThrow();
    }
  });

  it("shows offline flags the CLI really has, in every runtime", () => {
    // The page claims these two flags leave the server with no network access.
    // If either were renamed, the sample would teach a command that exits 2.
    for (const manager of MANAGERS) {
      const flags = mcpOfflineCommand(manager)
        .split(/\s+/)
        .filter((a) => a === "--no-blocklist" || a === "--no-expand");
      expect(flags, `${manager} is missing a flag`).toEqual(["--no-blocklist", "--no-expand"]);

      const options = parseArgs(flags);
      expect(options).not.toBe("help");
      if (options === "help") return;
      expect(options.blocklist, `${manager}: blocklist not disabled`).toBe(false);
      expect(options.expandLinks, `${manager}: expansion not disabled`).toBe(false);
    }
  });

  it("gives the Claude Code command a runner after the -- separator", () => {
    // `claude mcp add <name> -- <command>`: everything after `--` is what gets
    // run, so the package has to appear there rather than only in the label.
    for (const manager of MANAGERS) {
      const [, command] = mcpClaudeCommand(manager).split(" -- ");
      expect(command, `${manager}: nothing follows --`).toBeTruthy();
      expect(command).toContain(MCP_PACKAGE);
    }
  });

  it("uses each runtime's own runner rather than npx everywhere", () => {
    // The point of the tabs: a bun user told to type npx is being handed
    // somebody else's docs.
    expect(mcpConfig("npm")).toContain('"command": "npx"');
    expect(mcpConfig("pnpm")).toContain('"command": "pnpm"');
    expect(mcpConfig("bun")).toContain('"command": "bunx"');
    expect(mcpConfig("deno")).toContain('"command": "deno"');
  });
});

describe("install commands", () => {
  it("offers the four runtimes the page claims to support", () => {
    expect(MANAGERS).toEqual(["npm", "pnpm", "bun", "deno"]);
  });

  it("names the package in every install command", () => {
    for (const manager of MANAGERS) {
      const command = installCommand(manager, NPM_PACKAGE);
      expect(command, `${manager} omits the package`).toContain(NPM_PACKAGE);
      // The runner has to lead, or the line is not a command.
      expect(command.startsWith(manager), `${manager}: "${command}"`).toBe(true);
    }
  });

  it("gives Deno the npm: specifier it needs", () => {
    // Without it, `deno add @veriguard/detect` looks for a JSR package that
    // does not exist — the one runtime where copying the npm spelling fails
    // rather than just looking foreign.
    expect(installCommand("deno", NPM_PACKAGE)).toContain(`npm:${NPM_PACKAGE}`);
    expect(execCommand("deno", MCP_PACKAGE)).toContain(`npm:${MCP_PACKAGE}`);
  });

  it("does not put an npm: specifier in a non-Deno command", () => {
    for (const manager of MANAGERS.filter((m) => m !== "deno")) {
      expect(installCommand(manager, NPM_PACKAGE)).not.toContain("npm:");
      expect(execCommand(manager, MCP_PACKAGE)).not.toContain("npm:");
    }
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
