// Public surface of the engine package.
//
// Subpath exports (`@veriguard/engine/scamDetector`) mirror the old
// `@/lib/*` layout, so the extraction was a move rather than a re-architecture
// and call sites changed only in their import specifier. This barrel is the
// front door for new consumers — a client that wants "the engine" imports here
// and gets the checking API plus the types needed to consume a result.
//
// Deliberately not re-exported: nothing that would pull a region pack's
// internals into a bundle that only needs the scorer.

export {
  checkUrl,
  checkSms,
  checkEmail,
  checkPhone,
  checkCustom,
  analyzeContent,
} from "./scamDetector";
export type {
  AnalyzedIdentifier,
  AnalyzeOptions,
  MessageCheckOptions,
} from "./scamDetector";

export type { ScamType, CheckResult } from "./engineTypes";

export { VERDICT_RANK, isWorse, worstBy } from "./verdictRank";
export type { Verdict } from "./verdictRank";

export { detectType } from "./detectType";

export {
  DEFAULT_REGION,
  FALLBACK_REGION,
  resolveRegionPack,
  supportedRegions,
  REGION_OPTIONS,
} from "./regions";
export type {
  RegionCode,
  RegionCoverage,
  RegionPack,
  RegionInput,
} from "./regions";

export type { ExpandFetch, ExpandResult } from "./urlExpander";
