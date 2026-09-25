// Tests for the fresh-send gate.
//
// `message.reply()` cannot be aimed at anyone but the forwarder, so nothing it
// does needs guarding. A fresh send has no such property, and this gate is the
// only thing standing between "the platform refused to reply" and "we mailed a
// stranger a verdict on an email they never sent". Every test below is a way
// that could happen.

import { test } from "node:test";
import assert from "node:assert/strict";

import { freshSendAllowed } from "../src/auth.ts";

/** A forward carrying the given Authentication-Results sets. */
function headersWith(sets: string[], arcSets: string[] = []): Headers {
  const h = new Headers();
  for (const s of sets) h.append("Authentication-Results", s);
  for (const s of arcSets) h.append("ARC-Authentication-Results", s);
  return h;
}

const CF = "mx.cloudflare.net";

test("the platform's own DKIM pass for the sender's domain permits a fresh send", () => {
  const h = headersWith([`${CF}; dkim=pass header.d=gmail.com; spf=pass; dmarc=none`]);
  assert.equal(freshSendAllowed(h, "forwarder@gmail.com"), true);
});

test("an ARC set is not evidence, whoever it names", () => {
  // The sender can write an ARC set opening with the platform's name and any
  // instance number, so nothing tells the platform's own apart from a forgery.
  const h = headersWith([], [`i=1; ${CF}; dkim=pass header.d=gmail.com; dmarc=none`]);
  assert.equal(freshSendAllowed(h, "forwarder@gmail.com"), false);
});

test("a signature at the organisational domain covers a subdomain sender", () => {
  const h = headersWith([`${CF}; dkim=pass header.d=example.com`]);
  assert.equal(freshSendAllowed(h, "someone@mail.example.com"), true);
});

test("a signature at a SUBDOMAIN does not vouch for the parent", () => {
  // Otherwise anyone who can create a subdomain — on any shared host — could
  // have us send as though the parent domain had been verified.
  const h = headersWith([`${CF}; dkim=pass header.d=sub.example.com`]);
  assert.equal(freshSendAllowed(h, "someone@example.com"), false);
});

test("a DKIM pass for a DIFFERENT domain than the sender is refused", () => {
  // The forwarder's own mail host signing the hop says nothing about whether
  // this address sent it. This is the spoofing case the gate exists for.
  const h = headersWith([`${CF}; dkim=pass header.d=mailer.example.net; spf=pass`]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("SPF alone is not enough, however clean the rest looks", () => {
  // SPF passes for anyone controlling the connecting host, and the From header
  // is free to write.
  const h = headersWith([`${CF}; spf=pass; dmarc=pass header.from=gmail.com`]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("a DKIM pass claimed by any other server is not evidence", () => {
  // Anyone can put an Authentication-Results header into their own mail. Only
  // the receiving platform's set is trustworthy here.
  const h = headersWith([`mx.google.com; dkim=pass header.d=gmail.com; dmarc=pass`]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("a forged set naming the platform cannot be smuggled in behind the real one", () => {
  // The attacker controls their own headers, so they can name the platform and
  // claim a pass for the very domain they are spoofing. Only the first set —
  // the one the platform prepended — is read, so theirs is never seen.
  const h = headersWith([
    `${CF}; dkim=fail header.d=gmail.com; spf=softfail`,
    `${CF}; dkim=pass header.d=gmail.com; dmarc=pass`,
  ]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("a forged platform set is refused behind any other server's set", () => {
  // The first set must itself be the platform's; a later one naming it is not
  // promoted when the first is someone else's.
  const h = headersWith([
    `mx.google.com; dkim=fail header.d=gmail.com`,
    `${CF}; dkim=pass header.d=gmail.com`,
  ]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("a comma in a parenthesised comment does not split the platform's set", () => {
  const h = headersWith([
    `${CF}; spf=pass (domain of a@gmail.com designates 192.0.2.1, as permitted) smtp.mailfrom=gmail.com; dkim=pass header.d=gmail.com`,
  ]);
  assert.equal(freshSendAllowed(h, "forwarder@gmail.com"), true);
});

test("a failing DKIM for the sender's own domain is refused", () => {
  const h = headersWith([`${CF}; dkim=fail header.d=gmail.com; spf=pass`]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
});

test("a pass is paired with the domain that follows it, not any in the set", () => {
  // A forwarded message routinely carries two signatures. Pairing a pass with
  // the wrong header.d would let a failing signature borrow a passing one's
  // domain — the whole gate, inverted.
  const h = headersWith([
    `${CF}; dkim=fail header.d=gmail.com; dkim=pass header.d=forwarder.test; spf=pass`,
  ]);
  assert.equal(freshSendAllowed(h, "victim@gmail.com"), false);
  assert.equal(freshSendAllowed(h, "someone@forwarder.test"), true);
});

test("a quoted signature value containing a comma does not split the set", () => {
  // The comma inside header.b would otherwise end the set early and invent a
  // second identity — the same hazard the log summary guards against.
  const h = headersWith([
    `${CF}; dkim=pass header.d=gmail.com header.b="ab,cd"; dmarc=none`,
  ]);
  assert.equal(freshSendAllowed(h, "forwarder@gmail.com"), true);
});

test("no verdict from the platform means no fresh send", () => {
  assert.equal(freshSendAllowed(new Headers(), "forwarder@gmail.com"), false);
});

test("an address with no domain is refused", () => {
  const h = headersWith([`${CF}; dkim=pass header.d=gmail.com`]);
  assert.equal(freshSendAllowed(h, "not-an-address"), false);
});

test("case in the header or the address does not change the answer", () => {
  const h = headersWith([`${CF}; DKIM=PASS header.d=GMail.com`]);
  assert.equal(freshSendAllowed(h, "Forwarder@GMAIL.COM"), true);
});

test("a header packed with hostile input is decided in bounded time", () => {
  // These headers are attacker-controlled; anyone can send mail with a 100KB
  // Authentication-Results line. The parse splits on fixed separators and
  // cannot backtrack, and this guards that property rather than a timing.
  const h = headersWith([`${CF}; ` + 'dkim=pass header.d=a.test; '.repeat(20_000)]);
  const started = Date.now();
  const allowed = freshSendAllowed(h, "victim@gmail.com");
  assert.ok(Date.now() - started < 1000, "must not degrade on hostile input");
  assert.equal(allowed, false);
});
