// Unit tests for the email() handler's failure reporting.
//
// Why these exist: a stale INBOUND_SECRET took the whole forward-to-check path
// down, and nothing anywhere said so. A non-2xx from the webhook resolves
// rather than throwing, so the 401 body fell through the same branch the API
// uses to decline a reply on purpose, and a hard outage was indistinguishable
// from a quiet day. These assert that each way a forward can die says which one
// it was — the property that turns "no reply came back" into a diagnosis.
//
// The handler imports `cloudflare:email`, which only resolves inside the
// Workers runtime, so it is mocked here. That import is the reason this file
// did not exist before and the reply MIME builder was the only thing covered;
// node:test's loader mocking is enough to reach the handler without wrangler.
// The mock stands in for the module, NOT for the logic under test — every
// branch below is the real src/index.ts.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

// `cloudflare:email` is supplied by the Workers runtime and the default ESM
// loader rejects its scheme, so test/loader.mjs maps it to a local stub. The
// npm test script registers that loader; running this file with a bare
// `node --test` will fail on the import.
const { default: handler } = await import("../src/index.ts");

const ENV = {
  INBOUND_SECRET: "test-secret",
  INBOUND_WEBHOOK_URL: "https://example.test/api/inbound",
};

/** A forward the Worker can read: a real stream, a sender, a Message-ID. */
function fakeMessage(overrides: { replyThrows?: boolean } = {}) {
  const replies: unknown[] = [];
  return {
    from: "forwarder@gmail.com",
    to: "check@veriguard.app",
    headers: new Headers({ "Message-ID": "<orig@gmail.com>" }),
    raw: new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("From: scammer@evil.test\r\n\r\nClick here"));
        c.close();
      },
    }),
    async reply(m: unknown) {
      if (overrides.replyThrows) throw new Error("DMARC failure");
      replies.push(m);
    },
    replies,
  };
}

/** Capture console output without letting it print during the run. */
let logs: { level: string; text: string }[] = [];
let restore: (() => void) | undefined;

before(() => {
  const warn = console.warn;
  const error = console.error;
  console.warn = (...a: unknown[]) => logs.push({ level: "warn", text: a.join(" ") });
  console.error = (...a: unknown[]) => logs.push({ level: "error", text: a.join(" ") });
  restore = () => {
    console.warn = warn;
    console.error = error;
  };
});

after(() => restore?.());
beforeEach(() => {
  logs = [];
});

function stubFetch(responder: (url: string, init: RequestInit) => Response) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) =>
    responder(String(url), init ?? {})) as typeof fetch;
}

test("a 401 from the webhook is reported, not mistaken for a declined reply", async () => {
  // The regression this file exists for. Before, `res.json()` parsed the error
  // body, `data.reply` was undefined, and the handler took the same silent
  // return the API uses when it declines on purpose.
  stubFetch(() => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }));

  const msg = fakeMessage();
  await handler.email(msg as never, ENV);

  const errors = logs.filter((l) => l.level === "error");
  assert.equal(errors.length, 1, "a 401 must be logged as an error");
  assert.match(errors[0].text, /401/);
  // The operator needs to be pointed at the cause, not just the status.
  assert.match(errors[0].text, /INBOUND_SECRET/);
  assert.equal(msg.replies.length, 0, "nothing should be sent on a 401");
});

test("a 403 gets the same secret-mismatch hint as a 401", async () => {
  stubFetch(() => new Response("{}", { status: 403 }));
  await handler.email(fakeMessage() as never, ENV);
  assert.match(logs.find((l) => l.level === "error")!.text, /INBOUND_SECRET/);
});

test("a 500 is reported as an error but without the secret hint", async () => {
  // Misattributing a server fault to a secret mismatch would send someone
  // rotating credentials to fix an unrelated outage.
  stubFetch(() => new Response("{}", { status: 500 }));
  await handler.email(fakeMessage() as never, ENV);
  const err = logs.find((l) => l.level === "error")!;
  assert.match(err.text, /500/);
  assert.doesNotMatch(err.text, /INBOUND_SECRET/);
});

test("an unreachable webhook is reported", async () => {
  stubFetch(() => {
    throw new Error("network down");
  });
  await handler.email(fakeMessage() as never, ENV);
  assert.match(logs.find((l) => l.level === "error")!.text, /unreachable/i);
});

test("a deliberate API skip is logged with its reason, not as an error", async () => {
  // This path is working as intended — rate limiting is a defence, not a fault
  // — so it must stay distinguishable from the failures above.
  stubFetch(() => new Response(JSON.stringify({ ok: true, skip: "rate-limited" }), { status: 200 }));
  await handler.email(fakeMessage() as never, ENV);

  assert.equal(logs.filter((l) => l.level === "error").length, 0, "a skip is not an error");
  assert.match(logs.find((l) => l.level === "warn")!.text, /rate-limited/);
});

test("a successful verdict replies and logs nothing", async () => {
  // The quiet path must stay quiet, or the noise makes the signals above
  // useless.
  stubFetch((url, init) => {
    const body = JSON.parse(String(init.body));
    // The confirmation POST carries `delivered` and no `raw`; the analysis POST
    // is the one with the message in it.
    if (body.delivered) return new Response("{}", { status: 200 });
    return new Response(
      JSON.stringify({
        ok: true,
        reply: { subject: "Scam alert", text: "This looks like a scam.", html: "<p>scam</p>" },
      }),
      { status: 200 },
    );
  });

  const msg = fakeMessage();
  await handler.email(msg as never, ENV);

  assert.equal(msg.replies.length, 1, "a verdict should be replied to the forwarder");
  assert.deepEqual(logs, [], "a healthy forward should log nothing");
});

test("a reply rejected by Cloudflare is reported and not counted", async () => {
  // Cloudflare refuses reply() when the incoming forward failed DMARC. No one
  // received a verdict, so this must not reach the delivery confirmation.
  let confirmed = false;
  stubFetch((_url, init) => {
    const body = JSON.parse(String(init.body));
    if (body.delivered) {
      confirmed = true;
      return new Response("{}", { status: 200 });
    }
    return new Response(
      JSON.stringify({
        ok: true,
        reply: { subject: "s", text: "t", html: "<p>h</p>" },
      }),
      { status: 200 },
    );
  });

  await handler.email(fakeMessage({ replyThrows: true }) as never, ENV);

  assert.match(logs.find((l) => l.level === "warn")!.text, /reply rejected/i);
  assert.equal(confirmed, false, "a rejected reply must not be counted as delivered");
});

test("an oversized forward is reported rather than dropped in silence", async () => {
  stubFetch(() => new Response("{}", { status: 200 }));
  const msg = {
    ...fakeMessage(),
    raw: new ReadableStream({
      start(c) {
        // Comfortably past MAX_RAW_BYTES (1 MB).
        c.enqueue(new Uint8Array(1_000_001));
        c.close();
      },
    }),
  };
  await handler.email(msg as never, ENV);
  assert.match(logs.find((l) => l.level === "warn")!.text, /unreadable or over/i);
});
