// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: Apache-2.0

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
} from "@veriguard/detect/scamDetector";
import { supportedRegions, DEFAULT_REGION } from "@veriguard/detect/regions";
import type { RegionInput } from "@veriguard/detect/regions";
import type { HostLookup } from "@veriguard/detect/engineTypes";

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
 * pack.
 *
 * An ENUM rather than a free string, and that is the load-bearing part.
 * `resolveRegionPack` never throws: an unrecognised code resolves to
 * DEFAULT_REGION, which is AU, whose coverage is `full` — so there is no
 * coverage note to warn anyone. A near-miss code like "UK" (the real one is
 * "GB") or "USA" would therefore score a British message against Australian
 * bank and government rules and present the verdict with full confidence. That
 * silent fallback is right for a web request carrying a stale cookie and wrong
 * for an argument a model just invented, which is the same reasoning the CLI's
 * --region flag already applies.
 *
 * Enumerating the codes also puts them in the tool schema, so a client sees
 * which values exist instead of inferring them from a sentence.
 */
const REGION_CODES = supportedRegions();

export const regionArg = z
  .string()
  // Case-folded before validation, not after: the engine uppercases internally,
  // so "au" is a working call today and a bare enum would turn it into an error
  // for no benefit. This accepts what already worked and rejects only codes
  // that name no pack.
  .transform((value) => value.toUpperCase())
  .refine((value): value is string => (REGION_CODES as readonly string[]).includes(value), {
    message: `unknown region — expected one of ${REGION_CODES.join(", ")} (note GB, not UK; US, not USA)`,
  })
  .optional()
  .describe(
    `Two-letter region code governing which local scam rules apply. ` +
      `Defaults to ${DEFAULT_REGION}. Pass the user's country when you know it — the rules for ` +
      `impersonated banks, government services and phone formats are country-specific. ` +
      `Use the exact code: GB (not UK), US (not USA).`,
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
   * owns the timing, the failure backoff and the in-flight sharing, and returns
   * immediately whenever the copy is fresh or a recent attempt failed — so the
   * only calls that wait are the ones actually fetching.
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
