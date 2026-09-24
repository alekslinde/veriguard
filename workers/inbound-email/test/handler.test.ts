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
function fakeMessage(
  overrides: {
    replyThrows?: boolean;
    references?: string;
    authResults?: string[];
    arcResults?: string[];
    envelope?: Record<string, string>;
  } = {},
) {
  const replies: unknown[] = [];
  return {
    from: "forwarder@gmail.com",
    to: "check@veriguard.app",
    headers: (() => {
      const h = new Headers({
        "Message-ID": "<orig@gmail.com>",
        ...(overrides.references ? { References: overrides.references } : {}),
      });
      // Each MTA the mail passed through adds its own header; several of one
      // name join into a comma-separated value, which is the shape the handler
      // has to read back apart.
      for (const value of overrides.authResults ?? []) {
        h.append("Authentication-Results", value);
      }
      for (const value of overrides.arcResults ?? []) {
        h.append("ARC-Authentication-Results", value);
      }
      for (const [k, v] of Object.entries(overrides.envelope ?? {})) h.set(k, v);
      return h;
    })(),
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

// `logs` holds only the levels that report a fault, so the assertions below can
// keep saying "a healthy forward logs nothing" about warnings and errors. Plain
// console.log is routine diagnostic output that every forward emits, so it is
// captured apart from them rather than counted as noise.
let infoLogs: string[] = [];

before(() => {
  const log = console.log;
  const warn = console.warn;
  const error = console.error;
  console.log = (...a: unknown[]) => infoLogs.push(a.join(" "));
  console.warn = (...a: unknown[]) => logs.push({ level: "warn", text: a.join(" ") });
  console.error = (...a: unknown[]) => logs.push({ level: "error", text: a.join(" ") });
  restore = () => {
    console.log = log;
    console.warn = warn;
    console.error = error;
  };
});

after(() => restore?.());
beforeEach(() => {
  logs = [];
  infoLogs = [];
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

  const warned = logs.find((l) => l.level === "warn")!.text;
  assert.match(warned, /reply refused/i);
  // The platform's own wording has to survive: it distinguishes a DMARC
  // failure from "not repliable" from a spent reply limit, and naming one of
  // those ourselves sent an earlier investigation after the wrong cause.
  assert.match(warned, /DMARC failure/);
  // Of the conditions behind a refusal, the chain length is the one this side
  // can measure, so the refusal carries it: a count here is only meaningful
  // against counts from forwards that succeeded, and both come from this line.
  assert.match(warned, /References entries: \d+/);
  assert.equal(confirmed, false, "a rejected reply must not be counted as delivered");
});

test("every forward logs its inbound References count, refused or not", async () => {
  // A refusal names no cause, so the count is diagnosable only by comparison
  // with forwards that worked — which means logging it before knowing which
  // this one is.
  stubFetch((_url, init) => {
    if (JSON.parse(String(init.body)).delivered) return new Response("{}", { status: 200 });
    return new Response(
      JSON.stringify({ ok: true, reply: { subject: "s", text: "t", html: "<p>h</p>" } }),
      { status: 200 },
    );
  });

  await handler.email(fakeMessage({ references: "<a@x.test> <b@x.test> <c@x.test>" }) as never, ENV);

  assert.ok(
    infoLogs.some((l) => /References entries: 3/.test(l)),
    "a successful forward should still record its chain length",
  );
});

test("the References count does not put correspondents' message IDs in the log", async () => {
  // The chain names who a thread passed through. A count answers the question
  // the log exists for; the IDs themselves would be someone else's mail.
  stubFetch((_url, init) => {
    if (JSON.parse(String(init.body)).delivered) return new Response("{}", { status: 200 });
    return new Response(
      JSON.stringify({ ok: true, reply: { subject: "s", text: "t", html: "<p>h</p>" } }),
      { status: 200 },
    );
  });

  await handler.email(fakeMessage({ references: "<private@correspondent.test>" }) as never, ENV);

  assert.ok(
    [...infoLogs, ...logs.map((l) => l.text)].every((l) => !l.includes("correspondent.test")),
    "message IDs must not be logged",
  );
});

test("a forward with no References header counts zero rather than failing", async () => {
  stubFetch((_url, init) => {
    if (JSON.parse(String(init.body)).delivered) return new Response("{}", { status: 200 });
    return new Response(
      JSON.stringify({ ok: true, reply: { subject: "s", text: "t", html: "<p>h</p>" } }),
      { status: 200 },
    );
  });

  await handler.email(fakeMessage() as never, ENV);

  assert.ok(infoLogs.some((l) => /References entries: 0/.test(l)));
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

// A reply is refused unless the incoming forward has a valid DMARC result, and
// the refusal names no cause. The verdict the receiving MTA recorded is the one
// thing a log can say about that condition — but the header it comes from also
// names the sending host and envelope addresses, which belong to whoever the
// forward passed through and answer nothing a verdict does not.

const okReply = (_url: string, init: RequestInit) => {
  if (JSON.parse(String(init.body)).delivered) return new Response("{}", { status: 200 });
  return new Response(
    JSON.stringify({ ok: true, reply: { subject: "s", text: "t", html: "<p>h</p>" } }),
    { status: 200 },
  );
};

test("groups each MTA's verdicts separately", async () => {
  // The live shape: a forwarded scam email. The forwarder's own send passes,
  // and the original it quotes has no policy at all. Flattened into one list
  // these read as a contradiction ("dmarc=pass dmarc=none"); grouped, they say
  // which identity each belongs to, which is the whole diagnostic value.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      authResults: [
        "mx.cloudflare.net; dkim=pass header.d=gmail.com; spf=pass; dmarc=pass header.from=gmail.com",
        "mx.google.com; spf=none; dmarc=none header.from=scammer.test",
      ],
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.match(line, /\[[^\]]*dmarc=pass[^\]]*\]/, "the forwarder's own send is one set");
  assert.match(line, /\[[^\]]*dmarc=none[^\]]*\]/, "the forwarded original is another");
});

test("records a single set for an ordinary direct send", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ authResults: ["mx.cloudflare.net; dmarc=pass header.from=gmail.com; spf=pass"] }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.match(line, /\[receiver: dmarc=pass spf=pass\]/);
  assert.equal((line.match(/\[/g) ?? []).length, 1, "one identity, one set");
});

test("records failing verdicts, which is what a refusal is read against", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ authResults: ["mx.cloudflare.net; dmarc=fail; spf=softfail"] }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.match(line, /dmarc=fail/);
  assert.match(line, /spf=softfail/);
});

test("a comma inside a quoted value does not invent a second identity", async () => {
  // A DKIM signature value may contain a comma. Splitting on it naively would
  // report two identities where the message carries one — and the count of
  // identities is exactly what is being read here.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      authResults: ['mx.cloudflare.net; dkim=pass header.d=gmail.com header.b="ab,cd"; dmarc=pass'],
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.equal((line.match(/\[/g) ?? []).length, 1, "one header is one set, commas and all");
});

test("labels which set the receiving platform wrote", async () => {
  // A reply is refused on the platform's own DMARC verdict, and a forward
  // carries sets from several servers. The label is what says which one to
  // read.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      authResults: [
        "mx.cloudflare.net; dmarc=fail header.from=gmail.com",
        "mx.google.com; dkim=pass; dmarc=pass",
      ],
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.match(line, /\[receiver: dmarc=fail\]/);
  assert.match(line, /\[other: dkim=pass dmarc=pass\]/);
});

test("reads the writer of an ARC set past its instance number", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      arcResults: [
        "i=2; mx.cloudflare.net; dmarc=pass; spf=none",
        "i=1; mx.google.com; dkim=pass",
      ],
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /auth:/.test(l))!;
  assert.match(line, /\[arc receiver: dmarc=pass spf=none\]/);
  assert.match(line, /\[arc other: dkim=pass\]/);
});

test("names no server except the platform's", async () => {
  // Another set's server is often the forwarder's own mail host, which says
  // who they are and answers nothing about the refusal.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ authResults: ["mail.private-employer.test; dmarc=pass"] }) as never,
    ENV,
  );
  const everything = [...infoLogs, ...logs.map((l) => l.text)].join(" ");
  assert.ok(!everything.includes("private-employer"), "a server name was logged");
  assert.match(everything, /\[other: dmarc=pass\]/);
});

test("says so plainly when no verdict was recorded", async () => {
  // Distinguishable from "recorded, and it passed" — the absence is itself a
  // finding when a forward is refused.
  stubFetch(okReply);
  await handler.email(fakeMessage() as never, ENV);
  assert.ok(infoLogs.some((l) => /auth: none recorded/.test(l)));
});

test("keeps the correspondent's host and addresses out of the log", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      authResults: [
        "mx.cloudflare.net; dmarc=pass header.from=example.test; " +
          "spf=pass smtp.mailfrom=someone@private.test; dkim=pass header.d=private.test",
      ],
    }) as never,
    ENV,
  );
  const everything = [...infoLogs, ...logs.map((l) => l.text)].join(" ");
  assert.ok(!everything.includes("private.test"), "signature and envelope domains must not be logged");
  assert.ok(!everything.includes("someone@"), "envelope addresses must not be logged");
  assert.match(everything, /dmarc=pass/);
});

test("a refusal carries both measured conditions", async () => {
  // The refusal is only readable against the same figures from forwards that
  // succeeded, so it has to carry them itself.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ replyThrows: true, authResults: ["mx.cloudflare.net; dmarc=fail"] }) as never,
    ENV,
  );
  const warned = logs.find((l) => l.level === "warn")!.text;
  assert.match(warned, /References entries: \d+/);
  assert.match(warned, /auth: .*dmarc=fail/);
});

// Two accounts are answered on every forward and two are refused on every
// forward, whatever they send — and content, size, chain length and
// authentication have each been ruled out by coming back identical on both
// sides. The envelope is where a difference between two plain accounts can
// still hide, so its shape is recorded. Shape only: the addresses themselves
// would put the forwarder's correspondents in a log to answer a question about
// our own configuration.

test("records the envelope's shape on every forward", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      envelope: { From: "Anna <forwarder@gmail.com>", "Return-Path": "<forwarder@gmail.com>" },
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /envelope:/.test(l))!;
  assert.match(line, /from=name\+addr/);
  assert.match(line, /envelope=matches-from/);
  assert.match(line, /replyto=absent/);
});

test("distinguishes the shapes that could differ between two accounts", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      envelope: {
        From: "forwarder@gmail.com",
        "Reply-To": "somewhere@else.test",
        "Return-Path": "<bounce@relay.test>",
        Sender: "list@group.test",
      },
    }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /envelope:/.test(l))!;
  assert.match(line, /from=addr-only/);
  assert.match(line, /replyto=differs/);
  assert.match(line, /envelope=differs-from/);
  assert.match(line, /sender-hdr=present/);
});

test("the envelope shape carries no addresses", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({
      envelope: {
        From: "Someone <private@correspondent.test>",
        "Reply-To": "secret@elsewhere.test",
        "Return-Path": "<bounce@relay.test>",
        Sender: "list@group.test",
      },
    }) as never,
    ENV,
  );
  const everything = [...infoLogs, ...logs.map((l) => l.text)].join(" ");
  for (const leak of ["correspondent.test", "elsewhere.test", "relay.test", "group.test", "private@", "secret@"]) {
    assert.ok(!everything.includes(leak), `${leak} must not appear in any log line`);
  }
  assert.match(everything, /envelope: from=/);
});

test("a refusal carries the envelope shape too", async () => {
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ replyThrows: true, envelope: { From: "forwarder@gmail.com" } }) as never,
    ENV,
  );
  const warned = logs.find((l) => l.level === "warn")!.text;
  assert.match(warned, /envelope: from=addr-only/);
});

test("a forward with no envelope headers reports them absent, not missing", async () => {
  // Distinguishable from "present and matching" — an absence is itself a
  // difference when two accounts are being compared.
  stubFetch(okReply);
  await handler.email(fakeMessage() as never, ENV);
  const line = infoLogs.find((l) => /envelope:/.test(l))!;
  assert.match(line, /from=absent/);
  assert.match(line, /envelope=absent/);
  assert.match(line, /sender-hdr=absent/);
});

test("a header packed with angle brackets is parsed without degrading", async () => {
  // These headers are attacker-controlled — anyone can send mail with a 100KB
  // From line. The first version of this parser used `.replace(/^.*</, "")`,
  // which CodeQL flagged as a polynomial ReDoS before it ever shipped.
  //
  // This test does NOT reproduce the exploit: the engine optimises that pattern
  // well enough that the old code passes too, and a timing assertion tuned
  // finely enough to catch it would be flaky on shared CI. It guards the
  // property that matters — hostile input is handled in bounded time — and the
  // reason the regex is gone is the static finding, not this measurement.
  stubFetch(okReply);
  const evil = "<".repeat(50_000) + ">".repeat(50_000);

  const started = Date.now();
  await handler.email(
    fakeMessage({ envelope: { From: evil, "Reply-To": evil, "Return-Path": evil } }) as never,
    ENV,
  );
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 1000, `parsing must not degrade on hostile input (took ${elapsed}ms)`);
  assert.ok(infoLogs.some((l) => /envelope: from=/.test(l)), "and must still produce a shape");
});

test("an address with no closing bracket is still read", async () => {
  // Malformed input must not silently become the whole header, which would put
  // the raw value into a comparison and defeat the point of reporting a shape.
  stubFetch(okReply);
  await handler.email(
    fakeMessage({ envelope: { From: "Name <forwarder@gmail.com", "Return-Path": "<forwarder@gmail.com>" } }) as never,
    ENV,
  );
  const line = infoLogs.find((l) => /envelope:/.test(l))!;
  assert.match(line, /envelope=matches-from/, "an unterminated bracket still yields the address");
});
