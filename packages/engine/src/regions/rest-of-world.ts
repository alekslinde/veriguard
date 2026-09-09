// Rest of world — the base-only fallback pack.
//
// Used when we know roughly where someone is but have no national layer for
// them. Universal signals still run (shorteners, abused TLDs, IPFS, phishing
// hosting, credential asks, voice-clone scripts), so real detections still
// fire — but there are no local agencies, brands or schemes, so a quiet result
// is not evidence of safety.
//
// coverage: "none" is what makes that honest: it downgrades clean verdicts to
// "unknown" and surfaces the coverage notice, rather than reporting a
// confident pass we haven't earned. Adding a national layer for a country
// means giving it its own pack, not extending this one.

import type { RegionDefinition } from "./types";

export const REST_OF_WORLD: RegionDefinition = {
  code: "ZZ", // ISO 3166-1 user-assigned range — not a real country
  // Reads as a place, because it is interpolated into sentences that name one
  // ("scam reporting in {region}"). "Somewhere else / not listed" described the
  // menu option rather than the region, and landed as "reporting in Somewhere
  // else / not listed". Its job as the none-of-these option is carried by the
  // sort in REGION_OPTIONS, which pins it last, not by the label.
  name: "Rest of the world",
  coverage: "none",

  // No national campaign signals. The base groups (generic urgency,
  // voice-clone) still apply and are merged in by buildPack.
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

  authorityMentions: [],
  noLinkSenders: [],
  noLinkSendersFlag: "",

  foreignAuthorityMentions: [],
  foreignAuthorityFlag: "",

  // No national routing identifier; the composite falls back to the generic
  // "bank details" / "account number" phrasings alone.
  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  // Regulator-warned platform names are jurisdictional; the base list of
  // globally-promoted fake platforms still applies, so keep the wording generic.
  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — financial regulators have issued specific warnings that this is a scam. Do not invest.`,

  // No NATIONAL brand list. Impersonated brands are the most region-specific
  // signal we have, and inventing a local one for an unauthored country would
  // be noise at best and a false accusation at worst.
  //
  // This is no longer the whole story, and the change matters here more than
  // anywhere: buildPack unions in BaseSignals.typosquatBrands, the handful of
  // names squatted in every market (paypal, amazon, netflix, the global crypto
  // exchanges). So `ZZ` now scores both the substring rule and keyboard-
  // adjacency detection, where before it had no brand to match against and both
  // rules were structurally unreachable. Everything else still rests on the
  // signals that need no brand knowledge — hyphens, depth, abused TLDs,
  // shorteners, homoglyphs.
  //
  // coverage stays "none". Six global brands is not local knowledge, and a
  // clean result here still is not evidence of safety.
  typosquatBrands: { substring: [], word: [] },
  trustedHostSuffixes: [],
  // No national layer, so no suffix is "this region's own" — this stays empty.
  //
  // It does NOT disable the base brands' ownership exemption, which would have
  // flagged paypal.com worldwide. The checker reads the UNION of every pack's
  // brandSuffixes, not this region's, precisely because brands are not confined
  // to one country; single-label suffixes like `.com` are exempt by default in
  // any case. See BRAND_SUFFIXES in scamDetector.
  brandSuffixes: [],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  // No allowlist, so these are never reached — present to satisfy the shape.
  legitDomainFlag: "",
  legitDomainDetails: "",

  // senderIdFlag deliberately omitted: sender-ID registration is a national
  // scheme, and asserting one where none exists would be simply false.

  // Generic wording — naming a specific agency would be wrong for most of the
  // world. Regions with a known reporting body name it.
  reportingBody: "your local consumer protection or cybercrime authority",
};
