# `@veriguard/mcp`

An [MCP](https://modelcontextprotocol.io) server that gives your AI assistant
rule-based scam, phishing and impersonation checks. Paste a dodgy SMS, email,
link or phone number into your assistant and it gets a verdict with the
evidence behind it.

The scoring is not done by a model. It is the same rule-based engine
([`@veriguard/detect`](https://www.npmjs.com/package/@veriguard/detect))
that runs the Veriguard website and browser extension — keyword lists, domain
allow/denylists, regex and weighted scoring. Your assistant decides what to
*say* about a result; it has no part in producing one. That is the reason to
ship this as a tool rather than a prompt: a model that is wrong about a link
cannot make the verdict wrong, only the summary of it.

*Last reviewed: 2026-10-01.*

## Install

Nothing to install — point your MCP client at it:

```json
{
  "mcpServers": {
    "veriguard": {
      "command": "npx",
      "args": ["-y", "@veriguard/mcp"]
    }
  }
}
```

In Claude Code: `claude mcp add veriguard -- npx -y @veriguard/mcp`.

## Tools

| Tool | Use it for |
| --- | --- |
| `check_message` | Any pasted text — SMS, email, chat. Finds every link, address and phone number in it and scores each, plus the wording. **The right default.** |
| `check_url` | A single link. |
| `check_phone` | A number that called or texted. |
| `check_email` | An email, ideally with full headers. |

All four take an optional `region` (`AU`, `GB`, `US`, `NZ`, `CA`, `IE` and
more; defaults to `AU`). Rules for impersonated banks, government services and
phone formats are country-specific, so pass it when you know it.

Each returns the verdict and score, the evidence rows with their weights, and
the scam tactics the message uses — named as the Veriguard app's Learn page
names them, so what someone learns from one result applies to the next message.

## What this process contacts

Two hosts, both fixed, neither of them a host that arrived in what you are
checking:

| Host | Why | Turn it off |
| --- | --- | --- |
| `urlhaus.abuse.ch` | Malware/phishing blocklist, refreshed every 6 hours | `--no-blocklist` |
| A fixed allowlist of URL shorteners | Resolve `bit.ly`-style links to their real destination | `--no-expand` |

**The content you check is never sent anywhere.** Scoring happens in this
process.

**A URL you check is never visited.** It is read as text. Link expansion issues
a `HEAD` to the *shortener* and stops before the destination — so a scam link is
never contacted. This matters beyond privacy: fetching a scam URL tells the
operator their link is live and under investigation, which can burn a victim's
one chance at a takedown.

Both flags together leave the server with no network access at all:

```bash
npx @veriguard/mcp --no-blocklist --no-expand
```

These are properties, not promises. `__tests__/mcpServer.test.ts` runs every
tool with the network intercepted and fails if any host from the input is
contacted, or if either flag stops working; `__tests__/privacyInvariant.test.ts`
enforces the same invariant on the engine. A lint rule bans Node's network
modules from the detector entirely.

## Reading a result

Two things worth knowing before you act on one, both about not overreading:

**`Safe` means "no rules matched", not "verified legitimate".** The output says
so on every safe verdict.

**Coverage qualifies a low score.** Where a region's rules are partial or
absent, a low score can mean "nothing matched" rather than "nothing is wrong",
and the result says which case you are in.

## Options

```
--region <CODE>   Region pack for local scam rules (default: AU)
--no-blocklist    Do not consult the abuse.ch blocklist
--no-expand       Do not resolve shortened links
-h, --help        Show usage and the network summary above
```

An unrecognised region is rejected rather than silently replaced with the
default — otherwise every check would score against the wrong country's rules
while looking perfectly plausible.

## Programmatic use

The server is exported if you want to host it on a different transport:

```ts
import { createServer, DEFAULT_OPTIONS } from "@veriguard/mcp";

const server = createServer({ ...DEFAULT_OPTIONS, blocklist: false });
```

To score messages without MCP at all, use
[`@veriguard/detect`](https://www.npmjs.com/package/@veriguard/detect)
directly.

## Licence

Apache-2.0. Copyright 2026 Aleks Linde; see [`NOTICE`](NOTICE). Detection logic is intentionally open source: transparency lets the
community improve it, and obscuring keyword lists would not stop a sophisticated
scammer.
