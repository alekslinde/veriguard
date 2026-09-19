# Inbound Email Worker

*Last reviewed: 2026-09-20.*

Receives forwarded suspicious emails at `check@<domain>`, sends the raw message
to the Next app's `/api/inbound` for analysis, and replies to the forwarder with
a plain-English verdict.

```
forward ─▶ Cloudflare Email Routing ─▶ this Worker ─▶ POST /api/inbound
                                                  ◀─ { reply: {subject,text,html} }
        ◀──────────── reply to the forwarder (message.reply) ◀──────────
```

The raw email is **never stored**. The Worker streams it to the API, which
analyses it in memory and returns a verdict; nothing is persisted but an
anonymous counter. Replies can only go back to the original sender, so the
Worker cannot be abused as an open relay.

> **Forking this?** The auto-reply is an abuse surface. The mitigations here
> (reply-only, webhook secret, per-sender rate limit, analyse-and-discard) are
> mandatory — see [`SECURITY.md`](../../SECURITY.md) before you deploy a copy.

## Deployment model

Two **independent** deploy targets — neither deploys the other:

| | Next app (`/`) | This Worker (`workers/inbound-email/`) |
| --- | --- | --- |
| Host | the app host (git push → build) | **Cloudflare** (`wrangler deploy`) |
| `/api/inbound` lives here | ✅ | — |
| `INBOUND_SECRET` set as | app-host env var | GitHub repo secret → pushed on deploy |

The two share one value: **`INBOUND_SECRET` must be identical** on the app and
on the Worker, or the webhook 401s every call.

## Go-live runbook (one-time)

Do these in order. Steps 0–1 are the prerequisites people miss.

Throughout, **`<your-domain>`** is the domain you are receiving mail on —
substitute your own. Nothing below is specific to any one deployment: the only
committed values that name a particular one are `name` and
`INBOUND_WEBHOOK_URL` in `wrangler.toml`, and both are yours to change.

0. **Domain DNS must be on Cloudflare.** Cloudflare Email Routing can only add MX
   records if Cloudflare is the domain's DNS provider. If `<your-domain>`
   currently resolves through your registrar or app host, move the domain's
   nameservers to Cloudflare first (the app is still served via its records;
   only DNS hosting moves). **Nothing below works until this is done.**

1. **Enable Email Routing.** Cloudflare dashboard → **Compute → Email Service →
   Email Routing** → select the domain → enable. (This setting used to live under
   the domain itself, at *the domain → Email → Email Routing*; Cloudflare has
   since moved it to account level. Older guides still cite the domain path.)
   Enabling auto-adds the **MX** and **SPF (TXT)** records. Then go
   to its DNS/authentication settings and **publish the DKIM and DMARC records it
   offers** — these are what make the verdict reply pass authentication and reach
   the inbox (see *Deliverability* below). Verify all records are live. While here,
   consider enabling **MTA-STS** to enforce TLS in transit (see *Transport
   security* below) — recommended, but can be done after launch.

2. **Pick the shared secret.** Generate one (`openssl rand -hex 32`). You'll set
   the same value in two places (steps 3 and 5).

3. **Set it on the app host.** Add `INBOUND_SECRET` = the value from step 2 to
   the app's environment. Also confirm the app is deployed with `/api/inbound`
   live. If your host bakes env vars at build time, **redeploy** after adding
   it.

4. **Point the webhook at the app.** `wrangler.toml` → `INBOUND_WEBHOOK_URL`
   should be your deployed app's `/api/inbound`
   (`https://<your-domain>/api/inbound`). The committed value points at this
   project's own deployment — change it when running your own.

5. **Deploy the Worker** — either path sets the secret on the Worker:

   - **CI (recommended):** add three GitHub repo secrets — `CLOUDFLARE_API_TOKEN`
     (a token scoped to *Edit Workers*), `CLOUDFLARE_ACCOUNT_ID`, and
     `INBOUND_SECRET` (same value as step 3). Push to `main`; the
     [deploy-inbound-worker workflow](../../.github/workflows/deploy-inbound-worker.yml)
     deploys and pushes the secret automatically. Or run it manually from the
     Actions tab (**Run workflow**).
   - **Manual:**
     ```sh
     npm ci
     npx wrangler secret put INBOUND_SECRET   # paste the step-2 value
     npm run deploy
     ```

6. **Bind the address.** Email Routing (Compute → Email Service, as in step 1) →
   Routing rules → add a custom address `check@<your-domain>` → action
   **Send to a Worker → `veriguard-inbound-email`** (the `name` in `wrangler.toml` —
   rename it there first if you want your own).

7. **Verify end-to-end.** Forward a known scam email to `check@<domain>` from a
   normal account (Gmail/iCloud). Within a few seconds you should get a threaded
   verdict reply **in the inbox** (not spam — if it's spam, recheck step 1's
   DKIM/DMARC records). Also forward a clean email and confirm the "no tracking"
   reassurance reads correctly. This also confirms the reply delivers **on your
   current plan** at no cost — see *Cost* below; replies show as "dropped" in the
   Routing summary even when they arrive.

8. **Flip the UI flag.** Only once step 7 passes: set
   `NEXT_PUBLIC_INBOUND_ENABLED=true` in the app's environment and redeploy, so
   the "forward it to us" address is shown to users. Never advertise a dead
   inbox.

   > **A host may refuse to store this one as a secret.** Any
   > `NEXT_PUBLIC_`-prefixed variable is inlined into the client bundle, so it
   > is not secret by construction, and some hosts reject it as a secret
   > environment variable without saying why. Store it as plain/public
   > configuration — genuinely sensitive values like `INBOUND_SECRET` in step 3
   > stay secret.

### Rotating the secret later

There are **three** places the value lives, and all three must match:

| Where | How it gets the new value |
| --- | --- |
| GitHub repo secret | edit it directly |
| **The Worker (Cloudflare)** | **re-run the deploy workflow** — editing the GitHub secret does not deploy anything |
| The app's env var | edit it on the host, then redeploy |

The middle row is the one that gets missed: rotating the GitHub secret changes
what the *next* deploy would push, and nothing more. Until that workflow runs,
the Worker keeps presenting the old value and every call to `/api/inbound`
401s. Inbound mail is dead for as long as the three disagree, so rotate them
close together and finish with the workflow run.

Set the Worker's value as a **secret**, never a `[vars]` entry — a plaintext
variable of the same name both exposes it in the dashboard and collides with
the secret binding. Avoid editing it by hand in the dashboard at all: the
deploy workflow re-pushes it from the GitHub secret on every run, so a manual
value silently reverts at the next merge to `main`.

## When a forward gets no reply

Every way a forward can die now says so in the Worker's logs
(`npx wrangler tail`, or the dashboard's live logs). A healthy forward logs only
its `inbound References entries: N, auth: …` line, so any *warning or error*
here is the diagnosis:

| Log line | Means |
| --- | --- |
| `inbound webhook rejected: HTTP 401 … INBOUND_SECRET likely does not match` | The three copies of the secret have drifted. See above. |
| `inbound webhook rejected: HTTP 5xx` | The app is up but erroring — check the app's own logs for `inbound analysis failed`. |
| `inbound webhook unreachable` | Wrong `INBOUND_WEBHOOK_URL`, or the app is down. |
| `inbound skipped by API: rate-limited` | Working as intended — the per-sender budget. |
| `reply refused by the mail platform (inbound References entries: N, auth: …)` | The platform declined the reply and reports several distinct causes through one error, so it passes that wording through rather than naming one. Both measured conditions ride along: the inbound chain length, and the authentication verdicts the receiving MTA recorded. Compare them against the same figures from forwards that succeeded — a refusal is only readable that way. See *When NO reply is sent*. |
| `inbound dropped: raw unreadable or over …` | The forward exceeded `MAX_RAW_BYTES`. |

Silence in the Worker's log while mail still goes unanswered means the message
never reached the Worker — check the Email Routing rule binding
(step 6) rather than anything in this directory.

## Deliverability — keeping the reply out of spam

The verdict reply is sent with `message.reply()` on the same SMTP transaction the
forward arrived on. That path is inherently more trusted than a cold send, but
mailbox providers still judge it on authentication. To land in the inbox:

1. **Publish the SPF, DKIM and DMARC records** Cloudflare gives you in the Email
   Routing dashboard for the receiving domain. Cloudflare **DKIM-signs the reply
   automatically** with that domain's key — we do not sign anything in code — so
   these records are what make the signature verify. Without them the reply is
   unauthenticated and Gmail/Outlook/Yahoo will filter it.
2. **From alignment is handled in code:** the reply's `From` is the address that
   received the mail (`check@<domain>`), because Cloudflare requires the reply's
   sender domain to match the receiving domain. `buildReplyMime` sets this.
3. **Threading + automated-reply hints** also help: the reply carries
   `In-Reply-To`, a `References` chain, and `Auto-Submitted: auto-replied`, so it
   reads as a genuine threaded reply, not an unsolicited send, and won't
   bounce-loop with other auto-responders. The chain is preserved but **bounded**
   — a reply is refused outright when the message it answers carries more than
   100 `References` entries, and each forwarding hop adds one, so the builder
   keeps the thread root and the most recent entries and drops the middle
   (permitted by RFC 5322 §3.6.4). Clients still group and nest the reply
   correctly, and a long-lived thread cannot grow itself into that refusal.

### Cost: why this uses reply() and not outbound sending

Sending to **arbitrary recipients** (Cloudflare Email Service / the `send_email`
binding to unverified addresses) requires the **Workers Paid** plan ($5/mo +
$0.35/1k after 3,000/mo). We deliberately avoid that: `message.reply()` is an
**Email Routing** primitive that replies *on the inbound SMTP transaction* back to
the original sender only — part of the free Email Routing tier, and inherently
abuse-proof (it can only reach whoever forwarded the mail). So the verdict reply
costs nothing.

> Re-verify at go-live: Cloudflare's docs are explicit that *arbitrary* sending is
> paid, but don't state in writing that `reply()` is exempt. Confirm in the
> dashboard that replies deliver on your plan before flipping the UI flag. (Heads
> up: replies show as **"dropped"** in the Email Routing summary even when
> delivered — that's expected, not a failure.)

### When NO reply is sent

`message.reply()` is allowed only when every one of the platform's documented
conditions holds. Three are structural — the reply goes to the incoming sender,
the sending domain matches the receiving domain, and one reply per event — and
the Worker satisfies those identically for every message, so they never explain
a refusal in production. Two are properties of the forward itself:

- **The incoming forward must have a valid DMARC result.** A forward from a
  provider or path that fails DMARC is refused. Most consumer providers
  (Gmail/Outlook/iCloud) pass on forwards, so this is an edge case.
- **The incoming forward must carry no more than 100 `References` entries.**
  Each hop adds one, so mail that has been passed around a group before reaching
  us accumulates them — which is exactly the mail this flow is built for. The
  *reply* we build is bounded (see *Deliverability*), but the limit is checked
  against the incoming message, so a chain that long is refused regardless.

All of these throw, and the Worker logs the refusal with both measured
conditions rather than failing silently. The error names no cause, so those two
figures are what discriminate between them.

**A malformed reply is refused the same way, with the same wording.** A reply
built with a `References` entry repeated — which happened when the inbound chain
was a single Message-ID and that ID was appended to a chain already ending with
it — was refused on every forward, with an error naming none of the conditions
above. Two diagnoses were talked out of the evidence before the header itself
was read. When refusals are universal rather than occasional, suspect what the
Worker builds before suspecting the forward: print the generated MIME and look
at it.

**Decision (current):** accept this — no paid outbound sender. If it becomes a
real problem, the upgrade is a fallback that sends a fresh message via a
transactional provider (Resend, Cloudflare Email Service, SES) when `reply()` is
rejected. The Worker is already shaped for this: `/api/inbound` returns
`{subject, text, html}` and the Worker chooses how to send, so adding a fallback
is localized to `src/index.ts` — `buildReplyMime` and the analysis are untouched.

## Transport security (MTA-STS) — recommended hardening

A forwarded email transits SMTP servers between the user's provider and us, and
between us and them on the reply. SMTP uses **opportunistic** TLS (STARTTLS): each
hop is encrypted only if both servers offer it, and a network attacker can strip
the offer to force plaintext. Cloudflare → big providers (Gmail/Outlook/iCloud) is
TLS in practice, but it isn't *guaranteed* and downgrade attacks are possible.

**MTA-STS makes TLS mandatory** for the domain and blocks STARTTLS downgrades —
mail won't deliver at all if a secure channel can't be established. Given we handle
potentially sensitive forwarded emails, enabling it is the right call. Cloudflare
supports it (including upstream, for the reply path). Setup:

1. Add a CNAME `_mta-sts` → `_mta-sts.mx.cloudflare.net` (DNS-only, not proxied).
2. Serve the policy file at `https://mta-sts.<domain>/.well-known/mta-sts.txt` —
   Cloudflare's docs use a tiny Worker that proxies to
   `https://mta-sts.mx.cloudflare.net/.well-known/mta-sts.txt`. The policy lists
   `mx: *.mx.cloudflare.net`.
3. **Roll out in `mode: testing` first**, add a TLS-RPT record, and watch the
   reports for a couple of weeks before switching the policy to `mode: enforce` —
   enforcing a misconfigured policy would silently drop inbound mail.

This is independent of the auth records above (SPF/DKIM/DMARC prove *who* sent the
mail; MTA-STS protects *the channel* it travels over). Note it's transport
encryption only — not end-to-end; the Worker still reads the message in cleartext
to analyse it, which is why the user-facing copy says "we read it on arrival and
don't keep a copy" rather than implying the email is private the whole way.

See: <https://developers.cloudflare.com/email-service/configuration/mta-sts/>

## Local development

```sh
npm install
npm test          # node:test — the email() handler and the reply MIME builder
npm run dev       # wrangler dev — replay a fixture against the email() handler
npm run typecheck
```

`npm test` covers the reply MIME builder (`src/reply.ts`: From alignment,
threading headers, multipart body) and the `email()` handler's control flow —
which of the webhook's answers produce a reply, and that each way a forward can
die is reported rather than dropped in silence.

Reaching the handler at all needs `test/loader.mjs`, a resolver hook mapping
`cloudflare:email` to a local stub: that module exists only in the Workers
runtime and the default ESM loader rejects its scheme outright. `npm test`
registers the hook; a bare `node --test` fails on the import. Because of it,
`src/` imports carry explicit `.ts` extensions — wrangler accepts either form,
bare Node does not.

What the stub cannot cover is the real `message.raw` stream and the actual
`message.reply()` send, which only exist inside Cloudflare's email runtime —
exercise those with `wrangler dev` (it can simulate an inbound message) pointing
`INBOUND_WEBHOOK_URL` at a local tunnel or a staging deploy of the Next app.

## Notes

- `MAX_RAW_BYTES` (1 MB) drops oversized messages before calling the API; the
  API enforces the same cap as defence in depth.
- Per-sender rate limiting lives in the API (`/api/inbound`), so a flood of
  forwards from one address stops generating replies.
- The verdict copy is English-only for now (the email channel has no locale).
