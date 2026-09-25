# Threat-intelligence roadmap — 2026-09-25

*Sweep period: 2026-09-14 – 2026-09-25 (regular weekly cycle). Next sweep due 2026-10-02.*

---

## Status — 2026-09-13 proposals

| ID | Proposal | Status |
|---|---|---|
| D1 | US: FEMA impersonation — `AUTHORITY_MENTIONS`, `NO_LINK_SENDERS`, `URGENCY_TAX` | **Pending** |
| D2 | GB: DVLA vehicle tax payment-failure phrasing — `URGENCY_TOLL` | **Pending** |
| D3 | BASE: "account compromised" / "account was compromised" variants | **Pending** |

---

## Executive summary

Three proposals this cycle. Two are easy array additions; the third is a moderate URL-checker rule.

**Top recommendations, ranked by impact × ease:**

| Rank | Proposal | Region | Why first |
|---|---|---|---|
| 1 | D1 — AU: "payments will be suspended" Centrelink/Medicare lure | AU | Active 270K-email campaign (Mimecast/Yahoo Finance Sep 2026); phrase absent; LOW FP risk |
| 2 | D2 — BASE: AI voice-clone post-call pressure phrases | BASE | New 2026 AI-vishing evolution; confirmed absent; phrase-level rule, easy to ship |
| 3 | D3 — BASE/URL: AiTM OAuth2-path phishing kit detection | BASE (URL) | Dominant 2026 PhaaS toolkit; OAuth2-path heuristic not in `checkUrl()`; MEDIUM FP risk, worth the precision tradeoff |

**Coverage notes on threats that are already handled:**
- ACMA SMS Sender ID register (live 1 July 2026) — `au.ts senderIdFlag` covers the "ignore the Unverified label" lure. No new proposal.
- Origin Energy / EnergyAustralia brand impersonation — `au.ts BRAND_MENTIONS` and `TYPOSQUAT_BRANDS` already carry both brands. The July 2026 Origin breach compounds risk but does not introduce new text-side phrasing beyond existing urgency signals. Watchlist.
- AGL / Alinta Energy — already in `au.ts`. No gap.
- `.bond`, `.shop`, `.life`, `.store` TLDs — already in `base.ts SUSPICIOUS_TLDS` (D1 / #101). No gap.
- myID forced re-registration — `au.ts IDENTITY_REREG`. No gap.
- "account has been locked" — `base.ts URGENCY_GENERIC`. No gap.
- Pig-butchering wallet-approval phishing — `base.ts REQUEST_WORDS` (`"connect wallet"`, `"approve transaction"`, `"wallet approval"`, `"sign transaction"`). Covered.
- Fake gambling "scambling" — `au.ts REWARD_WORDS`. Covered.

**No new pack-interface fields needed.** D1 targets an existing urgency group; D2 targets an existing urgency group; D3 adds a path heuristic to `checkUrl()` — a new local `const` and a scored check, not a RegionDefinition field.

---

## Threats this cycle

### AU-1 — Active Centrelink / Services Australia / myGov multi-benefit email blast

**Source:** Yahoo Finance / Mimecast report (September 2026) — Tier 2 (vendor data, corroborated by Services Australia scam-alert page, Tier 1).

Mimecast detected more than 270,000 phishing emails over four months impersonating Centrelink and Services Australia. The emails are AI-generated "super clones" that blend multiple benefit types — Medicare, Centrelink, JobSeeker, Family Tax Benefits, and superannuation — in a single message to maximise the chance that one resonates with the target.

The defining new lure text is:

> "myGov: Your account has been locked due to suspicious activity. Confirm identity within 24h or your Medicare and Centrelink **payments will be suspended**."

The compound "payments will be suspended" phrase is the detection gap. The engine already catches:
- `"account has been locked"` → `base.ts URGENCY_GENERIC` (+10)
- `"medicare"` / `"centrelink"` → `au.ts AUTHORITY_MENTIONS` (+25)

It does **not** catch:
- `"payments will be suspended"` — absent from all urgency groups in `au.ts` and `base.ts`
- `"medicare payments suspended"` — absent
- `"centrelink payments suspended"` — absent
- `"benefit payments will be suspended"` — absent

Without the payment-suspension phrase, a short message like *"Your Medicare and Centrelink payments will be suspended in 24h — verify at mygov-verify[.]top"* scores: authority mentions (+25) + suspicious TLD (+30) = 55 (likely_scam). The phrase addition is belt-and-suspenders: it closes the gap when the URL is absent or the domain is not yet in any list.

**AU relevance:** HIGH — active campaign with $13.7M in losses in early 2025 alone (Services Australia advisory); AI-generated variant detected as recently as September 2026.

**IOCs:**
- Subject lines: "Your myGov account has been locked", "Action required: Centrelink payment suspended", "Medicare and Centrelink — identity confirmation required"
- Body phrases: "payments will be suspended", "centrelink payments suspended", "medicare payments suspended", "confirm identity within 24h"
- URL patterns: `mygov-verify-*.top`, `mygov-id-confirm.*.workers.dev`, `services-australia-verify.*.online`

**Sources:**
- Services Australia Centrelink impersonation scam advisory: https://www.servicesaustralia.gov.au/centrelink-impersonation-email-scams
- Yahoo Finance / Mimecast: https://au.finance.yahoo.com/news/centrelink-warning-as-270000-emails-sent-out-in-attack-related-to-medicare-superannuation-and-tax-benefits-051023567.html
- myGov account-locked scam guide: https://safebrowz.com/blog/mygov-account-locked-scam-australia
- YourLifeChoices Medicare SMS surge: https://www.yourlifechoices.com.au/centrelink/the-text-message-trap-costing-australians-millions-why-medicare-scams-are-surging/

---

### AU-2 — Origin Energy data breach follow-on spear-phishing (July 2026)

**Source:** ABC News (July 24, 2026) — Tier 1; Origin Energy customer advisory (originenergy.com.au) — Tier 1; MailGuard Origin phishing analysis — Tier 2.

Origin Energy confirmed an unauthorised access incident in July 2026 disclosing customer names, dates of birth, phone numbers, home addresses, email addresses, last 4 digits of credit cards, and last 3 digits of bank account numbers. Origin warned customers that scammers may exploit the breach to send highly personalised impersonation messages.

**Coverage check:** `au.ts BRAND_MENTIONS` already contains `"origin energy"` / `"originenergy"`, and `TYPOSQUAT_BRANDS` covers URL-level squatting. Existing urgency signals (`"security alert"`, `"unusual activity"`) compound with the brand mention to score most variants. The breach does not introduce a new *distinct* lure phrase — it personalises the existing Origin Energy billing/refund template with the victim's own partial card or bank digits.

**Gap:** Partial. The specific impersonation text "due to the recent security incident affecting Origin Energy, please verify your account details" is not in the engine, but the compound of `"origin energy"` brand mention (+20) + `"security alert"` urgency (+10) + a suspicious URL would already reach *suspicious* (45) or *likely_scam* (65+) depending on the link. A standalone `"due to recent security incident"` phrase would have HIGH FP risk from legitimate IT security communications. **Not proposed as a standalone detection rule this cycle.** See Watchlist.

**AU relevance:** HIGH — timing (breach July 2026 → phishing follows within days); 3+ million Origin customers affected.

**Sources:**
- ABC News Origin breach: https://www.abc.net.au/news/2026-07-24/origin-breach-could-fuel-wave-of-ai-powered-scams/106951588
- Origin Energy July 2026 update: https://www.originenergy.com.au/update-july-2026/
- MailGuard Origin phishing: https://www.mailguard.com.au/blog/fake-origin-energy-refund-email-targets-australians-with-multi-step-scam
- EnergyAustralia phishing: https://www.arnnet.com.au/article/1266363/energyaustralia-dragged-into-major-phishing-scam.html

---

### BASE-1 — AI voice-clone post-call pressure (2026 vishing evolution)

**Source:** vectra.ai (2026 AI scam landscape) — Tier 3; safeaus.com.au (AU 2026 scam guide) — Tier 3; trend-rays.com (AU bank biometric bypass) — Tier 3; baitandphish.com (vishing defense 2026) — Tier 3. All corroborate the same documented pattern.

The AI voice-clone scam has evolved in 2026. Earlier variants (already in `base.ts URGENCY_VOICE_CLONE`) place a cloned-voice call and then rely on the victim to self-fund (bail money, emergency transfer). The 2026 escalation adds a *follow-up text message* that creates false familiarity by referencing the call:

> "As per our phone call, please transfer the funds to the account below — your case reference is ATO-2026-XXXXX."

> "Following our recent call, please confirm your details at [link] to complete the verification we discussed."

This is a psychologically sophisticated technique: the SMS arrives *after* the call, so the victim believes the sender is the same legitimate entity that just called. The call provides a plausible identity (ATO, AFP, bank fraud team); the SMS exploits the victim's memory of that call to accelerate compliance.

**Coverage check:** `base.ts URGENCY_VOICE_CLONE` covers the call-side signals (bail money, stranded, emergency funds). It does **not** cover the post-call SMS follow-up phraseology. `"as per our phone call"`, `"as discussed in our call"`, `"following our recent call"`, `"as i mentioned on the call"` are absent from all packs.

**AU relevance:** HIGH — AI voice clones can bypass AU bank voice-biometric systems (trend-rays.com, Sep 2026); ATO and AFP are the most commonly cloned AU authorities in these calls.

**FP considerations:** "As per our call" appears in legitimate business SMS and email. However:
1. The urgency scorer applies +10 per hit, capped at +35. A lone "as per our phone call" scores 10 (safe). The phrase only affects verdicts when compounding with a link, authority mention, or financial request — precisely the compound the lure produces.
2. Longer forms (`"as per our phone call"`, `"as i mentioned on the call"`) are more specific and carry lower FP risk than `"as per our call"` alone. The longer forms should be preferred.
3. `"confirming what we discussed on the call"` is essentially zero-FP in consumer SMS.

**IOCs:**
- Lure phrases: "as per our phone call", "as discussed in our call", "following our recent call", "as i mentioned on the call", "confirming what we discussed", "following up on our call"
- Pattern: arrives as SMS/email after a phone call claiming to be ATO, AFP, bank fraud team, or Medicare
- Often includes a fake case reference number to add legitimacy

**Sources:**
- AI vishing 2026 overview: https://www.vectra.ai/topics/ai-scams
- AU AI scams 2026: https://www.safeaus.com.au/learn/scams-to-watch-2026/
- AI voice scams in AU: https://trend-rays.com/ai-voice-scams-australia/
- AI voice-clone defense: https://www.baitandphish.com/blog/ai-voice-clone-phishing-defense

---

### BASE-2 — AiTM phishing kits dominate 2026 PhaaS landscape

**Source:** Paubox (2026 popular phishing kits) — Tier 2; cybersecuritynews.com (top 10 kits July 2026) — Tier 2; Sekoia AiTM global analysis — Tier 2; ringsafe.in (AiTM 2026 analysis) — Tier 3. Multiple Tier 2 sources corroborate.

Adversary-in-the-Middle (AiTM) phishing kits — Tycoon 2FA, Mamba 2FA, EvilProxy, Sneaky 2FA, Greatness, Storm-1167, and the open-source Evilginx — are now the dominant phishing substrate for credential and session-cookie theft in 2026. These kits run a reverse proxy between the victim and the legitimate authentication provider, forwarding credentials and MFA codes in real time.

**Key URL-side signatures of AiTM kits:**
1. Hosted on free-tier infrastructure: `workers.dev`, `pages.dev`, `trycloudflare.com` — already in `base.ts SUSPICIOUS_HOSTING` (+35/+25).
2. Path mimics Microsoft's OAuth2 login flow:
   - `/oauth2/v2.0/authorize`
   - `/common/oauth2/authorize`
   - `/openid/connect/authorize`
3. When NOT on `login.microsoftonline.com` or `accounts.google.com`, an `/oauth2/` path is a strong AiTM indicator — real OAuth2 endpoints live on Microsoft/Google's own domains; a phishing proxy running on a random domain *must* use these paths to look convincing.

**Coverage check:** `checkUrl()` currently flags `/login`, `/signin`, `/verify`, `/secure` in the path (+10). It does **not** flag `/oauth2/` or `/openid/` paths on non-authoritative domains. The hosting signals (`.workers.dev`, `.pages.dev`) already add +35. Adding the path signal captures a complementary dimension: a legitimate-seeming subdomain (e.g. `login-microsoft.pages.dev/oauth2/v2.0/authorize`) would be flagged by hosting (+35) **plus** OAuth2-path (+20) = 55 (likely_scam), even if the TLD is not in the suspicious list.

**FP considerations:** MEDIUM. `/oauth2/` is a common path on self-hosted OAuth2 servers (Keycloak, Okta, Azure AD B2C custom domains). The rule should only fire when the host is NOT one of a small set of known-legitimate auth providers. Proposed legit-host exceptions: `login.microsoftonline.com`, `accounts.google.com`, `appleid.apple.com`, `login.live.com`, `auth0.com`, `okta.com`.

**AU relevance:** HIGH — Australian Microsoft 365 tenants and Google Workspace users are targeted; ACSC has published AiTM phishing advisories in 2025-2026.

**Sources:**
- Most popular phishing kits 2026: https://www.paubox.com/blog/most-popular-phishing-kits-used-in-2026
- Top 10 phishing kits July 2026: https://cybersecuritynews.com/top-10-phishing-kits-used-by-hackers/
- AiTM 2026 EvilProxy / Mamba / Tycoon: https://ringsafe.in/aitm-phishing-in-2026-how-evilproxy-mamba-tycoon-and-astaroth-defeat-microsoft-365-mfa/
- Sekoia global AiTM analysis: https://blog.sekoia.io/global-analysis-of-adversary-in-the-middle-phishing-threats/
- Hive Security AiTM: https://hivesecurity.gitlab.io/blog/aitm-phishing-mfa-bypass-evilginx/

---

### AU-3 — ACMA SMS Sender ID Register live (1 July 2026)

**Already covered.** `au.ts senderIdFlag` implements the "ignore the Unverified label" detection introduced in D2 / #122. From 1 July 2026, unregistered sender IDs are labelled "Unverified" by carriers; a message that tells the recipient to ignore this label is definitively a scam. The flag fires in the message scorer when the relevant phrase pattern is matched.

**No new proposal.** The register's secondary effect — scammers registering fraudulent Sender IDs to appear "verified" — is a carrier-enforcement problem, not a text-pattern problem. It cannot be detected from message content alone.

**Source:** ACMA media release June 2026: https://www.acma.gov.au/articles/2026-06/sms-sender-id-register-goes-live-help-protect-australians-scams

---

### BASE-3 / AU-4 — Pig-butchering DeFi approval phishing evolution

**Already partially covered.** Base `REQUEST_WORDS` carries `"connect wallet"`, `"approve transaction"`, `"wallet approval"`, `"sign transaction"`. The evolution toward DeFi (DEX-based operations, bridge protocols) does not introduce distinctive new *consumer-facing* lure phrases in SMS/email that differ meaningfully from the existing entries.

**Watchlist.** The DeFi shift is an infrastructure change (attackers moving to permissionless venues to evade ASIC takedowns), not a lure-text change. ASIC wound up 95 pig-butchering-linked companies after ~$35.8M in AU victim losses (ASIC MR 14 Jul 2026). Monitor for new lure phrasing if DeFi-specific bait ("yield farming bonus", "liquidity mining rewards") emerges in AU consumer reporting.

**Sources:**
- ASIC pig-butchering crackdown: https://finance.yahoo.com/news/asic-removes-14-000-scam-183451405.html
- Pig-butchering DeFi shift: https://cryptoimpacthub.com/pig-butchering-ai-scam-reckoning-2026/

---

### GLOBAL-1 — Physical QR code quishing (parking meters / café menus)

**New vector, not detectable from text.** Canstar (February 2026), Bank Australia, CHOICE, and ANZ have all reported cases of physical QR-code stickers placed over legitimate QR codes on parking meters and café menus in Australia. The victim scans the sticker; the destination URL is a fake payment portal.

**Detection gap:** The engine's QR quishing detection (`checkSms()` regex on "scan the qr code") fires on *text prompts*. A victim who scans a physical sticker and pastes the resulting URL into the app gets `checkUrl()` — which already scores the destination by TLD, hosting, and domain heuristics. There is no additional text-side signal.

**Recommendation:** This is a UX/education gap, not a detection rule gap. The app's "QR / quishing" input mode (or the learn/how-it-works page) should mention that physical QR stickers are a live AU threat and that the URL inside the QR code, not the QR image itself, is what to check. No engine change proposed.

**Sources:**
- Canstar quishing Feb 2026: https://www.canstar.com.au/budgeting/qantas-scam-social-media-and-quishing-cons-february-2026/
- Bank Australia QR scams: https://www.bankaust.com.au/blog/qr-code-scams-are-rising-in-australia-heres-how-to-protect-yourself
- CHOICE QR impersonation: https://www.choice.com.au/electronics-and-technology/phones/mobile-phones/articles/qr-code-scams
- ANZ quishing explainer: https://www.anz.com.au/security/types-of-scams/quishing/
- ACSC quishing advisory: https://www.cyber.gov.au/threats/types-threats/quishing

---

## Proposals

*All phrases verified absent from `packages/engine/src/` by grep before filing.*

| ID | Tactic | Region | Target file / array | Priority | FP risk |
|---|---|---|---|---|---|
| D1 | "payments will be suspended" Centrelink/Medicare multi-benefit lure | AU | `packages/engine/src/regions/au.ts` → `URGENCY_PENSION` | **HIGH** | LOW |
| D2 | AI voice-clone post-call pressure phrases | BASE | `packages/engine/src/regions/base.ts` → `URGENCY_VOICE_CLONE` | **HIGH** | MEDIUM |
| D3 | AiTM OAuth2-path heuristic in `checkUrl()` | BASE (URL) | `packages/engine/src/scamDetector.ts` → `checkUrl()` | MEDIUM | MEDIUM |

---

## Implementation notes

### D1 — AU: "payments will be suspended" Centrelink/Medicare lure

**Add to `URGENCY_PENSION` in `packages/engine/src/regions/au.ts`:**

```ts
"payments will be suspended",
"payments will be stopped",
"medicare payments suspended",
"centrelink payments suspended",
"benefit payments will be suspended",
```

`"payments suspended"` alone is not proposed — it is too short and could match legitimate bank SMS ("your direct debit payments suspended"). The longer forms above are each sufficiently specific for consumer SMS context.

**Scoring example:**
`"myGov: Your account has been locked. Confirm identity within 24h or your Medicare and Centrelink payments will be suspended."` →
- `"account has been locked"` urgency (+10) — already in `base.ts`
- `"payments will be suspended"` urgency (+10) — **new**
- `"medicare"` authority (+25) — already in `au.ts`
= 45 → **likely_scam** (before any URL analysis).

Without D1, the same message minus the suspicious URL scores 35 → suspicious. The phrase gets it to the correct threshold immediately.

**FP risk: LOW.** Legitimate government correspondence uses specific reference numbers and the passive past tense ("your payment has been stopped") rather than the conditional future ("will be suspended"). No plausible legitimate AU consumer SMS uses this phrasing.

**Ship with test case:**
```ts
checkSms("Your Medicare and Centrelink payments will be suspended if you do not verify your identity. Click here.", "au")
// → score ≥ 45, verdict: likely_scam
```

**Source:** Services Australia scam advisory (servicesaustralia.gov.au) — Tier 1; Yahoo Finance / Mimecast (au.finance.yahoo.com, Sep 2026) — Tier 2.

---

### D2 — BASE: AI voice-clone post-call pressure phrases

**Add to `URGENCY_VOICE_CLONE` in `packages/engine/src/regions/base.ts`:**

```ts
"as per our phone call",
"as discussed in our call",
"following our recent call",
"as i mentioned on the call",
"confirming what we discussed on the call",
"following up on our call",
```

Do **not** add the bare `"as per our call"` — too short and too common in legitimate business messaging. Require "phone call" or "on the call" to anchor the phrase.

**Scoring example:**
`"As per our phone call, please transfer the outstanding amount to the ATO holding account immediately."` →
- `"as per our phone call"` urgency (+10) — **new**
- `"ato"` authority (+25 in AU pack, +25 in base for govMentions) — already present
- `"transfer"` is not in urgency but `"emergency transfer"` is; `"immediately"` (+10) — already present
= 45 → **likely_scam** in AU context with authority hit.

In BASE (non-AU) context, without the authority hit, the score would be 20 (suspicious) — correct for a consumer receiving this phrasing in a cold SMS.

**FP risk: MEDIUM at the phrase level; effectively LOW in practice.** Each phrase adds +10 (one urgency hit). A sole "as per our phone call" scores 10 (safe). It only tips verdicts when it compounds with a link, authority mention, financial request, or another urgency phrase — which is exactly the compound the lure produces. Document as a known-FP edge case: a legitimate SMS from an accountant saying "as per our phone call, here is your invoice link" would score suspicious (~30) if the link is present. Acceptable tradeoff for a consumer safety tool.

**Source:** vectra.ai 2026 AI scams (Tier 3); safeaus.com.au (Tier 3); trend-rays.com AU AI voice scams (Tier 3). Corroborated across multiple independent sources.

---

### D3 — URL: AiTM OAuth2-path heuristic in `checkUrl()`

**Add to `checkUrl()` in `packages/engine/src/scamDetector.ts`:**

```ts
// AiTM (Adversary-in-the-Middle) phishing kits mimic Microsoft/Google OAuth2
// login flows by using /oauth2/ or /openid/ paths on attacker-controlled domains.
// Legitimate OAuth2 endpoints live on a small set of known auth providers.
// Finding this path on any other host is a strong PhaaS indicator.
const KNOWN_OAUTH_HOSTS = new Set([
  "login.microsoftonline.com", "login.live.com", "accounts.google.com",
  "appleid.apple.com", "auth0.com", "okta.com", "login.okta.com",
  "account.microsoft.com", "login.windows.net",
]);
const hasOauthPath = /\/(oauth2|openid)\//i.test(urlObj.pathname);
if (hasOauthPath && !KNOWN_OAUTH_HOSTS.has(hostname) &&
    !KNOWN_OAUTH_HOSTS.has(hostname.split(".").slice(-2).join("."))) {
  flags.push(
    "OAuth2/OpenID login path on a non-auth-provider domain — a hallmark of Adversary-in-the-Middle phishing kits (Tycoon 2FA, Mamba 2FA, EvilProxy) that proxy Microsoft 365 / Google login pages to steal session cookies"
  );
  score += 20;
}
```

`KNOWN_OAUTH_HOSTS` should be kept narrow. Add only the primary login endpoints, not CDN or API hostnames.

**Scoring example:**
`"https://login-verify.pages.dev/oauth2/v2.0/authorize?client_id=…"` →
- `.pages.dev` hosting (+35) — already present
- `/oauth2/` path on non-auth-provider (+20) — **new**
- `/verify` in path (+10) — already present
= 65 → **likely_scam**.

Without D3, `pages.dev` + `verify` = 45 → `likely_scam`. D3 raises the score and makes the specific AiTM flag visible to the user, explaining *why* the URL is flagged.

**FP risk: MEDIUM.** Self-hosted OAuth2 servers (Keycloak, Hydra, custom Azure AD B2C domains) legitimately use `/oauth2/` paths. Mitigations: (a) `KNOWN_OAUTH_HOSTS` exceptions cover the dominant corporate auth providers; (b) the +20 score alone cannot reach any verdict threshold — it only moves the needle when combined with another signal (suspicious TLD, suspicious hosting, keyword in path). Document the FP case: an intranet portal at `sso.company.com/oauth2/authorize` would score +20 (safe). A corporate IT message with this URL pasted in would be flagged suspicious only if additional signals compound.

**Source:** paubox.com 2026 phishing kits (Tier 2); cybersecuritynews.com July 2026 (Tier 2); ringsafe.in AiTM 2026 (Tier 3); Sekoia AiTM global analysis (Tier 2).

---

## Watchlist / deferred

| Item | Status | Notes |
|---|---|---|
| Origin Energy breach spear-phishing | **MONITORING** | Brand already in engine; breach enables personalised lures but no new distinct phrase identified. Promote if "recent security incident" / "data breach notification" phrasing confirmed in AU consumer reports. |
| Physical QR quishing (parking meters) | **EDUCATION GAP** | Not detectable from URL text alone; flag for learn/how-it-works UX update. |
| AI voice biometric bypass (banks) | **OUT OF SCOPE** | Affects phone-call channel; not detectable from text content. |
| DeFi approval phishing new lure phrases | **MONITORING** | `"yield farming bonus"`, `"liquidity mining rewards"`, `"bridge your tokens"` — not yet confirmed in AU consumer-facing SMS. Promote if documented. |
| myGov multi-benefit compound scoring | **WATCHLIST** | The 270K-email campaign combines Medicare + Centrelink + super + JobSeeker. Compound-signal scoring (score boost when ≥2 AU benefit types appear together) is architecturally distinct from flat keyword lists. Propose as a structural feature if the current additive model proves insufficient. |
| AI deepfake executive BEC | **MONITORING** | Business Email Compromise via AI voice clone; primarily affects enterprise, not consumer SMS. No AU consumer-facing SMS pattern identified. |
| "Hi Mum / Hi Dad" opener | **DEFERRED** | Still no distinct first-contact text-opener pattern documented. |

---

## Region demand signal

Turso DB (`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`) is unavailable in the managed cloud execution environment — egress to the Turso host is blocked. This is a standing gap in the automated sweep; all prior cycles have recorded the same result.

---

## Issues to open manually

(GitHub issue creation failed — see §6 of the routine spec; issues are listed here so nothing is lost.)

### Issue 1: [threat-intel] AU — "payments will be suspended" Centrelink/Medicare lure

**File:** `packages/engine/src/regions/au.ts` → `URGENCY_PENSION`

**Summary:** Add `"payments will be suspended"` and related benefit-payment suspension phrases to `au.ts URGENCY_PENSION`. These are the key discriminating phrases in the active 270K-email Centrelink/Services Australia impersonation campaign (Mimecast / Yahoo Finance, Sep 2026). Verified absent from all engine files.

**Proposed additions:**
```ts
"payments will be suspended",
"payments will be stopped",
"medicare payments suspended",
"centrelink payments suspended",
"benefit payments will be suspended",
```

**Example lure:** *"myGov: Your account has been locked. Confirm identity within 24h or your Medicare and Centrelink payments will be suspended."*

**Scoring impact:** Adds +10 urgency on the distinctive phrase. Combined with existing `"account has been locked"` (+10) and `"medicare"` authority (+25), total = 45 → `likely_scam` without a URL. Correct verdict for this message.

**FP risk:** LOW. Conditional future payment-suspension phrasing has no legitimate use in AU consumer SMS.

**Sources:**
- https://www.servicesaustralia.gov.au/centrelink-impersonation-email-scams (Tier 1)
- https://au.finance.yahoo.com/news/centrelink-warning-as-270000-emails-sent-out-in-attack-related-to-medicare-superannuation-and-tax-benefits-051023567.html (Tier 2)
- Roadmap: `docs/threat-intel/2026-09-25-threat-roadmap.md` § D1

---

### Issue 2: [threat-intel] BASE — AI voice-clone post-call pressure phrases

**File:** `packages/engine/src/regions/base.ts` → `URGENCY_VOICE_CLONE`

**Summary:** The 2026 AI vishing evolution pairs a cloned-voice call (ATO, AFP, bank fraud team) with a follow-up SMS that exploits the victim's memory of the call. The SMS uses "as per our phone call" / "as discussed in our call" phrasing to manufacture false familiarity before requesting a fund transfer or credential submission. These phrases are absent from `URGENCY_VOICE_CLONE` and all other urgency groups.

**Proposed additions:**
```ts
"as per our phone call",
"as discussed in our call",
"following our recent call",
"as i mentioned on the call",
"confirming what we discussed on the call",
"following up on our call",
```

**Example lure:** *"As per our phone call, please transfer the outstanding amount to the ATO holding account immediately. Case reference: ATO-2026-XXXXX."*

**FP risk:** MEDIUM at individual-phrase level; LOW in practice because each hit adds only +10 (safe alone). Only tips verdicts when compounding with authority mention, financial request, or link — exactly the compound the lure produces. Prefer the longer forms ("as per our phone call" not bare "as per our call") to reduce FP rate.

**Sources:**
- https://www.safeaus.com.au/learn/scams-to-watch-2026/ (Tier 3)
- https://trend-rays.com/ai-voice-scams-australia/ (Tier 3)
- https://www.baitandphish.com/blog/ai-voice-clone-phishing-defense (Tier 3)
- Roadmap: `docs/threat-intel/2026-09-25-threat-roadmap.md` § D2

---

### Issue 3: [threat-intel] URL — AiTM OAuth2-path phishing kit heuristic (checkUrl)

**File:** `packages/engine/src/scamDetector.ts` → `checkUrl()`

**Summary:** Tycoon 2FA, Mamba 2FA, EvilProxy, Sneaky 2FA, and Evilginx are the dominant PhaaS kits in 2026. All use `/oauth2/` or `/openid/` paths on attacker-controlled domains to mimic Microsoft 365 / Google Workspace login flows. Real OAuth2 endpoints live on a small set of known auth-provider hostnames. Adding a path-based heuristic to `checkUrl()` catches these kits at the URL level, complementing the existing `SUSPICIOUS_HOSTING` signal.

**Proposed rule (see `§ D3` of roadmap for full code):**
- Check if `pathname` matches `/\/(oauth2|openid)\//i`
- AND hostname is not in `KNOWN_OAUTH_HOSTS` (login.microsoftonline.com, accounts.google.com, etc.)
- → +20 score, flag: "OAuth2/OpenID login path on a non-auth-provider domain — hallmark of AiTM phishing kits"

**FP risk:** MEDIUM. Self-hosted OAuth2 servers use `/oauth2/` paths on non-provider domains. Score is +20 alone (safe). Only tips verdicts when compounding with suspicious hosting (+35), suspicious TLD (+30), or other signals. Document self-hosted OAuth2 as a known FP edge case.

**Sources:**
- https://www.paubox.com/blog/most-popular-phishing-kits-used-in-2026 (Tier 2)
- https://cybersecuritynews.com/top-10-phishing-kits-used-by-hackers/ (Tier 2)
- https://ringsafe.in/aitm-phishing-in-2026-how-evilproxy-mamba-tycoon-and-astaroth-defeat-microsoft-365-mfa/ (Tier 3)
- Roadmap: `docs/threat-intel/2026-09-25-threat-roadmap.md` § D3

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Services Australia Centrelink impersonation advisory (`servicesaustralia.gov.au`) | 1 | D1 AU payments-suspended |
| Yahoo Finance / Mimecast 270K email campaign (`au.finance.yahoo.com`, Sep 2026) | 2 | D1 AU payments-suspended |
| YourLifeChoices Medicare SMS surge (`yourlifechoices.com.au`) | 2 | D1 AU context |
| myGov account-locked scam guide (`safebrowz.com`) | 3 | D1 AU lure text |
| Services Australia scam warning — all generations (`au.finance.yahoo.com`) | 2 | D1 AU corroboration |
| ABC News Origin Energy breach (`abc.net.au`, Jul 2026) | 1 | AU-2 breach context |
| Origin Energy July 2026 customer advisory (`originenergy.com.au`) | 1 | AU-2 breach context |
| MailGuard Origin phishing (`mailguard.com.au`) | 2 | AU-2 phishing template |
| EnergyAustralia phishing (`arnnet.com.au`) | 2 | AU-2 corroboration |
| ACMA SMS Sender ID Register live (`acma.gov.au`, Jun 2026) | 1 | AU-3 already covered |
| ASIC pig-butchering crackdown (`finance.yahoo.com`) | 1 | BASE-3 watchlist |
| CryptoImpactHub pig-butchering DeFi shift (`cryptoimpacthub.com`) | 3 | BASE-3 watchlist |
| vectra.ai AI scams 2026 | 3 | BASE-1 D2 AI vishing |
| SafeAus AU scams 2026 (`safeaus.com.au`) | 3 | BASE-1 D2 AI vishing |
| trend-rays.com AI voice scams AU (`trend-rays.com`) | 3 | BASE-1 D2 context |
| BaitAndPhish AI voice-clone defense (`baitandphish.com`) | 3 | BASE-1 D2 defense context |
| Paubox 2026 popular phishing kits (`paubox.com`) | 2 | D3 AiTM |
| CybersecurityNews top 10 phishing kits Jul 2026 (`cybersecuritynews.com`) | 2 | D3 AiTM |
| RingSafe AiTM 2026 (`ringsafe.in`) | 3 | D3 AiTM URL patterns |
| Sekoia global AiTM analysis (`blog.sekoia.io`) | 2 | D3 AiTM corroboration |
| Hive Security AiTM blog (`hivesecurity.gitlab.io`) | 2 | D3 AiTM corroboration |
| Canstar quishing Feb 2026 (`canstar.com.au`) | 2 | GLOBAL-1 physical QR |
| Bank Australia QR scams (`bankaust.com.au`) | 2 | GLOBAL-1 physical QR |
| CHOICE QR impersonation (`choice.com.au`) | 1 | GLOBAL-1 physical QR |
| ANZ quishing explainer (`anz.com.au`) | 1 | GLOBAL-1 physical QR |
| ACSC quishing advisory (`cyber.gov.au`) | 1 | GLOBAL-1 physical QR |
| Scamwatch ACCC phone spoofing alert (`scamwatch.gov.au`) | 1 | Context only — already covered |
| ACCC thousands of scam sites taken down (`accc.gov.au`) | 1 | Context only |

All direct HTTP fetches to government/consumer-protection domains returned `EGRESS_BLOCKED` in this execution environment. Findings were obtained via `WebSearch` tool. Source URLs are cited as published; content was not directly verified via HTTP this cycle.

---

### Token usage this run

Token usage was unavailable — `/cost` is not exposed in this execution environment, and `npx ccusage@latest` did not return session data for this run. The deep-research workflow consumed approximately 794,999 subagent tokens (from workflow task metadata); main-session tokens were not independently measurable.
