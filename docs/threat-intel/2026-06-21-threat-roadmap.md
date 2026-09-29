# Threat Intelligence Roadmap — 2026-06-21

> **Weekly brief for Just Checking, Mate**
> Detection code lives in `lib/`. This file is research-and-proposals only — no `lib/` files are modified here.

---

## (a) Executive Summary — Top 5 Ship-This-Week Changes

Ranked by **impact × ease** (all are string/regex additions to existing functions):

| # | Recommendation | Why now |
|---|---|---|
| 1 | **Add Linkt + toll road smishing signals** to `checkSms` and `checkUrl` | 79,000+ active messages; Linkt not in any current brand list |
| 2 | **Expand `SUSPICIOUS_TLDS`** with `.cyou`, `.icu`, `.sbs`, `.cfd`, `.bar` | These five now top phishing-abuse TLD rankings; not in current list |
| 3 | **Add loyalty-points expiry phishing keywords + brands** | Active Scamwatch alert; Qantas/Flybuys not detected at all today |
| 4 | **Add ACSC/ASD impersonation + remote access tool keywords** | Cyber.gov.au advisory active; ACSC absent from `govMentions` list |
| 5 | **Flag IPFS-hosted URLs** in `checkUrl` | Decentralised hosting makes takedowns impossible; trivial to detect by hostname/path |

---

## (b) New / Evolved Threats This Week

### 1. Linkt Toll Road Smishing Campaign (CRITICAL — active)

**What:** A coordinated Phishing-as-a-Service campaign has sent >79,000 fake Linkt SMS messages across 40+ sub-campaigns since December 2025, still active as of April 2026. Messages claim an overdue toll payment is pending and threaten fines. Sender-ID spoofing makes messages appear inside existing "Linkt" threads on the victim's phone.

**Novel tactic:** Many messages instruct the recipient to **reply "Y" to activate the link** — this makes iOS and Android treat the sender as a trusted contact, converting inert URL text into a tappable link and bypassing built-in phishing filters.

**AU relevance:** Australia (NSW, VIC, QLD toll users) is a primary target. Linkt, EastLink, and E-Toll are the three impersonated operators.

**IOCs / patterns:**
- Sender names: `Linkt`, `E-Toll`, `EastLink`, `Toll Roads AU`
- Keywords: "unpaid toll", "outstanding toll", "overdue toll", "toll payment due", "final toll notice", "toll fine", "toll invoice"
- Reply prompt: "reply Y", "reply YES to activate", "type Y to proceed"
- Domains: rapidly rotating short-lived `.top`, `.xyz`, `.icu`, `.cyou` domains

**Sources:**
- https://www.techradar.com/computing/cyber-security/scams-in-australia
- https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/
- https://www.techbusinessnews.com.au/news/linkt-branded-toll-road-scams-on-the-rise-despite-telco-sms-scam-measures/
- https://securitybrief.com.au/story/sms-phishing-campaign-targets-australia-new-zealand

---

### 2. Loyalty Points Expiry Phishing (HIGH — Scamwatch advisory issued)

**What:** The ACCC / National Anti-Scam Centre issued a warning that scammers are sending SMS and email claiming customers' loyalty points are about to expire. Victim is directed to a fake brand website to "claim" points, where credentials and/or payment details are harvested.

**Impersonated programs:** Qantas Frequent Flyer / Qantas Points, Coles Flybuys, Telstra Plus, Woolworths Everyday Rewards, Velocity Frequent Flyer.

**AU relevance:** 209 reports in four months; $31.1M lost to phishing broadly in 2025. Scamwatch named Qantas as one of the three most-impersonated loyalty brands in AU.

**IOC patterns:**
- Subject/body: "Your X,XXX points will expire", "points expiring soon", "reward points will be forfeited", "claim your points before they expire"
- Reply bypass: "reply Y to proceed", "copy link into browser"
- Fake domains: `qantas-rewards[.]xyz`, `flybuys-claim[.]top`, `telstra-points[.]icu` (pattern — not fixed domains)

**Sources:**
- https://www.choice.com.au/data-protection-and-privacy/protecting-your-data/data-privacy-and-safety/articles/loyalty-point-customers-warned-over-impersonation-scam
- https://aviationa2z.com/index.php/2026/02/10/qantas-warns-customers-of-phishing-scams/
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-new-scam-targets-customers-of-loyalty-points-programs

---

### 3. Darcula PhaaS — iMessage / RCS Filter Bypass (HIGH — infrastructure shift)

**What:** The "Darcula" Phishing-as-a-Service platform (Chinese-language, distributed via Telegram) now operates >20,000 phishing domains and offers kit templates for AusPost, Linkt, NZ Post, USPS, and dozens of other postal/delivery brands. The key 2026 development is delivery over **iMessage and RCS** rather than SMS — both use end-to-end encryption, so telco SMS filters cannot inspect or block the content.

**Key technique:** Messages sent via iMessage from throw-away Apple IDs, or via RCS from foreign numbers. Victims are often prompted to reply first (making them an iMessage "contact") so the next message's URL becomes tappable.

**AU relevance:** Australia is among the top targeted countries; Australia Post is a named Darcula template.

**IOC patterns:**
- Delivery via iMessage (blue bubble), not SMS (green bubble)
- AusPost impersonation: "Your parcel couldn't be delivered", "invalid postal code", "redelivery fee of $3.50"
- Fee amount: consistently $2–5 AUD to seem low-stakes
- OTP harvesting: after card entry, asks for a one-time passcode "to confirm"

**Sources:**
- https://www.bleepingcomputer.com/news/security/new-darcula-phishing-service-targets-iphone-users-via-imessage/
- https://thehackernews.com/2024/03/darcula-phishing-network-leveraging-rcs.html
- https://www.netcraft.com/blog/darcula-smishing-attacks-target-usps-and-global-postal-services

---

### 4. QR Code Quishing (HIGH — 146% volume increase Q1 2026)

**What:** QR codes embedded in emails or SMS redirect victims to phishing sites, bypassing most link-scanning tools because the URL is encoded in the image, not in text. Separately, physical stickers placed over legitimate QR codes on parking meters, restaurant tables, and public EV chargers redirect payments to scammer-controlled portals.

**AU relevance:** ACSC has published a dedicated "quishing" advisory. ANZ Bank has a public warning page. Attack volume up 51% globally per ACSC data; Australia a prime target due to high QR adoption post-COVID.

**IOC patterns:**
- Email text: "scan the QR code to verify", "scan to update your details", "scan to claim your delivery", "scan to pay"
- Impersonated brands in QR context: myGov, ATO, Medicare, Services Australia
- Physical: QR stickers over parking meter, EV charger, restaurant payment

**Sources:**
- https://www.cyber.gov.au/threats/types-threats/quishing
- https://www.anz.com.au/security/types-of-scams/quishing/
- https://scamwatchhq.com/quishing-qr-code-phishing-surge-2026/
- https://www.acronis.com/en/blog/posts/qr-code-phishing-evasive-threats-2026/

---

### 5. ACSC / ASD Impersonation (Remote Access Scam) (HIGH — cyber.gov.au advisory)

**What:** Scammers call or email claiming to be from the ASD's Australian Cyber Security Centre (ACSC). They claim the victim's computer has malware and guide them to download TeamViewer or AnyDesk (legitimate remote access tools) to "fix" it. Once connected, they open online banking and drain accounts.

**AU relevance:** ACSC has issued multiple advisories. A second vector is phishing emails with the ACSC logo asking recipients to download a "free antivirus" program.

**IOC patterns:**
- Sender/caller claim: "ACSC", "ASD", "Australian Cyber Security Centre", "Australian Signals Directorate"
- Script keywords: "malware detected on your device", "your computer has been compromised", "download TeamViewer", "download AnyDesk", "remote access", "let us connect to your computer"
- Email subject: "ACSC Security Alert — Action Required"

**Sources:**
- https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/email-scammers-impersonating-asds-acsc
- https://www.cyber.gov.au/about-us/alerts/phone-and-email-scammers-impersonating-asdacsc
- https://www.itnews.com.au/news/rat-scammers-pose-as-the-australian-cyber-security-centre-559494

---

### 6. High-Abuse New TLDs (MEDIUM — ongoing / expanding)

**What:** Domain registrars offering cheap registrations in new generic TLDs have consistently topped phishing abuse rankings. Five TLDs now prominent that the app does not detect:

| TLD | Abuse notes |
|-----|-------------|
| `.cyou` | "See you" branding; Shortdot SA; top phishing abuse TLD |
| `.icu` | Very high abuse in phishing and malware campaigns |
| `.sbs` | Also Shortdot; consistently abused |
| `.cfd` | Shortdot managed; "Call For Deals" — heavily abused |
| `.bar` | 70% of all registered domains reported malicious |

**Sources:**
- https://blog.cloudflare.com/top-level-domains-email-phishing-threats/
- https://www.cybercrimeinfocenter.org/top-20-tlds-by-malicious-phishing-domains
- https://www.linkedin.com/posts/any-run_phishing-tlds-malicious-activity-7333507517546758144-xT9C

---

### 7. IPFS-Hosted Phishing (MEDIUM — evasion technique)

**What:** Scammers host phishing pages on IPFS (InterPlanetary File System) — a decentralised peer-to-peer network. Because content is replicated across nodes, there is no central authority to send takedown requests to. Public gateways like `ipfs.io`, `dweb.link`, `cloudflare-ipfs.com`, and `w3s.link` serve the content over normal HTTPS.

**AU relevance:** Global technique reaching AU users. IPFS phishing campaigns increasingly impersonate banks and government portals.

**IOC patterns:**
- URL hostnames: `ipfs.io`, `dweb.link`, `cloudflare-ipfs.com`, `w3s.link`, `gateway.pinata.cloud`
- URL path pattern: `/ipfs/Qm[a-zA-Z0-9]{44}` or `/ipfs/bafy[a-z0-9]+`

**Sources:**
- https://www.levelblue.com/blogs/spiderlabs-blog/ipfs-the-new-hotbed-of-phishing/
- https://www.ctm360.com/blogs/phishing-campaigns-abusing-ipfs

---

### 8. AI-Powered Voice Cloning ("Grandparent Scam" Evolution) (MEDIUM — watchlist)

**What:** Scammers sample a family member's voice from social media (3–10 seconds is sufficient) and use AI voice cloning to impersonate them in phone calls. Common scenario: "Gran, it's [name], I've been in an accident, please send money, don't tell mum." CommBank and other AU banks have warned customers. AI voice replicas are now indistinguishable to most people.

**Scope:** AI-enhanced scams surged 1,210% in 2025. Projected losses could reach $40B globally by 2027. AU couple lost $2.5M in one AI-assisted investment scam.

**Detectability:** Limited in a text-based tool, but supporting text signals (e.g., "I've been in an accident", "don't tell anyone", "send money urgently", "Western Union", "wire transfer") can contribute to score.

**Sources:**
- https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
- https://news.trendmicro.com/2026/04/16/ai-voice-cloning/

---

### 9. Pig Butchering / Fake Crypto Platform Evolution (MEDIUM)

**What:** The investment scam landscape has evolved two new technical twists in 2026:

1. **Mirror Dashboard platforms** — fake crypto exchanges that look functional, show inflated paper profits, and are sometimes available on app stores. Victims are allowed to withdraw small amounts to build trust before being asked to "invest more" and then exit-scammed.

2. **Approval phishing** — instead of asking victims to wire money, scammers manipulate them into signing an Ethereum wallet permission that grants spending control to the attacker. The wallet can then be drained silently weeks later.

**AU relevance:** ASIC has warned about fake crypto trading platforms. Task-based job scams recruiting on WhatsApp/Telegram are a primary recruitment funnel for pig butchering.

**IOC patterns:**
- Recruitment texts: "join our trading group", "stock tips group", "I earn $500/day from home"
- Platform signals: "crypto top-up required", "recharge your account", "wallet approval", "connect wallet", "sign this transaction"
- Task job signals: "rate products online", "simple tasks $50/hr", "flexible work from home"

**Sources:**
- https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/
- https://ethicalassetsolutions.com/blog/pig-butchering-scam-2026-evolution/
  — domain stopped resolving by 2026-09-29; retired in the registry. The entry's
  other source remains live, so the IOCs above keep a working citation.

---

### 10. Immigration / Visa Application Scams (MEDIUM)

**What:** Fraudulent websites mimicking the Department of Home Affairs immigration portal charge $150–400 AUD for fake Working Holiday Visa "processing services". A separate vector uses fake email addresses with the `.pn` (Pitcairn Islands) TLD to appear semi-official (e.g., `immi@govt.au.pn`).

**AU relevance:** Primarily targeting international visitors, students, and migrants. ABF and Home Affairs have issued warnings.

**IOC patterns:**
- TLD abuse: `.pn` (Pitcairn) in sender domain (e.g. `australia@immigrationapproval.com.au.pn`)
- Brand impersonation in domain: "homeaffairs", "dibp", "immi", "australiavisa"
- Keywords: "visa approval", "visa processing fee", "working holiday visa", "skilled migration", "sponsorship visa"

**Sources:**
- https://immi.homeaffairs.gov.au/help-support/visa-scams
- https://www.noborders-group.com/news/Warning-Over-Scam-Immigration-Calls-and-Email-in-Australia

---

### 11. ACCC Phone Number Spoofing (LOW-MEDIUM)

**What:** Scamwatch issued an alert that scammers are spoofing real ACCC phone numbers (including 1300 302 502) to lend credibility to investment or prize scams.

**AU relevance:** Damages ACCC's own ability to be trusted as a scam-reporting body.

**IOC:** Callers claiming to be from "Scamwatch", "the ACCC", or "the consumer watchdog" asking for bank details or investment in a government-approved scheme.

**Sources:**
- https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers

---

## (c) Proposed Detection Improvements

| # | Tactic | Proposed Rule | Target File | FP Risk | Priority |
|---|--------|---------------|------------|---------|----------|
| D1 | Linkt / toll road smishing | Add `"linkt"`, `"eastlink"`, `"e-toll"` to `govMentions` array in `checkSms()`; add to `auBrands` typosquatting list in `checkUrl()` | `lib/scamDetector.ts` | Low — brand-name specific | HIGH |
| D2 | Toll road urgency keywords | Add to `URGENCY_WORDS`: `"unpaid toll"`, `"outstanding toll"`, `"overdue toll"`, `"toll payment"`, `"toll fine"`, `"toll invoice"`, `"final toll notice"` | `lib/scamDetector.ts` | Low | HIGH |
| D3 | "Reply Y to activate" bypass | Add pattern to `checkSms()`: `/reply\s*['""']?[Yy](es)?\b.*link\|reply\s+[Yy]\s+to\s+(activate\|proceed\|access)/i` — flag as `"'Reply Y' trick to bypass phone scam filters"` (+25 score) | `lib/scamDetector.ts` | Low — very specific phrase | HIGH |
| D4 | Suspicious TLDs expansion | Add to `SUSPICIOUS_TLDS`: `".cyou"`, `".icu"`, `".sbs"`, `".cfd"`, `".bar"`, `".beauty"`, `".hair"`, `".makeup"` | `lib/scamDetector.ts` | Low — high-abuse TLDs with minimal legit use in AU | HIGH |
| D5 | Loyalty program brands | Add to `IMPERSONATED_BRANDS` in `emailHeaders.ts`: `"qantas"`, `"frequent flyer"`, `"flybuys"`, `"everyday rewards"`, `"velocity"`, `"telstra plus"` | `lib/emailHeaders.ts` | Low | HIGH |
| D6 | Loyalty points expiry keywords | Add to `REWARD_WORDS` in `scamDetector.ts`: `"points will expire"`, `"points expiring"`, `"reward points"`, `"loyalty points"`, `"points forfeited"` | `lib/scamDetector.ts` | Low-Medium — "reward points" could appear in legit comms | HIGH |
| D7 | ACSC/ASD impersonation | Add to `govMentions` in `checkSms()`: `"acsc"`, `"asd"`, `"cyber security centre"`, `"australian signals directorate"` | `lib/scamDetector.ts` | Low | HIGH |
| D8 | Remote access tool keywords | Add to `REQUEST_WORDS`: `"teamviewer"`, `"anydesk"`, `"remote access"`, `"remote desktop"`, `"download software"` | `lib/scamDetector.ts` | Low-Medium — IT support contexts; acceptable for scam detector | HIGH |
| D9 | IPFS-hosted phishing URLs | In `checkUrl()`, check if hostname is in `["ipfs.io","dweb.link","cloudflare-ipfs.com","w3s.link","gateway.pinata.cloud","nftstorage.link"]` OR path matches `/\/ipfs\/[A-Za-z0-9]{20,}/`; flag `"IPFS-hosted content — takedown-resistant phishing infrastructure"` (+40 score) | `lib/scamDetector.ts` | Low — minimal legit AU user traffic to IPFS gateways | HIGH |
| D10 | AusPost parcel delivery in SMS | Add to `govMentions` in `checkSms()`: `"australia post"`, `"auspost"`. Add keywords to `URGENCY_WORDS`: `"parcel held"`, `"delivery failed"`, `"couldn't be delivered"`, `"redelivery fee"`, `"invalid postal code"` | `lib/scamDetector.ts` | Low | MEDIUM |
| D11 | QR code scanning signals | Add new keyword block in `checkCustom()` (and pass-through from a future `checkQr()` when `type === "qr"`): phrases `"scan the qr code"`, `"scan this code"`, `"scan to verify"`, `"scan to update"`, `"scan to claim"` flagged as `"QR code scan prompt — quishing attacks use QR codes to hide malicious URLs"` (+20 score) | `lib/scamDetector.ts` | Low | MEDIUM |
| D12 | Pig butchering / approval phishing | Add to `REQUEST_WORDS`: `"connect wallet"`, `"approve transaction"`, `"wallet approval"`, `"sign transaction"`, `"recharge your account"`, `"top up your account"` | `lib/scamDetector.ts` | Low | MEDIUM |
| D13 | Fake job task scam signals | Add new composite check in `checkSms()` — trigger when ≥2 of these appear: `"rate products"`, `"simple tasks"`, `"earn $"` + number, `"flexible work from home"`, `"no experience required"`, `"online tasks"`, `"work from home"` combined with request for crypto/recharge | `lib/scamDetector.ts` | Medium — legitimate job ads may use some phrases; use composite, not individual | MEDIUM |
| D14 | Immigration brand impersonation | Add to `auBrands` typosquatting check: `"homeaffairs"`, `"dibp"`, `"immi"` (beyond existing `homeaffairs.gov.au` in LEGIT list). Also flag `.pn` TLD in `SUSPICIOUS_TLDS` | `lib/scamDetector.ts` | Low | MEDIUM |
| D15 | High-scam countries expansion in phoneIntel | Add to `HIGH_SCAM_COUNTRY_CODES`: `"91": "India"`, `"86": "China"`, `"63": "Philippines"` — three of the highest-volume scam-call origination countries targeting AU, currently absent from the list | `lib/phoneIntel.ts` | Medium — large volume of legitimate calls from India/China/Philippines; score must remain moderate (not `very_high`) and flag must note legitimate callers exist | MEDIUM |
| D16 | LinkedIn Smart Link / open redirect abuse | In `checkUrl()`, detect known redirect-abusing URL patterns: `lnkd.in`, `*.linkedin.com/slink`, Google AMP Cache (`cdn.ampproject.org`), and URLs where the primary hostname is legitimate but query params contain a full URL — flag as `"Trusted service used as a redirect — real destination may be malicious"` (+15 score) | `lib/scamDetector.ts` | Medium — many legit LinkedIn tracking links exist; score addition must remain low | LOW |
| D17 | AI voice clone keyword signals | Add to `URGENCY_WORDS`: `"i've been in an accident"`, `"don't tell mum"`, `"don't tell anyone"`, `"western union"`, `"wire transfer"` — these surface in text descriptions of voice scam follow-ups | `lib/scamDetector.ts` | Medium — some may appear in unrelated urgent messages | LOW |

---

## (d) Lower-Priority / Watchlist Items

- **OAuth redirect abuse** (Microsoft, Google): Malicious OAuth flows redirect via legitimate Microsoft/Google auth endpoints. Hard to detect without evaluating the redirect chain end-to-end. URL expansion already handles some of this — no immediate action required.

- **Darcula PhaaS template updates**: The kit is updated continuously. No single IOC pattern is stable. Best addressed by keeping URLhaus blocklist fresh (already implemented) rather than heuristics.

- **SIM-swap fraud**: Primarily a carrier-side issue; limited signal in text/URL/phone analysis. Watchlist only.

- **Deepfake video scams**: Investment scams using fake celebrity endorsement videos (A.I. Elon Musk, etc.). No text-side detection mechanism available in current architecture.

- **Fake e-commerce stores** (`.store`, `.shop` TLDs): Higher FP risk than the TLDs proposed in D4 — many legitimate retailers use these. Monitor ACSC advisories before adding.

- **Australia Post OTP harvesting**: The multi-step credential → card → OTP flow is a UI pattern, not detectable in a single message snippet. Watchlist pending.

---

## (e) Full Source List

1. Scamwatch — Loyalty points scam alert: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-new-scam-targets-customers-of-loyalty-points-programs
2. Scamwatch — ACCC phone spoofing alert: https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-accc-phone-numbers-spoofed-by-scammers
3. Cyber.gov.au — ACSC impersonation email: https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/email-scammers-impersonating-asds-acsc
4. Cyber.gov.au — ACSC impersonation phone: https://www.cyber.gov.au/about-us/alerts/phone-and-email-scammers-impersonating-asdacsc
5. Cyber.gov.au — Quishing advisory: https://www.cyber.gov.au/threats/types-threats/quishing
6. TechRadar — Scams in Australia June 2026: https://www.techradar.com/computing/cyber-security/scams-in-australia
7. SecurityBrief AU — SMS phishing campaign AU/NZ: https://securitybrief.com.au/story/sms-phishing-campaign-targets-australia-new-zealand
8. Cybermate — Linkt toll invoice scam: https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/
9. Tech Business News — Linkt SMS scams: https://www.techbusinessnews.com.au/news/linkt-branded-toll-road-scams-on-the-rise-despite-telco-sms-scam-measures/
10. CHOICE — Loyalty program scam warning: https://www.choice.com.au/data-protection-and-privacy/protecting-your-data/data-privacy-and-safety/articles/loyalty-point-customers-warned-over-impersonation-scam
11. Aviation A2Z — Qantas phishing warning: https://aviationa2z.com/index.php/2026/02/10/qantas-warns-customers-of-phishing-scams/
12. BleepingComputer — Darcula iMessage PhaaS: https://www.bleepingcomputer.com/news/security/new-darcula-phishing-service-targets-iphone-users-via-imessage/
13. The Hacker News — Darcula RCS/iMessage: https://thehackernews.com/2024/03/darcula-phishing-network-leveraging-rcs.html
14. Netcraft — Darcula smishing USPS/postal: https://www.netcraft.com/blog/darcula-smishing-attacks-target-usps-and-global-postal-services
15. ANZ — Quishing advisory: https://www.anz.com.au/security/types-of-scams/quishing/
16. ScamWatchHQ — Quishing 146% surge: https://scamwatchhq.com/quishing-qr-code-phishing-surge-2026/
17. Acronis — QR code phishing 2026: https://www.acronis.com/en/blog/posts/qr-code-phishing-evasive-threats-2026/
18. CNN — AI voice cloning scams: https://www.cnn.com/2026/05/29/tech/ai-voice-cloning-scams-protect-yourself
19. Trend Micro — AI voice cloning: https://news.trendmicro.com/2026/04/16/ai-voice-cloning/
20. ForteClaim — Crypto scam crisis 2026: https://forteclaim.com/crypto-scam-crisis-escalates-in-2026-ai-fraud-pig-butchering-networks-and-billions-lost-worldwide/
21. Ethical Asset Solutions — Pig butchering evolution: https://ethicalassetsolutions.com/blog/pig-butchering-scam-2026-evolution/ (dead link — domain stopped resolving by 2026-09-29; retired in the registry)
22. Cloudflare — TLD phishing abuse: https://blog.cloudflare.com/top-level-domains-email-phishing-threats/
23. Cybercrime Info Center — Top phishing TLDs: https://www.cybercrimeinfocenter.org/top-20-tlds-by-malicious-phishing-domains
24. LevelBlue — IPFS phishing hotbed: https://www.levelblue.com/blogs/spiderlabs-blog/ipfs-the-new-hotbed-of-phishing/
25. CTM360 — IPFS phishing campaigns: https://www.ctm360.com/blogs/phishing-campaigns-abusing-ipfs
26. SANS ISC — Redirect use in phishing 2026: https://isc.sans.edu/diary/32870
27. Hacker News — OAuth redirect abuse: https://thehackernews.com/2026/03/microsoft-warns-oauth-redirect-abuse.html
28. Department of Home Affairs — Visa scams: https://immi.homeaffairs.gov.au/help-support/visa-scams
29. No Borders Group — Immigration scam warning AU: https://www.noborders-group.com/news/Warning-Over-Scam-Immigration-Calls-and-Email-in-Australia
30. iTnews — ACSC impersonation RAT scam: https://www.itnews.com.au/news/rat-scammers-pose-as-the-australian-cyber-security-centre-559494

---

## GitHub Issues Created (run 2 — 2026-06-21)

The following 6 HIGH-priority issues were opened automatically (in addition to #46-#51 from the earlier session today):

- **#53** — [threat-intel] Add Linkt/EastLink/E-Toll to brand detection lists (auBrands + govMentions)
- **#54** — [threat-intel] Detect "Reply Y to activate link" smishing filter-bypass tactic
- **#55** — [threat-intel] Add ACSC/ASD impersonation + remote access tool keywords
- **#56** — [threat-intel] Flag IPFS-hosted URLs in checkUrl (takedown-resistant phishing)
- **#57** — [threat-intel] Loyalty points expiry keywords + Flybuys/Everyday Rewards brand detection
- **#58** — [threat-intel] Expand SUSPICIOUS_TLDS: .cyou .sbs .cfd .bar .beauty (Shortdot / ICANN 2026 abuse)

---

## Full Issue Body Reference

Reproduced below for traceability. Issues #53-#58 are already open on GitHub.

---

### Issue 1: [threat-intel] Linkt / toll road smishing signals

**Body:**

**Summary:** A coordinated campaign has sent >79,000 fake Linkt SMS messages since Dec 2025 (still active). Linkt and related toll brands are not detected anywhere in the current codebase.

**Proposed changes to `lib/scamDetector.ts`:**

1. Add to `govMentions` array in `checkSms()`:
   ```
   "linkt", "eastlink", "e-toll", "etoll"
   ```
2. Add to `auBrands` array in `checkUrl()`:
   ```
   "linkt", "eastlink", "etoll"
   ```
3. Add to `URGENCY_WORDS`:
   ```
   "unpaid toll", "outstanding toll", "overdue toll", "toll payment", "toll fine", "toll invoice", "final toll notice"
   ```

**Example IOC messages:**
- `"Linkt: You have an unpaid toll of $12.40. Pay now or face a $150 fine: [link]"`
- `"Your toll road account has an overdue balance. Pay by Friday to avoid penalties."`

**False-positive risk:** Low — toll-specific language combined with brand names is highly specific.

**Sources:** https://cybermate.com.au/2026/02/20/the-toll-invoice-scam-thats-catching-aussies-off-guard-and-why-smart-people-still-fall-for-it/ | https://securitybrief.com.au/story/sms-phishing-campaign-targets-australia-new-zealand

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md

---

### Issue 2: [threat-intel] "Reply Y to activate link" smishing bypass detection

**Body:**

**Summary:** Both the Linkt campaign and loyalty phishing scams use a novel tactic: instructing recipients to reply "Y" or "YES" before clicking a link. This converts the sender to a trusted contact on iOS/Android, making the link tappable and bypassing built-in phishing filters.

**Proposed change to `lib/scamDetector.ts` — `checkSms()`:**

Add a new detection block after the URL check:
```typescript
const replyBypass = /reply\s*['"']?\s*[Yy](es)?\b.{0,30}(link|activat|access|proceed)/i.test(text)
  || /type\s+[Yy]\s+to\s+(proceed|activat|access)/i.test(text)
  || /send\s+[Yy](es)?\s+to\s+get\s+(the\s+)?(link|access)/i.test(text);
if (replyBypass) {
  flags.push("'Reply Y' trick detected — scammers use this to bypass phone spam filters and make links tappable");
  score += 25;
}
```

**False-positive risk:** Very low — this is a highly specific phishing tactic not used in legitimate marketing.

**Sources:** https://www.techbusinessnews.com.au/news/linkt-branded-toll-road-scams-on-the-rise-despite-telco-sms-scam-measures/

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md

---

### Issue 3: [threat-intel] Expand SUSPICIOUS_TLDS with high-abuse 2026 entries

**Body:**

**Summary:** Five TLDs now top global phishing-abuse rankings but are absent from `SUSPICIOUS_TLDS` in `lib/scamDetector.ts`. These are used in active AU-targeting campaigns (Linkt smishing uses `.icu`, `.cyou`, `.sbs` domains).

**Proposed change to `lib/scamDetector.ts`:**

Add to `SUSPICIOUS_TLDS`:
```typescript
".cyou", ".icu", ".sbs", ".cfd", ".bar", ".beauty", ".hair", ".makeup"
```

**Evidence of abuse:**
- `.bar`: 70% of registered domains reported malicious (Cloudflare)
- `.cyou`, `.sbs`, `.cfd`, `.icu`: managed by Shortdot SA; consistently top phishing-abuse TLD reports (ANY.RUN, Unit 42)
- `.beauty`, `.hair`, `.makeup`: ICANN 2026 expansion TLDs with immediate phishing adoption

**False-positive risk:** Low — these TLDs have negligible legitimate Australian business use.

**Sources:** https://blog.cloudflare.com/top-level-domains-email-phishing-threats/ | https://www.cybercrimeinfocenter.org/top-20-tlds-by-malicious-phishing-domains

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md

---

### Issue 4: [threat-intel] Loyalty program phishing — brands + expiry keywords

**Body:**

**Summary:** Scamwatch issued an advisory for loyalty-points phishing impersonating Qantas, Coles Flybuys, Telstra Plus, and Woolworths Everyday Rewards. None of these brands appear in the current detection codebase.

**Proposed changes:**

1. Add to `IMPERSONATED_BRANDS` in `lib/emailHeaders.ts`:
   ```typescript
   "qantas", "frequent flyer", "flybuys", "everyday rewards", "velocity", "telstra plus"
   ```
2. Add to `REWARD_WORDS` in `lib/scamDetector.ts`:
   ```typescript
   "points will expire", "points expiring", "reward points", "loyalty points", "points forfeited", "claim your points"
   ```

**Example IOC:**
- `"Qantas: Your 12,846 Rewards points will expire at 03 February 2026. GO get your gift before they're gone!"`
- `"Flybuys: Your loyalty points are expiring in 3 days. Click here to claim: [link]"`

**False-positive risk:** Low-Medium for "reward points" alone; Medium risk drops when combined with urgency/link signals (which the scorer already compounds).

**Sources:** https://www.choice.com.au/data-protection-and-privacy/protecting-your-data/data-privacy-and-safety/articles/loyalty-point-customers-warned-over-impersonation-scam | https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-new-scam-targets-customers-of-loyalty-points-programs

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md

---

### Issue 5: [threat-intel] ACSC/ASD impersonation + remote access tool keywords

**Body:**

**Summary:** The ACSC has issued advisories about scammers impersonating the ASD's Australian Cyber Security Centre via phone and email. "ACSC" and "ASD" are absent from `govMentions` in `checkSms()`. Requests to download remote access tools (TeamViewer, AnyDesk) are not in `REQUEST_WORDS`.

**Proposed changes to `lib/scamDetector.ts`:**

1. Add to `govMentions` array in `checkSms()`:
   ```typescript
   "acsc", "asd", "cyber security centre", "australian signals directorate", "cyber.gov.au"
   ```
2. Add to `REQUEST_WORDS`:
   ```typescript
   "teamviewer", "anydesk", "remote access", "remote desktop", "download software", "install software", "give us access"
   ```

**Example IOC:**
- Call: *"This is the ACSC — we've detected malware on your device. Please download TeamViewer so we can help."
- Email subject: *"ACSC Security Alert — Malware Detected on Your Account"

**False-positive risk:** Low — IT/security vendor comms occasionally mention remote access tools, but in an AU consumer scam context the combination of ACSC impersonation + RAT download is unambiguous.

**Sources:** https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories/email-scammers-impersonating-asds-acsc | https://www.itnews.com.au/news/rat-scammers-pose-as-the-australian-cyber-security-centre-559494

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md

---

### Issue 6: [threat-intel] IPFS-hosted phishing URL detection

**Body:**

**Summary:** Phishing operators increasingly host credential-harvesting pages on IPFS (InterPlanetary File System) because takedowns are impossible — content is replicated across thousands of nodes with no central authority. Public gateways serve this content over normal HTTPS, making URLs appear benign.

**Proposed change to `lib/scamDetector.ts` — `checkUrl()` function:**

Add after the IP-address check block:
```typescript
const IPFS_GATEWAYS = new Set([
  "ipfs.io", "dweb.link", "cloudflare-ipfs.com",
  "w3s.link", "gateway.pinata.cloud", "nftstorage.link",
  "ipfs.fleek.co",
]);
if (IPFS_GATEWAYS.has(hostname) || /\/ipfs\/[A-Za-z0-9]{20,}/.test(urlObj.pathname)) {
  flags.push("IPFS-hosted content — uses a decentralised network that can't be taken down; common for phishing pages");
  score += 40;
}
```

**False-positive risk:** Low — AU consumer and government websites do not use IPFS gateways. NFT/Web3 developers might encounter this, but scam scores compound correctly with other signals.

**Sources:** https://www.levelblue.com/blogs/spiderlabs-blog/ipfs-the-new-hotbed-of-phishing/ | https://www.ctm360.com/blogs/phishing-campaigns-abusing-ipfs

**Roadmap:** docs/threat-intel/2026-06-21-threat-roadmap.md
