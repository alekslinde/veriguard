// Brazil — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// Registro.br eligibility facts, and the number ranges come from the ANATEL
// numbering plan.
//
// Brazil is the pack that produced a genuine finding about the phone plan, and
// it is worth reading before authoring the next non-Latin-trunk country — see
// the phonePlan comment below. Scam messaging here is in Portuguese, so the
// English keyword layer contributes nothing and the pack's value is the
// positive half: an impersonated agency named, and a victim pointed at a
// Brazilian consumer authority instead of a foreign one.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// Brazilian public bodies impersonated by scammers. Accented and unaccented
// spellings are both listed where the difference is a single diacritic: the
// matcher compares literal lowercased text, and Brazilian scam SMS routinely
// drops accents. This is a matching fact about the engine, not a claim about
// the institution — the same reason sg.ts lists both word orders for the
// shared Chinese-authority list.
const AUTHORITY_MENTIONS = [
  "receita federal",
  "detran",
  // "meu inss" (the citizen portal) is deliberately NOT listed: "inss" is
  // already here and matches inside it, so the longer phrase is unreachable
  // and contributes only a double-score. Caught by packShadowing.test.ts.
  "inss",
  "instituto nacional do seguro social",
  "serasa",
  "spc brasil",
  "caixa economica federal",
  "caixa econômica federal",
  "banco central do brasil",
  "bacen",
  "procon",
  "anatel",
  "policia federal",
  "polícia federal",
  "correios",
  // "gov.br" is deliberately NOT listed, though it is the real citizen portal
  // and the obvious name to reach for. Every other entry in this list names an
  // INSTITUTION; that one names a DOMAIN, so it fires on ordinary prose
  // pointing someone at the genuine portal — and a `minimal` pack has no
  // `legitDomains` to counterweight it (tier rule), unlike GB and AU, whose
  // real government links score 15/safe precisely because their allowlists
  // recognise them. Probed: "Confira em https://www.gov.br/inss" scored
  // 40/suspicious with the entry present and 15/safe without it.
  //
  // The tier's asymmetry decides this. A missing agency name costs one signal;
  // naming the government's own portal as a scam indicator teaches a Brazilian
  // user that the verdicts are noise — which is the direction the project
  // treats as the costlier one.
  "cpf regularizacao",
  "tribunal de justica",
  "tribunal de justiça",
  "justica eleitoral",
  "justiça eleitoral",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const BR: RegionDefinition = {
  code: "BR",
  name: "Brazil",
  coverage: "minimal",

  // No national campaign keywords: Brazilian lures are written in Portuguese,
  // and an English list would assert coverage this tier has not earned.
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
  noLinkSenders: [],
  noLinkSendersFlag: "",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Brazil and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Polícia Federal or your local Procon.",

  // Brazilian instant transfers are addressed by Pix key, and boleto is the
  // other common payment rail scammers redirect. Both are routing identifiers
  // in the sense the composite cares about.
  bankIdentifiers: ["pix", "chave pix", "boleto"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Comissão de Valores Mobiliários (CVM) publishes public warnings about unauthorised investment operators of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only.
  //
  // `.gov.br` is restricted to Brazilian government bodies, `.jus.br` to the
  // judiciary, `.mil.br` to the armed forces, and `.edu.br` to accredited
  // higher-education institutions — all vetted by Registro.br, which
  // administers one of the more tightly categorised ccTLD hierarchies.
  //
  // `.com.br` is deliberately absent: it is open to any registrant with a CNPJ
  // or CPF, which is a registration bar rather than an eligibility one. Same
  // reasoning as `.com.sg` and `.co.uk`.
  trustedHostSuffixes: [".gov.br", ".jus.br", ".mil.br", ".edu.br"],
  brandSuffixes: ["com.br", "br", "net.br", "org.br", "gov.br", "edu.br", "jus.br", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "your local Procon or the Polícia Federal",
  reportingUrl: "https://www.gov.br/mj/pt-br/assuntos/sua-protecao/consumidor",

  phonePlan: {
    // ANATEL non-geographic ranges, and the pack where the trunk-0 convention
    // needed checking rather than assuming.
    //
    // Brazilians dial these ranges as 0300 / 0800 with a leading zero, but the
    // zero is a CARRIER-SELECTION artefact, not part of the national number:
    // libphonenumber returns +55 300 123 4567 as nationalNumber "3001234567",
    // with no leading zero. analysePhone then prepends one, so the value the
    // prefix rule actually sees is "03001234567" — which means the authored
    // prefix must be "0300" and works only BECAUSE of that prepend, not
    // because the zero is dialled.
    //
    // The distinction matters for the next pack: the correct entry here is
    // never "what does a local dial", it is "what does '0' + nationalNumber
    // produce". Those agree in DE, JP and ZA and coincide here for a different
    // reason, and a country whose trunk prefix is not 0 would break the
    // pattern outright. Verified by printing real values, per the roadmap's
    // "print one real value before writing the code that depends on its shape".
    //
    // 0300 is shared-cost rather than premium, so it is NOT listed as premium:
    // Brazil allocates no consumer premium-rate range comparable to DE's 0900,
    // so premiumPrefixes and premiumFlag are omitted rather than filled with a
    // speculative entry.
    //
    // 190 (police), 192 (ambulance), 193 (fire) and 180 (women's helpline) are
    // Brazil's own emergency numbers and are NOT in the universal
    // EMERGENCY_NUMBERS set. Matched by exact equality, so whole numbers only.
    emergencyNumbers: ["190", "192", "193", "180", "181"],
    // Brazil's toll-free range is 0800. libphonenumber classifies the line
    // type, so this copy only has to name the right national range.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 0300 shared-cost: billed to the caller, commonly at mobile-call rates.
    sharedCostFlag:
      "Brazilian 0300 shared-cost numbers are billed to you rather than to the company — a message pressing you to call one to 'regularise' a document or release a delivery is a common cost-shifting tactic",
  },
};
