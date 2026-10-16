// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Benign SMS corpus for the callback-SMS composite proposed in
 * docs/threat-intel/2026-10-16-threat-roadmap.md (D1, issue #463).
 *
 * The scam shape is: assert a transaction, invite the reader to disown it,
 * give a phone number to call. Every condition on its own is ordinary —
 * receipts state transactions, helplines give numbers, genuine fraud alerts
 * ask "was this you?" — so the composite's false-positive risk lives
 * entirely in how often real bank, retailer and utility SMS clear all four
 * conditions at once. This corpus exists to measure that, not assume it.
 *
 * Each fixture stands for a message SHAPE a real sender uses, not a
 * transcription of one. No real phone number, account or brand's exact
 * wording is reproduced; every number here is a placeholder in a reserved
 * range and every amount is invented.
 */

export interface CallbackSmsFixture {
  /** Stable id used in test names and failure output. */
  id: string;
  /** What real-world message type this stands for, in one line. */
  shape: string;
  text: string;
  region: string;
}

export const BENIGN_CALLBACK_SMS: CallbackSmsFixture[] = [
  {
    id: "au-fraud-alert-yes-no",
    shape:
      "AU bank real-time fraud alert asking for a YES/NO reply, not a call. " +
      "The genuine anti-fraud UX this composite must not penalise.",
    text:
      "CommBank: We've blocked a $430.00 transaction at OVERSEAS ELECTRONICS as it looked unusual. " +
      "Reply YES if this was you, or NO if it wasn't. Do not share this code with anyone.",
    region: "AU",
  },
  {
    id: "au-card-back-number",
    shape:
      "AU bank directing the reader to the number on their own card, the " +
      "standard safe-callback pattern the composite is meant to exempt.",
    text:
      "ANZ: A new payee was added to your account today. If this wasn't you, call the number on the back of your card immediately.",
    region: "AU",
  },
  {
    id: "au-paid-bill-receipt",
    shape: "AU utility bill payment receipt with no disown clause at all.",
    text: "AGL: Thanks, we've received your payment of $142.30 for account 9988776. Your next bill is due 14 Nov.",
    region: "AU",
  },
  {
    id: "au-genuine-direct-debit-setup",
    shape:
      "AU genuine direct-debit confirmation. States a transaction and gives a " +
      "number, but for billing queries, not to cancel or dispute.",
    text:
      "Telstra: Your direct debit of $89.00 is set up and will be deducted on 3 Nov. " +
      "Questions about your bill? Call 13 22 00.",
    region: "AU",
  },
  {
    id: "au-clinic-receipt",
    shape: "AU medical clinic appointment/payment receipt, no call-to-action at all.",
    text: "Bulk Bill Medical Centre: Your consultation fee of $85.00 has been processed. A receipt has been emailed to you.",
    region: "AU",
  },
  {
    id: "au-no-action-needed",
    shape: "AU parcel/delivery notice that explicitly says no action is needed.",
    text: "Australia Post: Your parcel will be collected from your local Post Office. No action needed — we'll text you when it's ready.",
    region: "AU",
  },
  {
    id: "gb-direct-debit-confirmation-octopus-energy",
    shape:
      "GB genuine recurring direct-debit confirmation from Octopus Energy, a " +
      "named GB_BRAND_MENTIONS entry. Known false-positive lead from the " +
      "2026-10-16 roadmap watchlist: this already scores under the existing " +
      "rules via brand mention plus the generic call-a-number rule, before " +
      "any composite is added.",
    text: "Your direct debit has been set up with Octopus Energy for £64.00 a month. Any questions call us on 0808 164 1088.",
    region: "GB",
  },
  {
    id: "gb-card-back-number",
    shape: "GB bank directing the reader to the number on their own card.",
    text: "Barclays: We noticed an unusual login to your account. If this wasn't you, call the number on the back of your card.",
    region: "GB",
  },
  {
    id: "gb-parcel-no-action",
    shape: "GB courier delivery notice, no transaction and no call-to-action.",
    text: "Royal Mail: Your parcel is out for delivery today between 9am-1pm. No action needed.",
    region: "GB",
  },
  {
    id: "ie-genuine-direct-debit-setup",
    shape: "IE genuine direct-debit confirmation with a billing-queries number.",
    text: "Electric Ireland: Your direct debit of €58.00 is confirmed for 5 Nov. Billing queries: call 1850 372 372.",
    region: "IE",
  },
  {
    id: "us-fraud-alert-yes-no",
    shape: "US bank real-time fraud alert asking for a YES/NO reply.",
    text:
      "Chase Fraud Alert: $512.00 at ELECTRONICS OUTLET. Reply YES if you made this transaction, NO if you did not.",
    region: "US",
  },
  {
    id: "us-card-back-number",
    shape: "US bank directing the reader to the number on their own card.",
    text: "Wells Fargo: Unusual activity detected on your card. If this wasn't you, call the number on the back of your card.",
    region: "US",
  },
  {
    id: "us-order-shipped-no-callback",
    shape: "US retailer shipping confirmation with a transaction but no disown clause or phone number.",
    text: "Your order #AB-99231 for $64.99 has shipped and will arrive by Thursday. Track it in the app.",
    region: "US",
  },
];

/**
 * A scam lure sharing the Octopus/GB fixture's surface furniture (a stated
 * amount, a phone number, "call us") but adding the fourth condition that
 * should separate it: an explicit disown clause with no protective wording.
 * Kept here, not in the scam corpus, because it is the direct minimal-pair
 * control for "gb-direct-debit-confirmation-octopus-energy" above.
 */
export const CALLBACK_SMS_LURE_MINIMAL_PAIR: CallbackSmsFixture = {
  id: "gb-direct-debit-lure-minimal-pair",
  shape:
    "Same surface as the Octopus Energy fixture — stated amount, 'call us', " +
    "energy-supplier framing — plus an explicit disown clause the genuine " +
    "confirmation does not carry.",
  text:
    "Octopus Energy: A new direct debit of £64.00 has been set up on your account. " +
    "If you did not authorise this, call us on 0808 164 1088 to cancel.",
  region: "GB",
};

/**
 * NOT benign — a documented, accepted residual false-positive the #463
 * roadmap names explicitly rather than excludes: "a small business texting
 * 'payment processed — if this wasn't you call us on 03 …'. That lands at
 * suspicious 30, not likely_scam." Kept separate from BENIGN_CALLBACK_SMS so
 * the "no genuine message scores above suspicious" assertion does not have to
 * carve out an exception for a case the issue itself says should fire.
 *
 * Not the only one. A post-implementation code review found the same class
 * reproduces on an Origin Energy utility receipt, a Netflix subscription
 * renewal, and a Fitness First membership debit — any genuine "X has been
 * charged/debited. If you did not authorise this, call [number] to cancel"
 * message. No text-only signal distinguishes these from a real scam using
 * the identical template; see the "documented residual risk" describe block
 * in callbackSmsBenignCorpus.test.ts for all four, asserted together.
 */
export const CALLBACK_SMS_ACCEPTED_RESIDUAL_RISK: CallbackSmsFixture = {
  id: "au-small-business-payment-processed",
  shape:
    "The residual AU false-positive class the issue itself names: a small " +
    "trader confirming a payment with a genuine callback number. Scored on " +
    "purpose, not excluded — see #463.",
  text: "Riverside Plumbing: Payment of $220.00 processed for invoice #4471. If this wasn't you call us on 03 9555 0123.",
  region: "AU",
};
