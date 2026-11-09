// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Property-settlement payment redirection, as a value (2026-11-08 roadmap
// ENGINE-D1 / #521).
//
// A criminal with access to a solicitor's or conveyancer's mailbox — or a
// look-alike of it — writes just before settlement to say the trust account
// has changed, and the buyer sends the balance to the criminal. Scamwatch's
// published case study records one AU couple losing $883,093.90 this way; the
// UK Solicitors Regulation Authority issued a near-identical alert on 30
// September 2026, so the rule is region-agnostic and reads its national bank
// identifier (BSB, sort code, routing number) from the pack.
//
// ## Why a new composite, not a wider rental-bond gate
//
// The rental-bond composite in `checkSms` fires on rental context plus ANY
// bank-detail ask. A genuine conveyancer's settlement email has settlement
// context and a BSB and account number as a matter of course, so widening that
// gate to settlement vocabulary would flag every one of them. What separates
// the fraud is the claim that the details CHANGED, so that is a required half
// here, not an optional booster.
//
// ## The three halves, and the guard
//
// 1. Settlement or conveyancing context.
// 2. A claim that the payment account changed — including "moved banks" and
//    "the new BSB", which the engine's generic changed-details row does not
//    recognise. Measured before this rule: "our trust account has moved
//    banks… use the new BSB" scored safe 10 by email.
// 3. Somewhere to send the money: a bank-detail ask, an account number, or a
//    transfer verb.
//
// Not when the message carries the protective wording genuine firms put in
// every settlement email — "our bank details will never change by email; if
// you receive an email saying they have changed, call us". That sentence
// contains the changed-details half verbatim, and a rule that fired on the
// warning would be teaching readers to distrust the firms that send it.
//
// ## Why 25, and why it declines the email discount
//
// Weighted as the rental-bond composite is: it corroborates the generic rows
// (the bank-detail ask and the changed-details flag), which already score
// when the wording matches, and a single extra row should move a lure up one
// tier rather than decide it alone. Declared as a bare number so the email
// pass's 0.7 never applies — the channel this script actually arrives on is
// email, and before this rule the whole body was discounted there (one lure
// scored 65 by SMS and 45 by email).

import type { Context, Hit, SignalDef } from "../signalRegistry";

/** Opening words of the row. Exported for the tests that assert the wording. */
export const SETTLEMENT_REDIRECT_FLAG =
  "Property settlement funds redirected to changed bank details";

/**
 * Half 1 — the money is a settlement, and a conveyancer or solicitor holds it.
 *
 * Both vocabularies: Australia settles into a trust account, England and Wales
 * complete into a client account — the SRA alert's own terms. "Completion"
 * alone is an ordinary word, and so is "on completion" ("congratulations on
 * completion of the course"), so it counts only in the forms conveyancing
 * uses it: completion funds, statement or date, and before or ahead of
 * completion.
 */
const SETTLEMENT_CONTEXT =
  /\b(?:property\s+settlement|(?:settlement|completion)\s+(?:funds?|monies|moneys|amount|figures?|balance|date|statement|day)|(?:before|ahead\s+of|prior\s+to|for|at|on)\s+settlement|(?:before|ahead\s+of|prior\s+to)\s+completion|conveyanc\w*|trust\s+account|client\s+account)\b/i;

/**
 * Half 2 — the account is presented as changed.
 *
 * Each branch needs an account noun beside the change, so "updated settlement
 * statement" or "new settlement date" does not read as a changed account.
 */
const CHANGED_ACCOUNT = [
  /\b(?:updated?|new|changed|amended|revised|different)\s+(?:bank(?:ing)?|payment|account|remittance|trust\s+account|bsb|sort\s+code|routing\s+number|iban)\b/i,
  /\b(?:bank(?:ing)?|payment|account)\s+(?:details\s+)?(?:have|has)\s+(?:now\s+)?(?:been\s+)?(?:updated|changed|amended|moved)\b/i,
  /\b(?:moved|changed|switched)\s+(?:our\s+|their\s+)?banks?\b/i,
];

/** Half 3 — somewhere for the money to go. */
const BANK_ASK =
  /\b(?:bank\s+details|account\s+(?:number|no\b|details)|acc(?:ount)?\s*(?:#|no\.?)\s*\d|account\s*:?\s*\d{6,})/i;
const TRANSFER = /\b(?:transfer|remit|deposit|wire|pay)\w*\b/i;

/**
 * The firm's own warning against this exact fraud.
 *
 * Firms put it in every settlement email, so a message carrying it is the
 * genuine article far more often than a scam quoting it back.
 */
const PROTECTIVE_WORDING =
  /\b(?:will|would|do(?:es)?)\s+(?:never|not)\s+(?:change|email|send|notify|contact)\b|\bnever\s+(?:change|changes)\b|\bwon'?t\s+change\b|\bif\s+you\s+(?:ever\s+)?receive\s+(?:an?\s+)?(?:email|message|call|text)\b/i;

/** The reader-facing row. */
const SETTLEMENT_REDIRECT_ROW =
  `${SETTLEMENT_REDIRECT_FLAG} — this is the conveyancing redirect scam: criminals take over or imitate a solicitor's or conveyancer's email just before settlement and send "updated" account details. Before moving any money, phone your conveyancer on a number you already had — never one in this message — and confirm the account details out loud.`;

/**
 * The composite, at 25 on both channels it runs on.
 *
 * `["sms", "email"]`, where the other gated composites run. Not `custom`:
 * `checkCustom` keeps its own keyword pass, and widening a signal to a channel
 * nothing has probed is a detection change of its own.
 *
 * `structural`: it matches the shape of a redirect — settlement, changed
 * account, somewhere to pay — not a claim about which firms or banks exist.
 */
export const SETTLEMENT_REDIRECT_SIGNALS: readonly SignalDef[] = [
  {
    id: "settlement.redirect",
    reads: ["original", "body", "matches"],
    channels: ["sms", "email"],
    weight: 25,
    kind: "structural",
    evaluate: (ctx: Context): Hit[] => {
      // No matcher, no match — the pack's bank identifiers need it. See the
      // note on `Context.matches`.
      const matches = ctx.matches;
      if (!matches) return [];
      const text = ctx.original;
      if (PROTECTIVE_WORDING.test(text)) return [];
      const hasBankAsk =
        BANK_ASK.test(text) || ctx.pack.bankIdentifiers.some((id) => matches(ctx.body, id));
      const fires =
        SETTLEMENT_CONTEXT.test(text) &&
        CHANGED_ACCOUNT.some((re) => re.test(text)) &&
        (hasBankAsk || TRANSFER.test(text));
      return fires ? [{ text: SETTLEMENT_REDIRECT_ROW, source: "message" }] : [];
    },
  },
];
