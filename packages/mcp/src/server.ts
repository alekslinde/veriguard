// The Veriguard MCP server: rule-based scam checks, exposed as tools.
//
// Scoring is the same engine the website and the extension run, unchanged —
// keyword lists, domain allow/denylists, regex and weighted scoring. The
// assistant calling these tools decides what to say about a result; it has no
// part in producing one. That separation is the point of shipping this as a
// tool rather than a prompt: a model that is wrong about a link cannot make the
// verdict wrong, only the summary of it.
//
// ── What this process contacts ───────────────────────────────────────────────
//
// Two hosts, both chosen by us, neither of them a host that arrived in the
// input being checked:
//
//   · urlhaus.abuse.ch — the blocklist feed, on a 6-hour timer
//   · a fixed allowlist of URL-shortener hosts, to resolve short links
//
// The content being checked is never sent anywhere. The shortener case is the
// one that looks like an exception and is not: expansion issues a HEAD to the
// shortener only, and stops before the destination. A scam URL is read as
// text, never visited — visiting one tells the operator their link is live and
// under investigation, which can burn a victim's chance at a takedown.
// __tests__/privacyInvariant.test.ts enforces that on the engine, and
// __tests__/mcpServer.test.ts enforces it on this process.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  analyzeContent,
  checkUrl,
  checkPhone,
  checkEmail,
} from "@veriguard/scam-detect/scamDetector";
import { supportedRegions, DEFAULT_REGION } from "@veriguard/scam-detect/regions";
import type { RegionInput } from "@veriguard/scam-detect/regions";
import type { HostLookup } from "@veriguard/scam-detect/engineTypes";

import { UrlhausBlocklist } from "./blocklist.js";
import { formatResult, formatAnalysis } from "./format.js";

export interface ServerOptions {
  /**
   * Resolve shortened links by contacting the shortener (never the
   * destination). Off leaves a short link reported as unexpanded rather than
   * judged on the shortener alone.
   */
  expandLinks: boolean;
  /** Consult the abuse.ch blocklist. Off means one fewer signal, not a weaker promise. */
  blocklist: boolean;
  /** Region pack governing which local rules apply. */
  region: RegionInput;
}

export const DEFAULT_OPTIONS: ServerOptions = {
  expandLinks: true,
  blocklist: true,
  region: DEFAULT_REGION,
};

/**
 * The region argument, shared by every tool.
 *
 * Optional, because an assistant usually does not know where its user is and a
 * required argument would be answered with a guess. Omitted means the default
 * pack rather than no pack, and the result carries its own coverage note, so a
 * wrong region degrades to "generic signals only" rather than to a wrong
 * verdict.
 */
const regionArg = z
  .string()
  .optional()
  .describe(
    `Two-letter region code governing which local scam rules apply (${supportedRegions().join(", ")}). ` +
      `Defaults to ${DEFAULT_REGION}. Pass the user's country when you know it — the rules for ` +
      `impersonated banks, government services and phone formats are country-specific.`,
  );

export function createServer(options: ServerOptions = DEFAULT_OPTIONS): McpServer {
  const server = new McpServer({
    name: "veriguard",
    version: "0.1.0",
  });

  const blocklist = options.blocklist ? new UrlhausBlocklist() : null;

  /**
   * The blocklist, refreshed if stale.
   *
   * Awaited rather than fired and forgotten: on the first call it is the
   * difference between consulting the feed and silently not. `refreshIfStale`
   * owns the timing and the failure handling, and returns immediately when the
   * copy is fresh, so this costs nothing on the calls after the first.
   */
  async function lookup(): Promise<HostLookup | undefined> {
    if (!blocklist) return undefined;
    await blocklist.refreshIfStale();
    return blocklist;
  }

  /** The network transport for link expansion, or none when it is off. */
  const fetcher = options.expandLinks ? (fetch as never) : undefined;

  const resolveRegion = (region?: string): RegionInput =>
    (region ?? options.region) as RegionInput;

  server.registerTool(
    "check_message",
    {
      title: "Check a message for scam signals",
      description:
        "Check a suspicious SMS, email, chat message or any pasted text for scam, phishing and " +
        "impersonation signals. Finds every link, email address and phone number in the text and " +
        "scores each one, plus the wording itself. Use this when you have the message and do not " +
        "already know which part is suspect — it is the right default. Scoring is rule-based and " +
        "deterministic; the content is not sent anywhere.",
      inputSchema: {
        content: z
          .string()
          .min(1)
          .describe(
            "The full message text, pasted verbatim. Include headers, signatures and links — " +
              "sender addresses and link structure carry much of the signal, and summarising the " +
              "message first will lose it.",
          ),
        region: regionArg,
      },
    },
    async ({ content, region }) => {
      const cards = await analyzeContent(content, await lookup(), resolveRegion(region), { fetcher });
      return {
        content: [{ type: "text", text: formatAnalysis(cards) }],
        structuredContent: { results: cards },
      };
    },
  );

  server.registerTool(
    "check_url",
    {
      title: "Check a URL",
      description:
        "Score a single URL for phishing and impersonation signals — lookalike domains, suspicious " +
        "TLDs, brand impersonation, obfuscation" +
        (options.blocklist ? ", and presence on the abuse.ch malware blocklist" : "") +
        ". The URL is read as text and never visited" +
        (options.expandLinks
          ? "; a shortened link is resolved by contacting the shortener only, never the destination."
          : "."),
      inputSchema: {
        url: z
          .string()
          .min(1)
          .describe("The URL to check. Defanged forms (hxxp://evil[.]tk) and bare hostnames are accepted."),
        region: regionArg,
      },
    },
    async ({ url, region }) => {
      // checkUrl is synchronous and does no expansion. Routing through
      // analyzeContent is what gives a shortened link its real destination, and
      // it is the path the website uses — so the MCP verdict and the website
      // verdict for the same URL come from the same code.
      const cards = await analyzeContent(url, await lookup(), resolveRegion(region), { fetcher });
      const card = cards.find((c) => c.kind === "url");
      if (!card) {
        // Not a URL the extractor recognises. Score it as text rather than
        // returning nothing, so the caller gets an answer about what they sent.
        const result = checkUrl(url, await lookup(), resolveRegion(region));
        return {
          content: [{ type: "text", text: formatResult(result, url) }],
          structuredContent: { result },
        };
      }
      return {
        content: [{ type: "text", text: formatResult(card.result, card.value) }],
        structuredContent: { result: card.result },
      };
    },
  );

  server.registerTool(
    "check_phone",
    {
      title: "Check a phone number",
      description:
        "Check a phone number for scam signals — premium-rate and 'one ring' callback prefixes, " +
        "line type, country, and how easily the caller ID can be spoofed. Use this for a number " +
        "that called or texted the user. Note that a number showing low spoofing risk is still not " +
        "proof the caller is who they claim.",
      inputSchema: {
        phone: z
          .string()
          .min(1)
          .describe("The phone number, in any format. Include the country code when you have it."),
        region: regionArg,
      },
    },
    async ({ phone, region }) => {
      const result = checkPhone(phone, resolveRegion(region));
      return {
        content: [{ type: "text", text: formatResult(result, phone) }],
        structuredContent: { result },
      };
    },
  );

  server.registerTool(
    "check_email",
    {
      title: "Check an email",
      description:
        "Check an email for phishing signals, including the headers. Paste the full source when you " +
        "can — SPF, DKIM, DMARC results and a Reply-To that differs from the From address are among " +
        "the strongest signals available, and they exist only in the headers. A sender address alone " +
        "is also accepted.",
      inputSchema: {
        email: z
          .string()
          .min(1)
          .describe(
            "The email: full source with headers, or just the sender address. Full source scores " +
              "considerably better.",
          ),
        region: regionArg,
      },
    },
    async ({ email, region }) => {
      const result = checkEmail(email, await lookup(), resolveRegion(region));
      return {
        content: [{ type: "text", text: formatResult(result, email) }],
        structuredContent: { result },
      };
    },
  );

  return server;
}

/** Start the server on stdio. */
export async function main(options: ServerOptions = DEFAULT_OPTIONS): Promise<void> {
  const server = createServer(options);
  await server.connect(new StdioServerTransport());
}
