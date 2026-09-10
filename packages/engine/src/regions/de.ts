// Germany — `minimal`.
//
// Authored against the tier rules documented in sg.ts, which is the reference
// for this tier. Everything here is a public-registry or published-policy fact:
// the agencies are named public institutions, the suffixes are eligibility
// facts from DENIC and the Bund, and the number ranges come from the
// Bundesnetzagentur numbering plan. No brands, no keywords, no allowlist.
//
// The German-language question is the tier working as designed, not a gap this
// pack papers over: German scam messaging is in German, and the keyword layer
// is English, so this pack contributes on the positive side only — an
// impersonated agency is named, and a victim is pointed at the BSI and the
// police rather than at Scamwatch in another country.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// Federal and state bodies impersonated in Germany, in the form a message
// would name them — both the abbreviation and the expanded name, since scam
// copy uses whichever reads as more official.
//
// Deliberately excludes bare "bundesamt" and "finanzamt": those name a KIND of
// office rather than a specific one ("Finanzamt" is every local tax office in
// the country), and the same reasoning that keeps GENERIC_AUTHORITY_TERMS out
// of lib/targetRegion.ts's attribution map applies to a substring match here.
const AUTHORITY_MENTIONS = [
  "bundesnetzagentur",
  "bundeszentralamt für steuern",
  "bundeszentralamt fuer steuern",
  "elster",
  "bundespolizei",
  "zollamt",
  "deutsche zollverwaltung",
  "bundesamt für sicherheit in der informationstechnik",
  "bsi",
  "bafin",
  "bundesanstalt für finanzdienstleistungsaufsicht",
  "schufa",
  "deutsche rentenversicherung",
  "bundesagentur für arbeit",
  "jobcenter",
  "gez",
  "beitragsservice",
  "rundfunkbeitrag",
];

// Foreign authorities with no jurisdiction over German residents. Spread from
// the shared constant rather than retyped — hand-copying this list is what
// produced the "Chinese Embassy" gap six times over in 2026-08, and the
// shared-list invariant in regions.test.ts is what catches a copy.
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const DE: RegionDefinition = {
  code: "DE",
  name: "Germany",
  coverage: "minimal",

  // No national campaign keywords. German lures are written in German, and an
  // English list would assert coverage this tier has not earned. Base
  // contributes generic urgency and the voice-clone script.
  urgency: {
    foreignAuthority: [],
    toll: [],
    parcel: [],
    utility: [],
    pension: [],
    recall: [],
    tax: [],
    taxThreat: [],
  },

  authorityMentions: AUTHORITY_MENTIONS,
  // Empty by tier rule: naming a body here asserts it has publicly committed to
  // sending no links, which this tier does not verify. The flag is unreachable
  // while the list is empty.
  noLinkSenders: [],
  noLinkSendersFlag: "",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Germany and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to your local police or to the BSI.",

  // Germany transfers on IBAN; there is no separate routing identifier
  // equivalent to a BSB or sort code. The composite falls back to base phrasing.
  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — BaFin publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  // No national brand knowledge — the defining property of the tier. buildPack
  // still unions in BaseSignals.typosquatBrands, which is the global list every
  // pack receives and not this pack's claim.
  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only.
  //
  // `.bund.de` is restricted to German federal bodies and `.gv.at`-style state
  // equivalents sit outside it, so only the federal namespace is asserted here.
  // Plain `.de` is deliberately absent: DENIC registers it to anyone with no
  // eligibility bar at all, which is precisely the namespace a scammer buys.
  // Same reasoning as `.co.uk` in GB and `.com.sg` in SG.
  trustedHostSuffixes: [".bund.de"],
  // Registrable namespaces this region's brands legitimately register on.
  //
  // `.de` is FLAT: DENIC operates no second-level hierarchy at all, so `.de` is
  // the only national public suffix and `bund.de` is an ordinary registrable
  // domain beneath it, not a suffix. It is therefore absent here — this field
  // takes public suffixes, asserted by publicSuffix.test.ts, and listing
  // `bund.de` failed that check rather than passing quietly.
  //
  // That is also why it stays in `trustedHostSuffixes` above: that field
  // matches hostname suffixes and asks a different question ("is registration
  // eligibility-restricted"), which `bund.de` genuinely is.
  brandSuffixes: ["de", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "your local police (Polizei) or the BSI",
  reportingUrl: "https://www.bsi.bund.de/DE/Service-Navi/Kontakt/kontakt_node.html",

  phonePlan: {
    // Bundesnetzagentur premium ranges, authored in national form WITH the
    // trunk 0 because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified against real numbers rather than
    // assumed: +49 137 7123456 arrives as nationalNumber "1377123456", so the
    // authored prefix must be "0137" and a bare "137" would silently never
    // fire — the SG premiumPrefixes defect exactly.
    //
    // 0900 is the premium service range and 0137 is mass-traffic /
    // televoting, both billed at elevated rates to the caller.
    // NOTE, verified by injection rather than assumed: libphonenumber ALREADY
    // classifies this range as PREMIUM_RATE, and analysePhone pushes
    // `premiumFlag` from that branch too (phoneIntel.ts, the `type ===
    // "PREMIUM_RATE"` case). So the authored prefixes below are redundant here —
    // breaking them to a bare, trunk-less form changes nothing observable:
    // lineType, the flag copy and the very_high risk bump are all identical.
    //
    // They are kept anyway, in correct trunk-0 form, for two reasons: the
    // prefix rule runs BEFORE the validity check and is the only thing that
    // fires when libphonenumber rejects a range as invalid (SG 1900, AU 190x),
    // and an incorrectly-authored prefix here would become live the moment the
    // library's metadata changed. What must not be inferred from a green test
    // is that these prefixes are doing the work — the roadmap already recorded
    // this trap for NANP ("US and CA hide this class of bug"); DE, ZA and JP
    // are in the same category, and SG is the exception that made it visible.
    premiumPrefixes: ["0900", "0137"],
    premiumFlag:
      "Premium rate number — German 0900 and 0137 numbers bill the caller at elevated rates, and a message pushing you to call one is charging you for the privilege",
    // 110 (police) and 112 (Europe-wide emergency) are already in the universal
    // EMERGENCY_NUMBERS set in phoneIntel, so nothing is added here. Matched by
    // exact equality rather than as a prefix, so this field takes whole numbers
    // only — 116117 is the medical on-call service and qualifies on both counts.
    emergencyNumbers: ["116117"],
    // Germany's toll-free range is 0800, not the NANP 800. libphonenumber
    // classifies the line type itself, so this copy fires without an authored
    // prefix — which makes naming the right national range the only thing this
    // field has to get right.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 0180 is the shared-cost range, billed to the caller at a published tariff.
    sharedCostFlag:
      "German 0180 shared-cost numbers are billed to you at a published rate — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
