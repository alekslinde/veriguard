import { describe, it, expect } from "vitest";
import { analyzeContent } from "@veriguard/engine/scamDetector";

// Scam SMS routinely omits the scheme — "Login at commbank-secure-login.tk/auth".
// URL_GLOBAL requires http(s)://, so those produced no URL card at all and the
// link went unanalysed. detectType already treated a leading "www." as a URL,
// so the same host scored 85 with the prefix and 0 without it.
//
// The risk in fixing this is false positives: "report.docx", "README.md" and
// "node.js" all look like hostnames. A missed scam URL still gets message-level
// analysis; a false positive puts a scary URL card on an innocent message, so
// these tests weight heavily toward the negative cases.

async function urlCards(text: string) {
  return (await analyzeContent(text)).filter((c) => c.kind === "url");
}

describe("schemeless scam hostnames are analysed", () => {
  it("scores a bare host on an abuse-prone TLD", async () => {
    const cards = await urlCards("commbank-secure-login.tk");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.score).toBeGreaterThan(50);
  });

  it("scores a bare host with a path", async () => {
    const cards = await urlCards("commbank-secure-login.tk/auth");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.score).toBeGreaterThan(50);
  });

  it("finds a schemeless host embedded in a message", async () => {
    // The realistic shape of a scam SMS.
    const cards = await urlCards("Your parcel is held. Pay now at auspost-redelivery.tk/fee");
    expect(cards).toHaveLength(1);
    // The abuse-prone TLD alone is worth flagging; the score depends on which
    // other rules the host trips, so assert it is not the silent 0 it used to be.
    expect(cards[0].result.score).toBeGreaterThan(0);
    expect(cards[0].result.verdict).not.toBe("safe");
  });

  it("gives the same verdict with or without a www. prefix", async () => {
    // The inconsistency that motivated this: www. was already treated as a URL.
    const withWww = await urlCards("www.commbank-secure-login.tk/auth");
    const without = await urlCards("commbank-secure-login.tk/auth");
    expect(without[0].result.score).toBe(withWww[0].result.score);
  });

  it("still analyses a legitimate host when it carries a path", async () => {
    const cards = await urlCards("auspost.com.au/track");
    expect(cards).toHaveLength(1);
    expect(cards[0].result.verdict).toBe("safe");
  });
});

describe("ordinary text does not become a URL card", () => {
  // Each of these would raise a spurious "URL" result for a user who is not
  // reporting a link at all.
  const innocuous = [
    "Send me the report.docx when you can",
    "It's in README.md at the top",
    "We use node.js and vue.js here",
    "The archive.zip is on the drive",
    "Please review invoice.mov before Friday",
    "My file is C:\\Users\\me\\docs.pdf",
    "Reply to sales@auspost.com.au please",
    "Contact: 1.800.555.0199",
    "Mr. Smith went home",
    "e.g. this and i.e. that",
    "version 2.0 released today",
    "Send me the notes.org file",
    "Our teams are dev.io and ops.io",
    "the domain is example.com",
  ];

  for (const text of innocuous) {
    it(`produces no URL card for: ${text.slice(0, 40)}`, async () => {
      expect(await urlCards(text)).toHaveLength(0);
    });
  }
});

describe("bare-host extraction does not disturb scheme'd URLs", () => {
  it("does not double-count a URL that already has a scheme", async () => {
    const cards = await urlCards("Track at https://auspost.com.au/track");
    expect(cards).toHaveLength(1);
  });

  it("does not double-count a defanged URL once refanged", async () => {
    const cards = await urlCards("Someone sent hxxps://commbank-secure-login[.]tk/auth");
    expect(cards).toHaveLength(1);
  });

  it("handles a scheme'd and a bare host in one message", async () => {
    const cards = await urlCards("First https://real-site.com/a then evil-second.tk/b");
    expect(cards).toHaveLength(2);
  });
});

// A missing space after a full stop synthesises a hostname from two unrelated
// sentences — "i finished early.live music starts at 8". Two guards already
// existed for this and each saw only the two labels either side of the dot: a
// capitalisation tell on the right (blind to a lowercase new sentence) and a
// closed word list on the left (which cannot hold every word a sentence can end
// on). Probed 2026-08-29 (share path, findings P4 and P5): 9 of 11 innocent
// phrasings raised a scam card.
//
// The wider signal is what FOLLOWS the host: prose running on past an
// uncorroborated bare host is a sentence continuing, where a real bare host is
// the message payload and ends the clause.
describe("a sentence break is not a hostname", () => {
  // P4 — the capitalisation guard only fired on Capitalised-then-lowercase.
  const lowercaseSentenceStart = [
    "i finished early.live music starts at 8",
    "thanks for lunch.top effort mate",
    "the plumber came by.work is done",
  ];

  // P5 — PROSE_LEFT_LABELS holds function words, but sentences end on content
  // words just as often. None of these left labels are in that list.
  const contentWordOnTheLeft = [
    "sign up here.online registration closes friday",
    "give me a call back.live chat is down",
    "order now.store closes at five",
    "check it out.click for the menu",
    "that is all.work starts monday",
    "sleeping well.online classes resume",
  ];

  // The all-caps case is why this cannot be fixed by widening the
  // capitalisation test: scam SMS shout, so an all-uppercase label must still
  // be allowed to be a host.
  const shouting = ["SEE YOU AT THE SHOP.ONLINE ORDERS ARE OPEN"];

  // The left guard only ran on two-label hosts, so a subdomain-shaped prose
  // match walked past it.
  const threeLabels = ["ask at the front desk.work is ongoing"];

  for (const text of [
    ...lowercaseSentenceStart,
    ...contentWordOnTheLeft,
    ...shouting,
    ...threeLabels,
  ]) {
    it(`produces no URL card for: ${text.slice(0, 44)}`, async () => {
      expect(await urlCards(text)).toHaveLength(0);
    });

    it(`raises no URL flag for: ${text.slice(0, 44)}`, async () => {
      // The card going away is only half of it: the phantom host must not
      // survive as a flag on the message result either.
      //
      // Asserting the whole verdict is `safe` would be the wrong test, and
      // asserting it was how this was first written. "give me a call back.live
      // chat is down" scores 20/suspicious on an unrelated rule — "call back"
      // trips the call-a-number heuristic with or without the dot, so the
      // stricter assertion failed for a reason this fix neither caused nor
      // should paper over. Scope the assertion to what the guard actually
      // claims: no URL reached the verdict.
      const [top] = await analyzeContent(text);
      for (const flag of top?.result.flags ?? []) {
        expect(flag.toLowerCase()).not.toContain("url");
        expect(flag.toLowerCase()).not.toContain("domain");
        expect(flag.toLowerCase()).not.toContain("link");
      }
    });
  }
});

describe("the sentence-break guard is not a bypass", () => {
  // The guard suppresses the URL CARD ONLY; the text still reaches
  // message-level scoring. That is what stops "append a word to go quiet" from
  // being a cheap evasion — the attacker loses the card but keeps every
  // urgency and call-to-action rule pointed at them.
  it("still flags an abuse-prone host evaded by a trailing word", async () => {
    const text = "claim now at freemoney.tk urgently";
    expect(await urlCards(text)).toHaveLength(0);
    const [top] = await analyzeContent(text);
    expect(top.result.verdict).not.toBe("safe");
  });

  it("still flags a realistic scam using a bare dictionary-word host", async () => {
    const text = "Your myGov account is suspended, verify at login.click now";
    const [top] = await analyzeContent(text);
    expect(top.result.verdict).not.toBe("safe");
  });

  // Everything below must keep its card: each carries a marker that a host was
  // meant, so none can be read as a sentence running on.
  it("keeps a host whose left label is hyphenated", async () => {
    // "secure-billing" cannot be a word ending a sentence.
    const cards = await urlCards("Pay at secure-billing.top now");
    expect(cards).toHaveLength(1);
  });

  it("keeps a hyphenated host mid-sentence", async () => {
    const cards = await urlCards("Your account is locked mygov-verify.tk please act");
    expect(cards).toHaveLength(1);
  });

  it("keeps a host that ends the message", async () => {
    // No prose follows, so the guard must not engage.
    const cards = await urlCards("Pay at secure-billing.top");
    expect(cards).toHaveLength(1);
  });

  it("keeps a host with a path even when prose follows", async () => {
    const cards = await urlCards("AUSPOST-TRACK.SHOP/verify your parcel");
    expect(cards).toHaveLength(1);
  });

  it("keeps a plain-word host with a path even when prose follows", async () => {
    // The case above is carried by its hyphen, so it passes whether or not the
    // guard checks for a path — mutation-testing the `!match[2]` clause showed
    // it survived with the suite green. This is the test that pins it: every
    // other suppression condition is met (two labels, plain word on the left,
    // prose following), so only the path keeps the card.
    const cards = await urlCards("Pay the fee at shop.top/verify now");
    expect(cards).toHaveLength(1);
  });

  it("keeps a www. host even when prose follows", async () => {
    const cards = await urlCards("go to www.evil.work now");
    expect(cards).toHaveLength(1);
  });

  it("keeps a two-label www. host even when prose follows", async () => {
    // The www. clause looks redundant beside the two-label restriction, since
    // "www.shop.top" is three labels and excluded by that alone — which is why
    // removing it left the suite green. It is not redundant: "www.online" is
    // exactly two labels AND carries the prefix, so this is the only shape
    // where the clause decides. A bare "www.online" is a mistyped host, never
    // a sentence running on.
    const cards = await urlCards("go to www.online now");
    expect(cards).toHaveLength(1);
  });

  it("keeps a subdomained plain-word host when prose follows", async () => {
    // Three labels: "login.shop.top" is host structure, not a sentence. The
    // two-label restriction is what keeps this, and it likewise survived
    // removal until this test existed.
    const cards = await urlCards("Verify at login.shop.top now");
    expect(cards).toHaveLength(1);
  });

  it("keeps a host followed by punctuation rather than prose", async () => {
    // A comma is not a sentence carrying on.
    const cards = await urlCards("Pay at freemoney.tk, then reply");
    expect(cards).toHaveLength(1);
  });
});
