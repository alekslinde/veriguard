// Shared value types for the detection engine.
//
// These live apart from scamDetector.ts to break a dependency cycle: the
// scorer imports detectType to classify input, and detectType needs ScamType
// to describe its return. With both in scamDetector.ts the two modules import
// each other, which bundlers tolerate only by accident of evaluation order and
// which blocks extracting the engine into its own package.
//
// Types only — no logic, no imports. Anything with behaviour belongs in the
// module that owns it.

import type { PhoneIntel } from "./phoneIntel";
import type { RegionCoverage } from "./regions";

/** What kind of thing the user submitted. */
export type ScamType = "url" | "sms" | "email" | "phone" | "qr" | "custom";

/**
 * The blocklist, as the engine actually uses it: one membership test.
 *
 * Every checker took a `Set<string>`, but the scorer only ever asks
 * `blocklist.has(hostname)` — one call site, one method. The wider type was a
 * claim the engine did not rely on, and it ruled out a caller that answers the
 * same question differently.
 *
 * That caller now exists. The WebExtension receives the list as truncated
 * hashes, so its lookup hashes the hostname before testing membership; it
 * satisfies this interface and cannot satisfy `Set<string>`. `Set` still
 * satisfies it structurally, so every existing call site is unchanged.
 *
 * The contract for an implementor: `has` is synchronous, total, and answers for
 * a lowercased hostname with trailing dots already stripped — the form the
 * scorer derives before calling. It must not throw; a lookup that cannot answer
 * returns false, because the failure mode of a wrong `true` is a false
 * accusation against a real domain.
 */
export interface HostLookup {
  has(hostname: string): boolean;
}

/**
 * Where a signal came from. The UI groups evidence rows by this, so it names
 * the surface the reader can look at themselves — the link, the wording, the
 * headers — not the internal checker that produced it.
 */
export type SignalSource = "link" | "message" | "sender" | "phone" | "attachment" | "score";

/**
 * One piece of evidence behind a verdict, with the weight it contributed.
 *
 * Detection used to emit `flags: string[]` and accumulate the score separately,
 * which meant the reason and its weight were correct but unpairable: the UI
 * could show "we found six things" and "the score is 100" with no way to say
 * which of the six mattered. Pairing them is what lets the result explain
 * itself, which is the whole product.
 *
 * `points` is the raw contribution before the 0-100 clamp, so it is signed: a
 * positive-signal rule (a known-legitimate domain) subtracts, and the clamp
 * itself is emitted as a "score" row rather than silently swallowing the
 * difference. Zero is meaningful and common — a contextual note that informs
 * the reader without moving the number.
 */
export interface Signal {
  /** Reader-facing sentence. Already defanged where it quotes user content. */
  text: string;
  /** Signed contribution to the pre-clamp total. Zero for context-only notes. */
  points: number;
  source: SignalSource;
}

/** A single analysed identifier — one verdict for one URL, number or message. */
export interface CheckResult {
  verdict: "safe" | "suspicious" | "likely_scam" | "unknown";
  score: number; // 0-100, higher = more scammy
  /**
   * Reader-facing reasons, kept as plain strings for every existing consumer.
   * Derived from `signals` — see buildFlags — so the two can never disagree.
   */
  flags: string[];
  /**
   * The same reasons carrying their weights. Optional because a CheckResult can
   * be constructed by hand in tests and by the eval harness, which care only
   * about verdict and score.
   */
  signals?: Signal[];
  details: string;
  category?: string;
  phoneIntel?: PhoneIntel;
  expandedUrl?: string; // defanged real destination when the input was a shortened URL
  // Detection coverage of the region pack that produced this result. Present on
  // every result; consumers must not render a confident "safe" when this is
  // "partial" or "none" — a low score there can mean "no rules matched" rather
  // than "nothing wrong". See downgradeForCoverage.
  coverage?: RegionCoverage;
}
