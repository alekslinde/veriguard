/**
 * Structural fixtures for legitimate bulk mail.
 *
 * WHY THESE ARE SYNTHETIC. They were derived by measuring real marketing mail
 * against the engine, but no real message is kept. A real one carries the
 * recipient's address in several encodings at once — VERP bounce paths,
 * ESP subscriber tokens, click-tracking parameters, feedback identifiers —
 * and committing one would publish both the reader's subscriptions and a named
 * brand's mail alongside whatever verdict we gave it. Neither belongs in a
 * public repository, and "strip the addresses" would not be enough: the tokens
 * are the leak, and they are designed to be opaque.
 *
 * What is reproduced is the SHAPE, because the shape is what the engine reads
 * and where the defects live: which authentication sets arrive, how a bounce
 * domain relates to the From domain, whether the only link in the message is
 * its own unsubscribe URL. Every domain here is under .test (RFC 2606), every
 * token is invented, and no real brand is named.
 *
 * Each fixture stands for a topology observed across five independent sending
 * platforms, not for any one sender. The test that consumes them asserts they
 * still reproduce the behaviour they were built for — a fixture abstracted past
 * the point of triggering its own case is decoration, and would let the defect
 * back in silently.
 */

export interface BulkFixture {
  /** Stable id used in test names and failure output. */
  id: string;
  /** What topology this stands for, in one line. */
  shape: string;
  raw: string;
}

/**
 * The authentication block a mainstream provider writes for bulk mail that
 * passes everything: the sending domain's own DKIM signature, the platform's
 * signature, SPF on the bounce path, and DMARC on the header From.
 *
 * Two dkim= results in one header is normal here and not a finding — the
 * sender signs, and so does the platform relaying for them.
 */
const authPass = (fromDomain: string, bounceDomain: string, policy: "REJECT" | "NONE") =>
  `Authentication-Results: mx.receiver.test; dkim=pass header.i=@${fromDomain} header.s=s1; ` +
  `dkim=pass header.i=@platform.example-esp.test header.s=p1; ` +
  `spf=pass (receiver.test: domain of bounce@${bounceDomain} designates 203.0.113.10 as permitted sender) ` +
  `smtp.mailfrom=bounce@${bounceDomain}; ` +
  `dmarc=pass (p=${policy} sp=${policy} dis=NONE) header.from=${fromDomain}`;

export const BULK_FIXTURES: BulkFixture[] = [
  {
    id: "retailer-verp-bounce-subdomain",
    shape:
      "Large retailer via a platform ESP. The bounce path is a different " +
      "subdomain from the From domain and encodes the recipient into its local " +
      "part (VERP), which is how most platforms route bounces.",
    raw: [
      `Delivered-To: reader@mailbox.test`,
      authPass("mail.example-retail.test", "bounce.example-retail.test", "REJECT"),
      `Return-Path: <bounces+1a2b3c-subscriber=mailbox.test@bounce.example-retail.test>`,
      `From: Example Retail <news@mail.example-retail.test>`,
      `To: reader@mailbox.test`,
      `Subject: Mid Season Sale starts now`,
      `Date: Wed, 16 Sep 2026 23:36:10 +0000`,
      `Message-ID: <aaaa1111@mail.example-retail.test>`,
      `List-Unsubscribe: <https://links.example-retail.test/unsub/AbCdEf123>, <mailto:unsub@bounce.example-retail.test>`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `Feedback-ID: campaign:example-esp`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `Up to 40% off selected ranges. Free standard delivery on orders over $100.`,
      ``,
      `Shop Now ( https://links.example-retail.test/c/AbCdEf123456 )`,
      ``,
      `40% OFF luggage.`,
      `25% OFF selected drink bottles.`,
      `SAVE $100 | NOW $999 on a stand mixer.`,
      ``,
      `Want to unsubscribe or change your details? https://links.example-retail.test/unsub/AbCdEf123`,
    ].join("\n"),
  },
  {
    id: "retailer-nav-menu-body",
    shape:
      "Retail body whose navigation menu names shop categories. The category " +
      "words are site furniture, not an instruction to the reader — 'Gift Cards' " +
      "is a department, not a demand for payment in gift cards.",
    raw: [
      `Delivered-To: reader@mailbox.test`,
      authPass("edm.example-store.test", "edm.example-store.test", "REJECT"),
      `Return-Path: <bounce+9z8y7x@edm.example-store.test>`,
      `From: Example Store <noreply@edm.example-store.test>`,
      `To: reader@mailbox.test`,
      `Subject: Shop the lens sale`,
      `Date: Sun, 20 Sep 2026 00:02:45 +0000`,
      `Message-ID: <bbbb2222@edm.example-store.test>`,
      `List-Unsubscribe: <https://links.example-store.test/unsub/Zz99>`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `X-Feedback-Id: campaign:example-esp`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `View in browser ( https://links.example-store.test/c/Zz9900 )`,
      ``,
      `Seconds  Print  Club  Gift Cards`,
      ``,
      `Hi there,`,
      ``,
      `The right lens can transform the way you see the world. Discover great`,
      `savings across selected lenses.`,
      ``,
      `Shop Now ( https://links.example-store.test/c/Zz9901 )`,
      ``,
      `Store Locator  Secure Delivery  Click & Collect  Price Match`,
      ``,
      `This email was sent by Example Store Pty Ltd. All rights reserved.`,
      `To stop receiving marketing emails unsubscribe here.`,
    ].join("\n"),
  },
  {
    id: "small-business-platform-esp",
    shape:
      "Small business sending through a commerce platform. Relaxed DMARC " +
      "policy (p=NONE), and the only link in the plain-text part is the " +
      "message's own unsubscribe URL.",
    raw: [
      `Delivered-To: reader@mailbox.test`,
      authPass("example-roaster.test", "mailer.example-roaster.test", "NONE"),
      `Return-Path: <bounces+4d5e6f-subscriber=mailbox.test@mailer.example-roaster.test>`,
      `From: Example Roaster <orders@example-roaster.test>`,
      `To: reader@mailbox.test`,
      `Subject: Our next release is a washed anaerobic lot from a competition-winning producer`,
      `Date: Wed, 16 Sep 2026 06:03:19 +0000`,
      `Message-ID: <cccc3333@platform.example-esp.test>`,
      `Feedback-Id: s_000000:platform`,
      `List-Unsubscribe: <https://links.example-esp.test/subscriptions/unsubscribe?token=QqRrSs>`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `Precedence: bulk`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `The latest addition to our small-batch series, grown at 1800 metres and`,
      `processed using anaerobic fermentation.`,
      ``,
      `At a height of 1800 metres above sea level, the farm covers 20 hectares.`,
      `Coffee has been grown in the region since the 1950s.`,
      ``,
      `This release is available in 100g tins only. The next roast date is`,
      `Thursday. We will ship orders the same day.`,
      ``,
      `Quantities are limited.`,
      ``,
      `With love, the team`,
    ].join("\n"),
  },
  {
    id: "aligned-domain-sender",
    shape:
      "CONTROL. Same marketing content and vocabulary as the others, but the " +
      "bounce path is on the same domain as the From and carries no VERP " +
      "encoding. This one must score clean: it is what shows the others are " +
      "failing on infrastructure rather than on what they say.",
    raw: [
      `Delivered-To: reader@mailbox.test`,
      authPass("m.example-cycles.test", "m.example-cycles.test", "NONE"),
      `Return-Path: <bo-AAAA-BBBB-CCCC@m.example-cycles.test>`,
      `From: Example Cycles <hello@m.example-cycles.test>`,
      `To: reader@mailbox.test`,
      `Subject: Frenzy Sale on now`,
      `Date: Thu, 17 Sep 2026 21:02:17 +0000`,
      `Message-ID: <dddd4444@m.example-cycles.test>`,
      `Feedback-ID: AAAA:BBBB:20260917:ESP`,
      `List-Unsubscribe: <mailto:listunsubscribe-AAAA@m.example-cycles.test>, <https://m.example-cycles.test/AAAA/uauto.aspx>`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `Reply-To: Example Cycles <re-AAAA@m.example-cycles.test>`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `Up to 40% off our range of bikes and accessories is on now. Don't miss out!`,
      ``,
      `Bikes  Electric Bikes  Accessories  Helmets  Repairs  Stores`,
      ``,
      `Join our club today and receive a $15 voucher*`,
      ``,
      `Kids bikes from $129`,
      `Mountain bikes from $399`,
      `Adult bikes from $299`,
      ``,
      `Want to unsubscribe or change your details? https://m.example-cycles.test/uns/AbCd`,
    ].join("\n"),
  },
  {
    id: "loyalty-reward-vocabulary",
    shape:
      "Loyalty and rewards mail. Uses the vocabulary a prize scam uses — " +
      "'reward', 'bonus', 'free', 'claim' — while being an ordinary points " +
      "statement from a sender that authenticates fully.",
    raw: [
      `Delivered-To: reader@mailbox.test`,
      authPass("rewards.example-group.test", "bounce.example-group.test", "REJECT"),
      `Return-Path: <bounces+7g8h9i-subscriber=mailbox.test@bounce.example-group.test>`,
      `From: Example Rewards <rewards@rewards.example-group.test>`,
      `To: reader@mailbox.test`,
      `Subject: Your points summary`,
      `Date: Mon, 14 Sep 2026 09:00:00 +0000`,
      `Message-ID: <eeee5555@rewards.example-group.test>`,
      `List-Unsubscribe: <https://links.example-group.test/unsub/Pp00>`,
      `List-Unsubscribe-Post: List-Unsubscribe=One-Click`,
      `Feedback-ID: loyalty:example-esp`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      `You have earned 2,000 bonus points this month.`,
      ``,
      `Claim your reward or browse what your points can go towards. Members get`,
      `free delivery on every order.`,
      ``,
      `View your points ( https://links.example-group.test/c/Pp0001 )`,
      ``,
      `Unsubscribe from these emails.`,
    ].join("\n"),
  },
];

/**
 * A scam wearing marketing clothes.
 *
 * The separation case, and the reason none of this can be fixed by simply
 * scoring bulk mail lower. It borrows the furniture — an unsubscribe line, a
 * discount, a brand voice — while doing the things bulk mail does not: an
 * unrelated sending domain with no alignment, no DMARC policy, a deadline, and
 * a demand for card details. A fix that quiets the fixtures above must leave
 * this one loud.
 */
export const MARKETING_LOOKALIKE_SCAM: BulkFixture = {
  id: "scam-imitating-marketing",
  shape: "Scam styled as a promotional email, from an unaligned sender.",
  raw: [
    `Delivered-To: reader@mailbox.test`,
    `Authentication-Results: mx.receiver.test; dkim=none; spf=none; dmarc=none header.from=example-rewards-claim.bond`,
    `Return-Path: <noreply@example-rewards-claim.bond>`,
    `From: Example Rewards <rewards@example-rewards-claim.bond>`,
    `To: reader@mailbox.test`,
    `Subject: You have won a $500 gift card!`,
    `Date: Mon, 14 Sep 2026 09:00:00 +0000`,
    `Message-ID: <ffff6666@example-rewards-claim.bond>`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    `Congratulations! You have won a $500 gift card.`,
    ``,
    `Claim your prize now. Confirm your bank details within 24 hours at`,
    `http://example-rewards-claim.bond/claim or your reward will be returned.`,
    ``,
    `Unsubscribe`,
  ].join("\n"),
};
