// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

"use client";

// Developer documentation for both published packages.
//
// One page, not one per package, because the choice between them is the first
// thing a developer makes and a page each would hide it: @veriguard/detect if
// you are scoring messages in your own code, @veriguard/mcp if you want your
// assistant to do the checking. Seeing both side by side answers that in a
// glance, and the two share a scope, an engine and every privacy property, so
// splitting them would duplicate all three.
//
// A quickstart, not a reference. Install, one working call, what comes back,
// and the things a consumer must not get wrong — the coverage caveat and the
// network properties. Everything exhaustive (every entry point, every subpath,
// every tool argument, the type definitions) lives in the package READMEs,
// linked at the bottom, so there is one canonical list rather than two that
// drift.
//
// Every heading is anchored and its link is copyable, because documentation is
// read in pieces and quoted in support threads: "see the coverage caveat"
// should be a link, not an instruction to scroll.
//
// The samples below are real. __tests__/npmDocs.test.ts runs the library
// quickstart against the engine and fails if the verdict it claims stops being
// true; the MCP samples are checked against the server's own tool registry and
// CLI, so a renamed tool or flag fails there rather than in someone's config.

import { useLang } from "@/lib/lang";
import PageHeader from "@/components/PageHeader";
import CodeBlock from "@/components/CodeBlock";
import AnchorHeading from "@/components/AnchorHeading";
import ExternalLink from "@/components/ExternalLink";
import InstallTabs, {
  ManagerTabs,
  useManager,
  execCommand,
  type Manager,
} from "@/components/InstallTabs";
import {
  NPM_PACKAGE,
  NPM_URL,
  ENGINE_README_URL,
  ENGINE_SOURCE_URL,
  MCP_PACKAGE,
  MCP_URL,
  MCP_README_URL,
  MCP_SOURCE_URL,
} from "@/lib/npmPackage";

// ── The library ──────────────────────────────────────────────────────────────

export const QUICKSTART = `import { checkUrl } from "${NPM_PACKAGE}";

// Synchronous: no I/O, so there is nothing to await.
const result = checkUrl("https://commbank-secure-login.tk/verify");

result.verdict; // "likely_scam"
result.score;   // 85
result.flags;   // why, in sentences you can show someone`;

export const ANALYZE = `import { analyzeContent } from "${NPM_PACKAGE}";

// One result per link, number or address found in the text.
const results = await analyzeContent(
  "Your parcel is held. Pay the fee at auspost-redelivery.bond",
);

for (const { kind, value, result } of results) {
  console.log(kind, value, result.verdict, result.score);
}`;

export const REGIONS = `import { checkSms } from "${NPM_PACKAGE}";

// Region is the third argument. The second is an optional blocklist —
// pass undefined to score without one.
checkSms("Your parcel is held", undefined, "gb");`;

// ── The MCP server ───────────────────────────────────────────────────────────

/**
 * The one-liner for Claude Code, which takes a command rather than a config
 * file. Kept separate from the JSON below because it is the shortest path for
 * the client most likely to be reading this.
 *
 * Built from execCommand so the runner matches whichever tab the reader picked:
 * telling a bun user to type `npx` is the small wrongness that makes docs feel
 * like they were written for somebody else.
 */
export const mcpClaudeCommand = (manager: Manager) =>
  `claude mcp add veriguard -- ${execCommand(manager, MCP_PACKAGE)}`;

/**
 * The config shape nearly every other MCP client accepts.
 *
 * The client spawns this itself, so `command` and `args` have to be split the
 * way a process spawn expects — not a shell string. Derived from the same
 * execCommand as above and then split on whitespace, so the two samples cannot
 * drift apart and neither can drift from the CLI.
 */
export function mcpConfig(manager: Manager): string {
  const [command, ...args] = execCommand(manager, MCP_PACKAGE).split(" ");
  return `{
  "mcpServers": {
    "veriguard": {
      "command": "${command}",
      "args": ${JSON.stringify(args)}
    }
  }
}`;
}

/**
 * The flags, shown as the form that makes the strongest claim.
 *
 * Both together leave the server with no network access at all, which is the
 * property worth putting in front of someone who cares — so the sample is the
 * offline invocation rather than a list of options.
 */
export const mcpOfflineCommand = (manager: Manager) =>
  `${execCommand(manager, MCP_PACKAGE)} --no-blocklist --no-expand`;

/** The four tools, with the name exactly as a client sees it. */
const TOOLS: { name: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
  { name: "check_message", key: "packages.mcp.tools.message" },
  { name: "check_url", key: "packages.mcp.tools.url" },
  { name: "check_phone", key: "packages.mcp.tools.phone" },
  { name: "check_email", key: "packages.mcp.tools.email" },
];

/**
 * The tool names this page advertises, for the test that compares them against
 * the server's own registry. Derived from the table above rather than retyped,
 * so the thing asserted is the thing rendered.
 */
export const DOCUMENTED_TOOLS = TOOLS.map((tool) => tool.name);

const FIELDS: { name: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
  { name: "verdict", key: "npm.result.verdict" },
  { name: "score", key: "npm.result.score" },
  { name: "flags", key: "npm.result.flags" },
  { name: "signals", key: "npm.result.signals" },
  { name: "coverage", key: "npm.result.coverage" },
];

const H2 = "text-[17px] font-semibold text-[var(--foreground)]";
const H3 = "text-[14.5px] font-semibold text-[var(--foreground)]";
const BODY = "mt-2 text-[14px] text-[var(--text-dim)] leading-relaxed max-w-[68ch]";
const SECTION = "mt-8";

/**
 * The two package banners, which is what makes the page scannable.
 *
 * The package name is monospace and copyable: someone who already knows which
 * one they want comes here for the install line, and making them select it by
 * hand would be the one thing this page should never do.
 */
function PackageBanner({ name, url, children }: { name: string; url: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 max-w-[68ch] rounded-2xl border border-[var(--rule)] bg-[var(--ink-2)]/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <code className="font-[family-name:var(--font-mono-ui)] text-[14px] font-semibold text-[var(--clear)]">
          {name}
        </code>
        <ExternalLink
          href={url}
          variant="bare"
          className="text-[12.5px] font-semibold text-[var(--text-dim)] hover:text-[var(--clear)] transition-colors"
        >
          npm
        </ExternalLink>
      </div>
      <p className="mt-2 text-[13.5px] text-[var(--text-dim)] leading-relaxed">{children}</p>
    </div>
  );
}

/**
 * The section index.
 *
 * Earns its place on a page this long: the two packages are separate decisions
 * and a reader arriving for the MCP server should not scroll past the whole
 * library section to find it. Plain fragment links, so it works with no JS.
 */
const TOC: { id: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
  { id: "library", key: "packages.detect.heading" },
  { id: "install", key: "npm.install.heading" },
  { id: "quickstart", key: "npm.quickstart.heading" },
  { id: "analyze", key: "npm.analyze.heading" },
  { id: "result", key: "npm.result.heading" },
  { id: "coverage", key: "npm.coverage.heading" },
  { id: "regions", key: "npm.regions.heading" },
  { id: "mcp", key: "packages.mcp.heading" },
  { id: "mcp-install", key: "packages.mcp.install.heading" },
  { id: "mcp-tools", key: "packages.mcp.tools.heading" },
  { id: "mcp-network", key: "packages.mcp.network.heading" },
];

export default function PackagesDocs() {
  const { t } = useLang();
  // Shared with the install tabs above, so a choice made in either place holds
  // for every sample on the page.
  const [manager, setManager] = useManager();

  return (
    <>
      <PageHeader
        eyebrow={t("packages.eyebrow")}
        title={t("packages.headline")}
        lede={t("packages.lede")}
      />

      <nav aria-labelledby="toc-heading" className="mt-7 max-w-[68ch]">
        <h2
          id="toc-heading"
          className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)]"
        >
          {t("packages.toc.heading")}
        </h2>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13.5px]">
          {TOC.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="text-[var(--text-dim)] hover:text-[var(--clear)] transition-colors"
              >
                {t(item.key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── The library ───────────────────────────────────────────────────── */}

      <section className="mt-10">
        <AnchorHeading id="library" className={H2}>
          {t("packages.detect.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("packages.detect.body")}</p>
        <PackageBanner name={NPM_PACKAGE} url={NPM_URL}>
          {t("ways.npm.how")}
        </PackageBanner>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="install" level={3} className={H3}>
          {t("npm.install.heading")}
        </AnchorHeading>
        <div className="mt-3 max-w-[68ch]">
          <InstallTabs pkg={NPM_PACKAGE} label="install command" />
        </div>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="quickstart" level={3} className={H3}>
          {t("npm.quickstart.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("npm.quickstart.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={QUICKSTART} label="quickstart example" />
        </div>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="analyze" level={3} className={H3}>
          {t("npm.analyze.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("npm.analyze.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={ANALYZE} label="analyzeContent example" />
        </div>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="result" level={3} className={H3}>
          {t("npm.result.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("npm.result.body")}</p>
        <dl className="mt-3 max-w-[68ch] rounded-2xl border border-[var(--rule)] divide-y divide-[var(--rule)]">
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
              <dt className="shrink-0 sm:w-28 font-[family-name:var(--font-mono-ui)] text-[13px] text-[var(--clear)]">
                {f.name}
              </dt>
              <dd className="text-[13.5px] text-[var(--text-dim)] leading-relaxed">{t(f.key)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Tinted, because it is the one thing on this page that changes whether
          an integration is safe. A caution styled like body copy is a caution
          that gets skimmed. */}
      <section
        className={`${SECTION} max-w-[68ch] rounded-2xl border border-[var(--caution)]/35 bg-[var(--caution)]/10 p-5`}
      >
        <AnchorHeading id="coverage" level={3} className={H3}>
          {t("npm.coverage.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("npm.coverage.body")}</p>
        <p className="mt-2 text-[13.5px] font-semibold text-[var(--foreground)]">
          {t("npm.coverage.advice")}
        </p>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="regions" level={3} className={H3}>
          {t("npm.regions.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("npm.regions.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={REGIONS} label="region example" />
        </div>
      </section>

      {/* ── The MCP server ────────────────────────────────────────────────── */}

      {/* A rule, not just spacing: this is where one package ends and the other
          begins, and on a long scroll the gap alone read as a paragraph break. */}
      <section className="mt-12 border-t border-[var(--rule)] pt-10">
        <AnchorHeading id="mcp" className={H2}>
          {t("packages.mcp.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("packages.mcp.body")}</p>
        <PackageBanner name={MCP_PACKAGE} url={MCP_URL}>
          {t("packages.mcp.install.body")}
        </PackageBanner>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="mcp-install" level={3} className={H3}>
          {t("packages.mcp.install.heading")}
        </AnchorHeading>

        {/* One strip for the whole section: the three samples below are all
            runtime-dependent and have to change together, or a reader sets bun
            here and copies an npx config two blocks down. */}
        <div className="mt-3 max-w-[68ch]">
          <ManagerTabs active={manager} onChange={setManager} label="runtime" />
        </div>

        <h4 className="mt-4 text-[13px] font-semibold text-[var(--text-dim)]">
          {t("packages.mcp.claude.heading")}
        </h4>
        <div className="mt-2 max-w-[68ch]">
          <CodeBlock code={mcpClaudeCommand(manager)} label="Claude Code command" />
        </div>

        <h4 className="mt-5 text-[13px] font-semibold text-[var(--text-dim)]">
          {t("packages.mcp.config.heading")}
        </h4>
        <p className={BODY}>{t("packages.mcp.config.body")}</p>
        <div className="mt-2 max-w-[68ch]">
          <CodeBlock code={mcpConfig(manager)} label="MCP client config" />
        </div>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="mcp-tools" level={3} className={H3}>
          {t("packages.mcp.tools.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("packages.mcp.tools.body")}</p>
        <dl className="mt-3 max-w-[68ch] rounded-2xl border border-[var(--rule)] divide-y divide-[var(--rule)]">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
              <dt className="shrink-0 sm:w-36 font-[family-name:var(--font-mono-ui)] text-[13px] text-[var(--clear)]">
                {tool.name}
              </dt>
              <dd className="text-[13.5px] text-[var(--text-dim)] leading-relaxed">{t(tool.key)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={SECTION}>
        <AnchorHeading id="mcp-network" level={3} className={H3}>
          {t("packages.mcp.network.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("packages.mcp.network.body")}</p>
        <p className="mt-3 text-[13.5px] text-[var(--text-dim)] leading-relaxed max-w-[68ch]">
          {t("packages.mcp.network.offline")}
        </p>
        <div className="mt-2 max-w-[68ch]">
          <CodeBlock code={mcpOfflineCommand(manager)} label="offline invocation" />
        </div>
      </section>

      {/* ── Both ──────────────────────────────────────────────────────────── */}

      <section className={`${SECTION} border-t border-[var(--rule)] pt-8`}>
        <AnchorHeading id="docs" className={H2}>
          {t("packages.more.heading")}
        </AnchorHeading>
        <p className={BODY}>{t("packages.more.body")}</p>
        <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 max-w-[68ch]">
          {[
            { pkg: NPM_PACKAGE, links: [ENGINE_README_URL, NPM_URL, ENGINE_SOURCE_URL] },
            { pkg: MCP_PACKAGE, links: [MCP_README_URL, MCP_URL, MCP_SOURCE_URL] },
          ].map((group) => (
            <div key={group.pkg}>
              <code className="font-[family-name:var(--font-mono-ui)] text-[12.5px] text-[var(--text-dim)]">
                {group.pkg}
              </code>
              <ul className="mt-1.5 flex flex-col gap-1 text-[14px] font-semibold text-[var(--clear)]">
                {[
                  t("npm.more.readme"),
                  t("npm.more.npm"),
                  t("npm.more.source"),
                ].map((label, i) => (
                  <li key={label}>
                    <ExternalLink href={group.links[i]} variant="action">
                      {label}
                    </ExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
