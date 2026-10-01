#!/usr/bin/env node
//
// `npx @veriguard/mcp` — the stdio entry point.
//
// Everything is on by default and each capability has an off switch, rather
// than the reverse. A person installing a scam checker wants it checking; a
// flag they did not know to pass should not be what stands between them and a
// signal. The two network capabilities are named in --help and in the README,
// so turning them off is an informed choice and leaving them on is not a
// surprise.
//
// Nothing here writes to stdout. On stdio transport, stdout IS the protocol
// channel — a stray console.log is a parse error at the other end. Diagnostics
// go to stderr, which the client shows in its logs.

import { main, DEFAULT_OPTIONS, type ServerOptions } from "./server.js";
import { supportedRegions, DEFAULT_REGION } from "@veriguard/scam-detect/regions";
import type { RegionInput } from "@veriguard/scam-detect/regions";

const HELP = `veriguard-mcp — rule-based scam, phishing and impersonation checks over MCP

USAGE
  npx @veriguard/mcp [options]

OPTIONS
  --region <CODE>   Region pack for local scam rules (default: ${DEFAULT_REGION})
                    ${supportedRegions().join(", ")}
  --no-blocklist    Do not consult the abuse.ch malware blocklist
  --no-expand       Do not resolve shortened links
  -h, --help        Show this message

NETWORK
  This server contacts two hosts, both fixed and both chosen by Veriguard:

    urlhaus.abuse.ch        the malware blocklist feed, refreshed every 6 hours
    known URL shorteners    an allowlist, to resolve short links

  The content you check is never sent anywhere, and a URL you check is never
  visited — it is read as text. Link expansion contacts the shortener only and
  stops before the destination. Scoring is rule-based and runs in this process.

  --no-blocklist and --no-expand leave the server with no network access at all.
`;

export function parseArgs(argv: readonly string[]): ServerOptions | "help" {
  const options: ServerOptions = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        return "help";
      case "--no-blocklist":
        options.blocklist = false;
        break;
      case "--no-expand":
        options.expandLinks = false;
        break;
      case "--region": {
        const value = argv[++i];
        if (!value) throw new Error("--region needs a value");
        const upper = value.toUpperCase();
        // Validated here rather than left to the engine's silent fallback. A
        // typo would otherwise score every check against the default pack
        // while the operator believed their region was active — wrong local
        // rules, no warning, and a plausible-looking verdict.
        if (!supportedRegions().includes(upper as never)) {
          throw new Error(
            `unknown region "${value}" — expected one of ${supportedRegions().join(", ")}`,
          );
        }
        options.region = upper as RegionInput;
        break;
      }
      default:
        throw new Error(`unknown option "${arg}" (try --help)`);
    }
  }

  return options;
}

const parsed = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`veriguard-mcp: ${(err as Error).message}\n`);
    process.exit(2);
  }
})();

if (parsed === "help") {
  process.stderr.write(HELP);
  process.exit(0);
}

main(parsed).catch((err: unknown) => {
  process.stderr.write(`veriguard-mcp: ${String(err)}\n`);
  process.exit(1);
});
