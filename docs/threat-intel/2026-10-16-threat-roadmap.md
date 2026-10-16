# Threat-intelligence roadmap — 2026-10-16

*Sweep period: 2026-10-11 – 2026-10-16 (5 days since the last sweep). Input:
the 🧭 Weekly sweep brief, issue #447 (65 items from 10 of 14 feeds). Next
sweep due on or around 2026-10-23.*

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index|languageCoverage)\.ts$' | wc -l`
→ **27 region packs**, unchanged from 2026-10-11. (The 2026-10-11 command
without `languageCoverage` now prints 28: that file, added in #461, is a
measurement module, not a pack.) `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | `rest-of-world.ts` fallback |

`npx tsx scripts/check-research-freshness.ts --plan 5` names this cycle's
regions: **weekly** AU GB US NZ CA IE, **rotation IT JP KR MX NG**. That is
*not* the rotation the brief prints (AE BR ES FR ID) — see *Corrections*,
item 1. This sweep follows the live plan.

**Detection changes since the 2026-10-11 sweep** (`git log` on
`packages/detect/src/`):

| Commit | Ships |
|---|---|
| `133c146` (#448) | 2026-10-11 D1 — AE agency → WhatsApp/Telegram hand-off (closes #445) |
| `27e1137`, `1881cc4`, `61926b9`, `2f8feee`, `4387460`, `243a07f` (#453–#460) | Signal-registry refactors: phone channel, ClickFix, splice rule, family impersonation, task payment now declare per-channel weights. Observationally identical scores; no threat-intel proposal |
| `80faf6f` (#456) | Doc-comment repairs in the detector |
| `523721f` (#461) | `languageCoverage.ts` — a derived language axis beside `coverage`. Nothing in the scoring path changed |

Nothing from 2026-10-11 is outstanding. **D3** (AU `netbank` typosquat) and
**D8** (IE Fixed Charge Notice) from 2026-10-06 are still unfiled and
unshipped. This sweep found new evidence for D3, which is promoted below as
D2. D8 is carried forward unchanged.

I read `types.ts`, `base.ts` and the signal modules (`signals/*.ts`), and
`scamDetector.ts` in full: `checkUrl`, `checkSms`, `checkEmail`,
`checkCustom`, the coverage downgrade and `analyzeContent`. I also read the six
`full`/`partial` packs (au/gb/us/nz/ie/ca) and this cycle's rotation packs
(it/jp/kr/mx/ng) in full, plus the authority lists of last cycle's rotation
(ae/br/es/fr/id).

**How the scores below were measured.** A throwaway script outside the repo
imports `checkSms`, `checkUrl`, `checkEmail` and `checkCustom` from
`packages/detect/src/scamDetector.ts` and prints the verdict, score and every
signal row for each lure, under the stated region. Nothing it measured was
committed. Every figure in this file is a measured output of the engine at
`e036f2d`.

---

## Executive summary

**Two HIGH findings this cycle. Neither comes from the brief.** The brief's
65 items are almost all infrastructure, vulnerability or arrest news. The two
findings came from re-measuring claims earlier sweeps made without
measuring them.

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | **D1 — "Unrecognised transaction, call this number" SMS** | `base` + `scamDetector.ts` | **safe 0** on 7 of 12 lures (AU, GB, IE, US); none above 30 | Scamwatch's fake-purchase callback alert says these arrive **by text**. GB bank variants ("a direct debit has been set up… call 0800…") recur through 2026. Two earlier sweeps recorded the SMS form as covered without measuring it, and it is not (see *Corrections*) |
| 2 | **D2 — AU `netbank` typosquat** (2026-10-06 D3, promoted) | `regions/au.ts` | **safe 0** (`netbank-logon.com`) | New tier-1 own-brand evidence: CommBank's Sep 2026 "Fake NetBank logon pages" alert says the pages are sent **by email and text link**, not only via social ads. The pasted URL is exactly the thing the rule scores |
| 3 | D3 — US midterm voter-registration lure | `regions/us.ts` | safe 15 | FBI PSA I-101526-3-PSA (15 Oct 2026). MEDIUM: genuine get-out-the-vote texts share the wording. Time-sensitive: the election is 3 Nov |
| 4 | D4 — MX `caseSensitiveAuthorities` lists two dead entries | `regions/mx.ts`, a test | `"SAT: …"` unknown 15 vs full name 40 | Pack-invariant drift, found while reading the rotation pack. MEDIUM |

D1 and D2 are filed (see *Issues opened*). D3, D4 and the carried D8 are
left for human triage, per the HIGH-only threshold.

**Region demand:** not measured this cycle. See §Region demand signal.

---

## Corrections — leads and claims that did not hold up

Recorded per the archive's discipline: a lead counts only after its *date*
is checked, and a coverage claim counts only after it is *measured*.

1. **The brief's window and rotation are a cycle stale.** Issue #447 was
   generated on 2026-10-12 against "the last sweep (2026-10-06)", because the
   2026-10-11 roadmap (#446) did not merge until 2026-10-16. Two
   consequences:
   - All 65 items are dated 2026-10-06 – 10-11, which is the *previous*
     sweep's window.
   - The rotation printed (AE BR ES FR ID, "never recorded") is the one
     2026-10-11 already researched. The live plan, once that file is on
     `main`, is IT JP KR MX NG.

   The items were still triaged (see *Brief triage*) because 2026-10-11 did
   not cite any of them. AE/BR/ES/FR/ID are marked `skipped` below: they were
   researched five days ago, well inside the 42-day `minimal` window.
2. **2026-09-27 (and 2026-10-06 by reference): "'You didn't buy this — call
   to reverse the payment' SMS … already reach `suspicious`. No gap."** This
   is wrong when measured. The generic call rule matches only `call
   back|now|us|this number`. The lure says "call 1800 954 112 to cancel",
   which matches none of them, and bank names are deliberately absent from
   `BRAND_MENTIONS`. The Scamwatch-shaped lure scores **safe 0**. The coverage
   that does exist is the *email* TOAD composite in `checkEmail`, which never
   runs on an SMS. This became D1.
3. **AFP "More than 5000 Australian victims receive text warning over romance
   scam"** surfaced as current in AU search. It is dated **31 January 2025**.
   Not used.
4. **NCSC NZ "Scammers impersonating police to target victims for
   cryptocurrency theft"** and **"NZ cyber agency alerts thousands to malware
   infection"** both carry a "Printed 16 October 2026" line. That is the print
   date. They were published **17 July 2026** and **10 December 2025**. The
   police/seed-phrase lure is covered anyway (measured **likely_scam 70**:
   `seed phrase` request word + agency + link).
5. **Which? "new parking fine scam text"** reads as fresh. It was first
   published September 2024 and refreshed July 2026. GB parking-charge
   phrasing (`penalty charge notice`, `pcn issued`) is already in `gb.ts`. Not
   used.
6. **FraudSMART / Irish press "new direct debit text and phone scam"** dates to
   **October 2024**. It is cited under D1 only as background showing the
   pattern is long-running in IE, never as this cycle's evidence.
7. **Search-index ages are unreliable.** The Scamwatch fake-purchase callback
   alert was returned as "1 day old". It dates to June 2026 (first cited
   2026-07-26). D1's freshness rests on the GB 2026 reports and on the
   measured gap, not on that alert's date.

---

## Brief triage (#447)

| Bucket | Items | Outcome |
|---|---|---|
| Consumer-facing scam tactic | 4 | MailGuard "Secure Folder" device-code phish; BleepingComputer "Claude ClickFix" via Google Ads; Malwarebytes BlueKit PhaaS; Malwarebytes ccTLD hijack. All measured below; none yields a proposal |
| Breach with likely phishing follow-on | 1 | Malwarebytes ASOS breach update. Watchlisted |
| Vulnerability / patch / exploit kit | 13 | NetScaler, AhsayCBS, NVIDIA DCGM, Atlassian, AnyDesk, Chrome, Android, DarkSword iOS, GitHub Actions, BPFDoor, RMM tools, exposed energy systems, Patch Tuesday. No text-side signal |
| Arrests / law enforcement / state actors | 11 | ShinyHunters (×4), ransomware negotiator (×2), Qilin, Flax Typhoon, seven-nation ASD alert, ARTEX AI bank intrusions, TP-Link suits |
| AI-agent / vendor product / corporate news | 22 | iTnews business items, Cloudflare product posts, Anthropic tooling news, SANS diaries, Help Net product showcases |
| Biometrics / policy | 8 | Biometric Update. Out of scope |
| Feeds failed | — | ACSC RSS (timeout), SecurityBrief AU (406), Security Boulevard (403). ACSC was also unreachable from this environment, so AU used Scamwatch, ATO, CommBank and search instead |

### Measured from the brief

- **MailGuard, "Secure Folder" phish (9 Oct 2026).** A doc-share email
  ("View & Complete Item") leads through a fake Dropbox and DocuSign chain to
  the **genuine** `login.microsoftonline.com` device-code page ("Enter code
  to allow access"). That is OAuth consent capture, the same family as FBI PSA
  "Consent Phishing" (1 Sep 2026). The email as delivered measures **safe
  10**:
  - The device-code wording appears only on Microsoft's real page, never in
    the email.
  - "Document ready for your review and signature" is exactly what genuine
    e-signature mail says.
  - The first hop is a security-gateway rewrite URL
    (`secure-web.cisco.com/<token>/https%3A%2F%2F…`). The nested URL sits in
    the *path*, so the `carriesNestedUrl` query-parameter test does not see
    it.

  No proposal. The email has no text-side tell, and flagging rewritten links
  would hit most enterprise mail. Watchlisted.
- **"Claude ClickFix" via Google Ads → bing.com redirect (BleepingComputer,
  9 Oct 2026).** A fake macOS install page shows Anthropic's genuine `curl
  -fsSL https://claude.ai/install.sh | bash` command. Its copy button puts a
  different command on the clipboard.
  - Pasted page text with a "copy… open Terminal, paste" instruction:
    **likely_scam 58** (macOS ClickFix, +50).
  - The genuine install instruction alone: **safe 8**. That is the right
    outcome: no false positive on real developer docs.

  The swap itself is invisible to any text check, because the visible text is
  the genuine command. No proposal.
- **BlueKit PhaaS (Malwarebytes, 7 Oct 2026).** 97 brands and 176 templates,
  with an SMS sender added in August. No lure wording or path shape is
  published. Monitoring.
- **ccTLD infrastructure hijack, `.gh` / `.sl` / `.as` (Malwarebytes, 8 Oct
  2026).** Registry-level compromise used to mis-issue certificates, with
  Google named. That is an infrastructure attack with no consumer text
  surface, and none of the three TLDs is AU-relevant. Monitoring.

---

## Threats by region

### Australia (`full`) → **D1, D2**

#### AU-1 — "Unrecognised transaction, call this number" SMS → **D1** (BASE)

Scamwatch's fake-purchase callback alert describes messages that "say you
bought something you didn't buy and tell you to call a phone number to stop or
reverse the payment … by text, email, app notification, calendar invitation".
The fake charge is typically $300–$2,000 and the victim is pressed to call
before the money "is taken". The email form has been scored since #102. The
SMS form has not:

| Lure (region) | Verdict |
|---|---|
| "PayPal: You have been charged $1,249.00 for an Apple iPhone 17 order. If you did not make this purchase call 1800 954 112 to cancel." (AU) | **safe 0** |
| "Your order of $689.99 has been processed. Not you? Call 1300 852 447 within 24 hours to reverse the payment." (AU) | safe 10 (urgency only) |
| "Norton renewal: $499.99 will be debited from your account today. To cancel call +61 2 8005 1234" (AU) | **safe 0** |
| "CommBank: A new direct debit has been set up on your account for $249.00. If this wasn't you, call 1800 123 456 to cancel this payment." (AU) | **safe 0** |
| "Your $1,249.00 purchase has been approved. If this was not you, call us on 1800 954 112 immediately." (AU) | suspicious 30 (only because "call **us**" matches the generic rule) |

The same script is running in GB and IE, with banks as the cover:

| Lure (region) | Verdict |
|---|---|
| "Barclays: A new direct debit has been set up on your account to ABC Payments Ltd for £89.99. If you do not recognise this, call 0800 012 3456 to cancel this payment." (GB) | **safe 0** |
| "Barclays: Your credit card application for £1,500 has been approved. If you did not apply call 0800 098 7654." (GB) | safe 15 ("credit card" ask) |
| "A payment of £349.00 to Currys has been authorised on your account. If you don't recognise this payment, call 0161 496 0011." (GB) | **safe 0** |
| "Nationwide: A standing order has been set up on your account. If this was not you please call us on 0203 123 4567." (GB) | suspicious 20 |
| "Barclays: A direct debit has been arranged on your account. If you did not authorise this call 01234 567890 immediately." (GB) | safe 10 (urgency only) |
| "AIB: A new direct debit has been set up on your account. If you did not authorise this please call 01 555 0199." (IE) | **safe 0** |
| "Amazon: Your order for MacBook Pro ($1,899.00) has been placed. If you did not place this order call 1-888-555-0143 to cancel." (US) | **safe 0** |

GB evidence: Which? logged the Barclays/Nationwide "a direct debit / standing
order has been set up … call this number" text on 13 May, 26 Aug and 21 Sep
2026, plus a Barclays "credit card application approved … call" text on 1 Jun
2026. Kent's Fraud Alert System (May 2026) describes the same script: spoofed
sender, new direct debit, call-to-cancel, then a fake bank fraud team.
FraudSMART's IE warning of the same shape dates to October 2024 (see
*Corrections*). That warning states the property the rule rests on: banks do
not put a number to ring in an unexpected-transaction text.

**Not covered by an existing composite.** Checked each one:
- The email TOAD rule needs a callback *brand* list hit plus a dispute verb,
  `$` amounts ≥ $200, no URL, and the email channel. It never runs on SMS.
- `cryptoToadHit` needs an exchange name.
- The generic call rule needs `call back|now|us|this number`.
- `changedPaymentDetails` needs a bank-detail ask.

None of them carries "a transaction you did not make, plus a number to ring
to undo it".

**This is BASE, not AU.** The same message shape was measured in four packs,
and the property it rests on (an unexpected-transaction alert that tells you
to ring a number in the text) is not regional.

**Prototype gate, checked outside the engine.** The four-part predicate in
*Proposed rules* was run as a standalone regex against the 12 lures above
plus six benign messages:
1. "Did you just try to make a purchase … Reply YES or NO"
2. "we've stopped a payment … call the number on the back of your card"
3. a paid-bill receipt with a helpline
4. a genuine direct-debit setup confirmation with "any questions call us on"
5. a clinic payment receipt with a reschedule number
6. "Your direct debit to Octopus Energy for £64.00 will be collected on 1 November. No action needed."

Result: **12/12 lures fire, 0/6 benign fire.** Six benign samples is a small
set. The implementation PR should add more genuine bank and retailer SMS to
the negative tests.

**A separate false positive this surfaced, not proposed here:** benign
sample 4 ("Your direct debit has been set up with Octopus Energy for £64.00 a
month. Any questions call us on 0808 164 1088.") already scores **suspicious
40** under GB. The deferred brand mention is corroborated by the generic "call
us" rule. Watchlisted as a probe lead.

Sources:
- [Scamwatch — Scam alert: fake purchase callback scams](https://www.scamwatch.gov.au/about-us/news-and-alerts/scam-alert-fake-purchase-callback-scams) (Tier 1)
- [Which? — the latest scam alerts](https://www.which.co.uk/news/article/the-latest-scam-alerts-from-which-aBRLy2b02WkC) (unregistered; see *Sources*)
- [Kent Fraud Alert System, May 2026](https://media.www.kent.ac.uk/se/57189/1KentFraudAlertsMay2026.pdf) (unregistered; see *Sources*)

#### AU-2 — NetBank lookalike logon pages by email and SMS → **D2** (2026-10-06 D3, promoted)

CommBank's alerts page lists, separately from the car-giveaway ads that
2026-10-06 cited, a **September 2026 "Fake NetBank logon pages"** alert:
scammers copy NetBank's updated design "and send links by email or text that
lead to fake logon pages". Its advice: "never use links in emails or text
messages to log on to NetBank".

2026-10-06 held D3 at MEDIUM because the only evidence was the social-media ad
channel. The new alert names the SMS and email channels, which is where a
Veriguard user meets the link and pastes it. Re-measured today:

| Input | Verdict |
|---|---|
| `https://netbank-giveaway.com/enter` | **safe 0** |
| `https://netbank-logon.com/` | **safe 0** |
| `https://netbank-verify-au.com/login` | safe 10 (login keyword only) |
| `https://netbank.secure-logon-au.com/` | safe 10 (subdomain-only placement; a known limit of the word rule, see FP note) |
| "CommBank: Your NetBank access has been restricted. Log on to restore access: https://netbank-logon.com/au" (SMS) | safe 15 (link only) |
| `https://commbank-netbank.top/` (control) | likely_scam 75 (`commbank` +45, `.top` +30) |
| `https://www.my.commbank.com.au/netbank/Logon/Logon.aspx` (genuine) | safe 0 |
| `https://netbanking.hdfcbank.com/netbanking/` (unrelated genuine) | safe 0 |
| `https://netbankingportal.com/` | safe 0 |

**Promoted to HIGH and filed** on the strength of a tier-1 own-brand alert
naming the delivery channel. The proposed rule is unchanged from 2026-10-06:
`"netbank"` in `TYPOSQUAT_WORD_BRANDS`. That is a judgement call flagged for
the reviewer. It was MEDIUM two cycles running, and the only change is the
evidence.

#### Checked and already covered (AU)

- **ATO "payment update in your ATO profile" / income-statement email
  carrying remote-access software** (ATO, Sep 2026). Measured on 2026-10-06
  (likely_scam 65), and no newer ATO alert exists.
- **CommBank "payment redirection" BEC** (CommBank alerts, Oct 2026).
  "Please note our bank details have changed … pay invoice INV-2231 to our new
  account: BSB 062-000, account number 12345678" as email: **likely_scam 45**
  (`changedPaymentDetails` composite + bank-detail ask). No gap.
- **Census 2026 impersonation** (SBS). Census night has passed; seasonal
  window closed.

Sources:
- [CommBank — latest scams and security alerts](https://www.commbank.com.au/support/security/latest-scams-and-security-alerts.html) (Tier 1 for its own brand, listed under `brands:` in the registry)
- [ATO — scam alerts](https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts) (Tier 1)
- [Scamwatch — news and alerts](https://www.scamwatch.gov.au/about-us/news-and-alerts) (Tier 1; 403 to automated fetch this cycle, read via search)

### United Kingdom (`full`)

D1 above is the GB finding. Also checked:

- **Report Fraud alert, 15 Oct 2026: police forces impersonated in calls from
  spoofed numbers.** A voice-only script. The SMS/text follow-ups it
  describes are covered by the courier-collection and safe-account request
  words in base. No proposal.
- **"Hi Mum" WhatsApp-number variant** (Which?, 13 Oct 2026): "very upset
  right now", "need to talk", then a WhatsApp number. Measured "Hi mum, I'm
  very upset right now and I need to talk to you. This is my new number,
  message me on WhatsApp +44 7700 900123": **safe 0**. The family composite
  needs a money ask, which this opener deliberately leaves for the next
  message. Not proposed. A new-number-plus-WhatsApp opener without the money
  ask is also what a real child changing phones sends, and the only source is
  unregistered. Watchlisted.
- **NatWest "check your account information" email, Hulu payment-failed
  email** (Which?, 7 Oct 2026). Generic credential phish already scored by
  link, urgency and brand rules.

Sources:
- [City of London Police — Report Fraud alert: police forces impersonated using spoofed numbers](https://www.cityoflondon.police.uk/news/city-of-london/news/2026/october/report-fraud-alert-police-forces-being-impersonated-in-scam-calls-using-spoofed-phone-numbers/) (unregistered tier-1 candidate; 403 to automated fetch, read via search)
- Which? (as above)

### United States (`full`) → **D3**

#### US-1 — Midterm-election fraud → **D3** (MEDIUM)

FBI PSA **I-101526-3-PSA (15 Oct 2026)**, "Scammers Exploit 2026 U.S. Midterm
Election to Perpetrate Multiple Fraud Schemes", names four schemes. Two have a
text shape:
- **voter registration**: "victims receive a text or email claiming they are
  unregistered", leading to a fake state registration page;
- **campaign investment pool**: contributions "guaranteed" to grow and be
  returned after the candidate wins.

| Lure | Verdict |
|---|---|
| "Our records show you are not registered to vote. Confirm your voter registration before Nov 3: https://vote-registration-check.top" | **safe 15** (link only) |
| "ALERT: Your voter registration has been flagged as inactive. Re-verify now with your SSN and date of birth at https://statevoter-verify.com" | likely_scam 55 (SSN/DOB asks carry it) |
| "Join our campaign investment pool. Your contribution is guaranteed to grow and be returned after our candidate wins in November." | **safe 0** |
| "Hi Jordan, it's Sam with Vote Forward. Election day is Nov 3! Check your voter registration at vote.gov. Reply STOP to opt out." (benign) | safe 0 |

The gap is the bare registration claim plus link, and the investment-pool
pitch. **MEDIUM, not HIGH**, because of false positives. Non-partisan and
campaign get-out-the-vote texting is at its annual peak in October and
genuinely says "our records show you may not be registered to vote at this
address". See D3's FP note. **Time-sensitive:** the lure window closes on 3
November. A human should decide this week whether to ship it, or to
watchlist it for 2028.

#### Checked and not proposed (US)

- **FTC refund impersonation** (FTC is returning $15.8M to Cleo AI customers,
  Oct 2026). "FTC refund program: you are owed $243.15 … Pay a $9.99
  processing fee to release your payment: <link>" → **likely_scam 60**
  (small-fee lure + agency + link). No gap.
- **Sextortion "relief" services** (FTC consumer alert and lawsuit, 13 Oct
  2026). The channel is websites and paid search. A pasted ad ("Being
  blackmailed with intimate images? … Call our 24/7 helpline now") scores
  **safe 0**, but there is no SMS/email lure shape and the wording overlaps
  genuine victim-support services. Watchlisted.
- **IC3 PSA of 13 Oct 2026 (North Korean IT workers)**. Employer-targeted. Out of
  scope.

Sources:
- [FBI IC3 — PSA index](https://www.ic3.gov/PSA) (Tier 1)
- [FBI IC3 — I-101526-3-PSA](https://www.ic3.gov/PSA/2026/PSA261015-3) (Tier 1)
- [FTC — consumer alerts](https://consumer.ftc.gov/consumer-alerts) (unregistered; see *Sources*)

### New Zealand (`full`)

Quiet. The NCSC NZ alerts index has nothing newer than 2 September. The
"Scammers impersonating the NCSC" page was already acted on (2026-10-06 D7,
shipped `1cb4d03`). Cyber Smart Week (5–11 Oct) is awareness material, not an
alert. Both NZ items that looked current were date-corrected (see
*Corrections*, item 4). No proposal.

Sources:
- [NCSC NZ — alerts](https://www.ncsc.govt.nz/alerts/) (Tier 1)
- [NCSC NZ — police impersonation / crypto theft](https://www.ncsc.govt.nz/alerts/scammers-impersonating-police-to-target-victims-for-cryptocurrency-theft/) (Tier 1, dated 17 Jul 2026)

### Ireland (`full`)

The D1 AIB-style lure scores **safe 0** under IE as well.

**D8 (carried forward from 2026-10-06, unchanged, MEDIUM).** Garda Fixed
Charge Notice texts. Re-measured:

| Lure | Verdict |
|---|---|
| "An Garda Siochana: You have an unpaid Fixed Charge Notice. Pay now to avoid court proceedings: <link>" | suspicious 40 |
| "You have an unpaid Fixed Charge Notice. Pay within 48 hours to avoid penalty points: <link>" | suspicious 25 |

Unchanged from 2026-10-06. The Garda statement ("All Fixed Charge Notice
correspondence is issued by post, including reminders for unpaid FCNs") is
still reachable only through syndicated regional press. `garda.ie` returns 403
to automated fetches, so the tier-1 confirmation 2026-10-06 asked for is
still outstanding. FraudSMART's newest alert is 14 Sep 2026 (general
social-engineering campaign). No new IE item.

Sources:
- [FraudSMART — alerts](https://www.fraudsmart.ie/alerts/) (Tier 2)
- [An Garda Síochána — fraud](https://www.garda.ie/en/crime-prevention/fraud/) (Tier 1; 403 to automated fetch)

### Canada (`partial`)

Light touch. The CAFC homepage's newest dated item is 4 June 2026. The
impersonation and recovery feature (July 2026) is already routed to the
shipped recovery-fee composite.

**Class-action settlement payment lures** (the $500M Canadian Bread
settlement; scam reports from June 2026). "Canadian Bread Settlement: your
$49.11 payment is ready. Confirm your banking details to receive it: <link>"
scores **unknown 15**. A variant that says "claim" scores suspicious 27. The
settlement's claim window closed in December 2025 and payouts went out in
2026, so this is a tail, not a fresh campaign. No tier-1 source was read for
the scam itself (CBC returned 403). Watchlisted rather than proposed.

Sources:
- [CAFC](https://antifraudcentre-centreantifraude.ca/index-eng.htm) (Tier 1)

---

### This cycle's rotation (`minimal` coverage): IT, JP, KR, MX, NG

#### MX — Mexico → **D4** (pack-invariant, MEDIUM)

Found by reading the pack, not by a lead. `mx.ts` sets
`caseSensitiveAuthorities: ["sat", "ine"]`, but `AUTHORITY_MENTIONS`
deliberately omits both. Its own comment explains that bare "sat"/"ine"
collided with "I sat…" and "fine wine". `types.ts` says entries in
`caseSensitiveAuthorities` "must also appear in authorityMentions — …
Enforced by acronymWordCollision.test.ts", but no test asserts that subset.
`checkSms` only consults the case-sensitive list for entries it finds in
`authorityMentions`, so the two entries are dead:

| Lure (MX) | Verdict |
|---|---|
| "SAT: Tienes un adeudo fiscal pendiente. Regulariza hoy en https://sat-pagos.top" | **unknown 15** (link only; no agency credit) |
| "Servicio de Administracion Tributaria: tienes un adeudo fiscal pendiente https://sat-pagos.top" | suspicious 40 (agency +25) |
| "I sat on the porch and read the paper this morning." | unknown 0 |

The caps-only matcher (`mentionsAsAcronym`) is what makes "SAT"/"INE" safe to
list. That mechanism postdates the comment's collision probe, and it is how
US "sec"/"ice" and JP "yubin" are already handled. Agency names are within
the `minimal` tier's remit, since no native-language phrase authoring is
involved. CONDUSEF's tier-1 alert list had nothing newer than February 2026.

#### IT, JP, KR, NG — checked, no proposal

- **IT.** Agenzia delle Entrate published IRPEF-refund email and SMS
  campaigns on 16, 21, 22 and 30 Sep 2026 (a €5,626.00 refund deadline, and a
  fake 2FA step on the landing page), plus a fake "Bonus Vacanze" with ID and
  selfie upload.
  - The agency is already in `it.ts`. The Italian SMS with a lookalike link
    scores **suspicious 40** (agency + link).
  - AdE's published lookalike domains (`agenziaentrate.online`, `.live`,
    `.link`, `.me`): `agenziaentrate.online` scores **suspicious 30** on the
    TLD alone. A brand-typosquat entry would be the next step, but brands are
    outside the `minimal` tier by design.
  - The Italian phrasing goes to the native-review watchlist.
- **JP.** The Council of Anti-Phishing Japan has no October alert. Its 2026
  report notes generative-AI lures and brokerage-account takeovers, both
  already known. No proposal.
- **KR.** FSS consumer alert 2026-26 (6 Oct 2026) warns of voice-phishing and
  smishing that follow recent financial-sector data breaches. The lure text
  is Korean-language only, so native-review gate. No proposal.
- **NG** (`languages: ["en"]`, so English lures are in scope). SEC Nigeria
  named **WayvePay** as unregistered (statement reported 10 Oct 2026), and
  earlier Gvest Global (21 Aug 2026). An English investment pitch naming
  WayvePay with "guaranteed profit" and a link scores suspicious 27. The
  bare name scores unknown 0. Appending regulator-named platforms to
  `fakeInvestmentPlatforms` for a `minimal` pack is a tier-policy question,
  not a research one. Watchlisted. EFCC's warning about officer impersonators
  carries no new wording; "efcc" is already listed.

Sources:
- [Agenzia delle Entrate — phishing alerts](https://www.agenziaentrate.gov.it/portale/focus-sul-phishing/segnalazioni-e-approfondimenti) (Tier 1)
- [Council of Anti-Phishing Japan](https://www.antiphishing.jp/news/alert/) (Tier 1)
- [FSS — press releases](https://www.fss.or.kr/fss/bbs/B0000188/list.do) (Tier 1)
- [CONDUSEF](https://www.condusef.gob.mx/?p=alertas) (Tier 1)
- [Premium Times — SEC warns against WayvePay](https://www.premiumtimesng.com/business/business-news/915982-sec-warns-nigerians-against-investing-with-unregistered-wayvepay.html) (unregistered; the primary `sec.gov.ng` circular was not located)

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Scamwatch, ATO, CommBank, AFP, IDCARE/ACSC via search (ACSC feed unreachable); D1, D2; one stale lead corrected |
| GB | deep | Report Fraud, Which?, Kent alerts; D1 evidence; Hi-Mum variant watchlisted |
| US | deep | IC3 PSA index (two new PSAs), FTC alerts; D3; refund lure measured covered |
| NZ | deep | NCSC NZ alerts and news; quiet; two date corrections |
| IE | deep | FraudSMART, Garda (via press); D8 carried; D1 measured under IE |
| CA | light | CAFC; settlement-payment lure watchlisted |
| IT | light | Agenzia delle Entrate Sep 2026 campaigns; agency covered; language gap noted |
| JP | light | Council of Anti-Phishing Japan; nothing new |
| KR | light | FSS consumer alert 2026-26; language gap |
| MX | light | CONDUSEF; D4 found in the pack itself |
| NG | light | SEC Nigeria / EFCC; WayvePay watchlisted |
| AE | skipped | Researched 2026-10-11 (D1 shipped `133c146`); the brief's rotation was stale |
| BR | skipped | Researched 2026-10-11 |
| ES | skipped | Researched 2026-10-11 |
| FR | skipped | Researched 2026-10-11 |
| ID | skipped | Researched 2026-10-11 |
| DE, IN, KE, SG | skipped | Researched 2026-10-06, not due |
| NL, PH, PL, SE, TH, VN, ZA | skipped | Not in this cycle's rotation plan |

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| D1 | "Unrecognised transaction, call this number" SMS | New four-part composite (transaction claim + disown clause + dialable number with call verb + no URL), +30, superseding the generic +20 call row when both fire | `scamDetector.ts` (as a registry signal under `signals/`) | BASE | LOW–MEDIUM | **HIGH** |
| D2 | NetBank lookalike logon domains | `"netbank"` in `TYPOSQUAT_WORD_BRANDS` | `regions/au.ts` | AU | LOW | **HIGH** |
| D3 | Midterm voter-registration / campaign-pool lures | `"not registered to vote"`, `"voter registration has been flagged"`, `"voter registration is inactive"` in `URGENCY_TAX_THREAT`; `"campaign investment pool"` in `REWARD_WORDS` | `regions/us.ts` | US | MEDIUM | MEDIUM |
| D4 | Dead `caseSensitiveAuthorities` entries | Add `"sat"`, `"ine"` to MX `AUTHORITY_MENTIONS` (they are already case-gated); add the subset assertion `types.ts` claims exists | `regions/mx.ts`, `__tests__/acronymWordCollision.test.ts` | MX (invariant: all packs) | LOW | MEDIUM |

### Proposed rules

**D1** — composite. All four conditions must hold:

```ts
// (a) a transaction the reader did not initiate is asserted to exist.
//     The gap admits a decimal point inside an amount ("$1,249.00").
const TXN = /\b(?:direct\s+debit|standing\s+order|payment|purchase|order|charge|transaction|transfer|renewal|(?:credit\s+card\s+|loan\s+)?application)\b(?:[^.!?]|\.(?=\d)){0,60}\b(?:has\s+been|was|is\s+being|will\s+be)\s+(?:set\s+up|arranged|approved|authori[sz]ed|placed|processed|made|debited|charged|completed)\b|\byou\s+have\s+been\s+charged\b|\bwill\s+be\s+debited\b/i;
// (b) the reader is invited to disown it
const DISOWN = /\b(?:if\s+(?:this\s+(?:was|wasn'?t|is)\s+not\s+you|this\s+wasn'?t\s+you|it\s+wasn'?t\s+you|you\s+(?:did\s+not|didn'?t|do\s+not|don'?t)\s+(?:make|place|authori[sz]e|recogni[sz]e|apply|request|set)\w*)|not\s+you\?|to\s+(?:cancel|reverse|stop|dispute)\b)/i;
// (c) a dialable number (the existing hasPhoneNumber shapes in checkSms) and a call verb
// (d) no URL; and NOT the protective form "the number on the back of your card" / "official app"
```

```
flag: "Says a payment you don't recognise has gone through and gives a number to ring to stop it — the fake-purchase callback scam. Banks and retailers don't put a number to call in an unexpected-charge text; the person who answers is the scammer. Check in your banking app or call the number on the back of your card instead."
```

Weight **+30**, declared per channel on `sms` and `custom`. Not `email`:
`checkEmail`'s TOAD composite already owns that channel. When it fires,
suppress the generic "Asks you to call a number" (+20) row, so one fact is not
scored twice. That is the same double-scoring discipline the README names.

**Acceptance criteria** (each is a verdict the engine does not return today):
- GB "Barclays: A new direct debit has been set up … call 0800 012 3456 to
  cancel this payment." **safe 0 → suspicious 30**, with the new flag.
- AU "PayPal: You have been charged $1,249.00 … call 1800 954 112 to cancel."
  **safe 0 → suspicious 30**.
- IE AIB direct-debit lure **safe 0 → suspicious 30**.
- AU "…call us on 1800 954 112 immediately." **suspicious 30 → 40**, not 60:
  urgency 10 + composite 30, with the generic call row superseded.
- The six benign samples listed under AU-1 are unchanged. That includes the
  Octopus confirmation staying at its current 40. It is a pre-existing false
  positive and must not get worse.

FP note: each half of the composite is ordinary on its own.
- Receipts state transactions.
- Helplines give numbers.
- Genuine fraud alerts ask "was this you?".

The gate needs all four, *with no link and without the protective
own-channel wording*. A genuine bank fraud alert asks for a YES/NO reply or
sends you to the number on your card. The remaining FP class is a small
business that texts "your payment has been processed — if this wasn't you,
call us on 03 …". That is plausible but rare, and lands at suspicious 30, not
likely_scam.

**D2** — `au.ts` `TYPOSQUAT_WORD_BRANDS`: `"netbank"`. The proposal is
unchanged from 2026-10-06 D3. It is boundary-matched on the registrable
label's separator-split words, so:
- `netbank-logon.com` and `netbank-giveaway.com` fire (+45 → likely_scam 45);
- `netbanking.<bank>.com` and `netbankingportal.com` do not.

It is not a substring of any existing AU, base or global brand entry, and no
existing entry is a substring of it.

**Acceptance criteria:**
- `https://netbank-logon.com/` **safe 0 → likely_scam 45**.
- `https://netbank-giveaway.com/enter` **safe 0 → likely_scam 45**.
- Unchanged: `my.commbank.com.au/netbank/…` safe 0,
  `netbanking.hdfcbank.com` safe 0, `netbankingportal.com` safe 0.

FP note: the subdomain-only form (`netbank.secure-logon-au.com`, safe 10) is
**not** caught. Accepted, as 2026-10-06 argued: the substring list would catch
it, but at the cost of every `netbanking.` host worldwide. The registrable
label is the brand only on a NetBank-owned domain, and the brand-owns-label
exemption leaves that clean.

**D3** — `us.ts`:

```
URGENCY_TAX_THREAT:  "not registered to vote", "voter registration has been flagged",
                     "voter registration is inactive"
REWARD_WORDS:        "campaign investment pool"
```

`"you are not registered to vote"` is deliberately not listed: it contains
`"not registered to vote"`, which would score it twice. Checked against every
US, base and global list, there are no overlaps. Before → expected:
- the registration lure goes from safe 15 to suspicious 25;
- the investment-pool pitch goes from safe 0 to safe 12. It reaches
  suspicious only if it also carries a link or an ask, which is the
  intended ceiling for a phrase with no gate.

FP note: "our records show you may not be registered to vote at your
address — register at vote.org" is a genuine civic-group text, and it would
also reach suspicious 25 with its link. That is the reason D3 is MEDIUM. A
reviewer may prefer to gate the phrases on a non-`.gov` link.
`gatedBenefitPhrases` cannot be reused for this: its flag copy is
veterans-specific.

**D4** — `mx.ts` `AUTHORITY_MENTIONS`: add `"sat"`, `"ine"`. They are already
in `caseSensitiveAuthorities`, so they match only in caps, and only in text
that is not mostly caps.

**Acceptance criteria:**
- "SAT: Tienes un adeudo fiscal pendiente … <link>" **unknown 15 →
  suspicious 40**.
- "I sat on the porch…" stays unknown 0.
- A new test asserts, for every pack, that each `caseSensitiveAuthorities`
  entry appears in `authorityMentions` (case-insensitively). That is the
  invariant `types.ts` already claims is enforced.

The comment in `mx.ts` explaining their absence needs rewriting in the same
change.

**D8** (2026-10-06, carried forward unchanged): see the Ireland section. Not
re-filed.

---

## Pack-interface notes

- D1 is a base composite and fits the signal registry (`signals/*.ts`,
  `registryScore`) introduced in #453. It should be authored there rather than
  inline in `checkSms`, so its per-channel weight is declared once.
- D4 adds no field. It asks for the subset invariant on
  `caseSensitiveAuthorities` to be tested, since `types.ts` already claims
  that test exists.

---

## Region demand signal

Not measured this cycle. The production report store is not reachable from
the research environment. The local development fallback was not read, and no
figures are estimated.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| AU D2 (was 2026-10-06 D3) — `netbank` typosquat | **PROMOTED → HIGH, filed** | New CommBank Sep 2026 alert names email/SMS delivery |
| IE D8 — Fixed Charge Notice phrasing | **OUTSTANDING, unfiled** | Unchanged; garda.ie still unreachable for tier-1 confirmation |
| US D3 — midterm voter-registration lure | **NEEDS DECISION — new, time-sensitive** | Election 3 Nov 2026; MEDIUM on FP grounds |
| MX D4 — dead `caseSensitiveAuthorities` | **OUTSTANDING — new** | Cheap fix; mainly an invariant-test gap |
| GB benign direct-debit confirmation scores suspicious 40 | **PROBE LEAD — new** | "Your direct debit has been set up with Octopus Energy … Any questions call us on 0808 …" → deferred brand mention corroborated by the generic "call us" rule. Pre-existing; out of a sweep's scope |
| "Hi Mum" WhatsApp-number opener without a money ask | **DEFERRED — new** | Which? 13 Oct 2026; measured safe 0. Indistinguishable from a real number change until the money ask arrives |
| Path-embedded redirect through security-gateway rewrite URLs (`secure-web.cisco.com/<token>/https%3A…`) | **MONITORING — new** | MailGuard 9 Oct 2026; `carriesNestedUrl` reads query parameters only. Flagging rewrites would hit most enterprise mail |
| OAuth device-code / consent phishing via doc-share chain | **MONITORING** | MailGuard 9 Oct 2026; FBI PSA 1 Sep 2026. The device-code wording appears only on Microsoft's genuine page; the email has no tell |
| Clipboard-swap ClickFix behind genuine install commands | **MONITORING — new** | BleepingComputer 9 Oct 2026; the paste-instruction form is caught (58); the swap itself is invisible to text |
| Class-action settlement payment lures (CA Bread) | **WATCHLIST — new** | unknown 15 / suspicious 27; tail of a closed settlement; no tier-1 scam source read |
| Sextortion "relief" services | **WATCHLIST — new** | FTC 13 Oct 2026; ad/website channel, overlaps genuine support services |
| NG regulator-named platforms (WayvePay, Gvest) in `fakeInvestmentPlatforms` | **NEEDS POLICY DECISION** | Whether a `minimal` pack may append regulator-named platforms |
| IT AdE IRPEF-refund / Bonus Vacanze phrasing; AdE lookalike-domain list | **NEEDS NATIVE REVIEW — new** | Agency already covered; brands outside `minimal` tier |
| KR post-breach voice-phishing/smishing (FSS 2026-26) | **NEEDS NATIVE REVIEW — new** | Korean-language lures |
| ASOS breach follow-on phishing | **MONITORING — new** | No follow-on lure reported yet; ASOS not in GB `BRAND_MENTIONS` |
| BlueKit PhaaS (SMS sender, 97 brands) | **MONITORING — new** | No published lure text or path shape |
| ccTLD registry compromise (`.gh`/`.sl`/`.as`) | **MONITORING — new** | Infrastructure; no consumer text surface |
| ES / FR / BR / ID native-review items (2026-10-11) | **NEEDS NATIVE REVIEW** | Unchanged |
| Authority + messaging-app hand-off for GB/IE/NZ | **MONITORING** | Unchanged; AU and AE are the adopters |
| "Was this you?" bank texts with no link (PTSB, ANZ NZ) | **DEFERRED** | Unchanged. D1 deliberately excludes the reply-YES/NO form, which is the genuine shape |
| Bank brand in ad/giveaway text (CommBank car draw) | **DEFERRED** | Unchanged; D2 covers the URL |
| India "digital arrest", LINE/KakaoTalk funnels, CA French keywords, myGov multi-benefit compound | **DEFERRED / BLOCKED** | Unchanged |
| Smishing Triad / PhaaS TLD rotation | **MONITORING** | No new TLD surfaced |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| Scamwatch — fake purchase callback scams | 1 | AU-1/D1 |
| Scamwatch — news and alerts | 1 | AU coverage check |
| ATO — scam alerts | 1 | AU coverage check |
| CommBank — latest scams and security alerts | 1 (own brand; registry `brands:`) | AU-2/D2; BEC check |
| AFP — "More than 5000 Australian victims receive text warning" | 1 | **Not used as evidence**: dated 31 Jan 2025; Corrections only |
| FBI IC3 — PSA index; I-101526-3-PSA | 1 | US-1/D3 |
| NCSC NZ — alerts | 1 | NZ coverage check; two date corrections |
| FraudSMART — alerts | 2 | IE coverage check; D1 background (2024) |
| An Garda Síochána — fraud | 1 | D8 (unreachable; via press) |
| CAFC | 1 | CA coverage check |
| Agenzia delle Entrate — phishing alerts | 1 | IT |
| Council of Anti-Phishing Japan | 1 | JP |
| FSS (South Korea) — press releases | 1 | KR |
| CONDUSEF | 1 | MX |
| MailGuard — "Secure Folder" phishing | 2 | Brief triage |
| BleepingComputer — Claude ClickFix via Google Ads | 2 | Brief triage |
| Malwarebytes Labs — BlueKit; ccTLD hijack; ASOS breach | 2 | Brief triage |

**Cited but not in `sources.yml`, for human review before merge.** Each is
named here rather than added, because each tier is a judgement:

- `which.co.uk` (Which? scam alerts). Consumer-association reporting with
  dated, quoted lures. A tier-2 candidate, and the most useful GB source this
  cycle.
- `kent.ac.uk` / Kent Fraud Alert System (police-and-PCC fraud bulletin,
  hosted on a university domain). Tier 2 at most, given the hosting. The
  originating Kent PCC page is the better entry.
- `cityoflondon.police.uk` (the Report Fraud operator). A tier-1 candidate;
  `actionfraud.police.uk` is registered and now redirects there.
- `consumer.ftc.gov` (FTC consumer alerts). **Tier 1, and its absence looks
  like an oversight:** 2026-10-11 cited it as Tier 1, yet US has only
  `ic3.gov` registered.
- `premiumtimesng.com` (NG press). Tier 2 or 3. The primary `sec.gov.ng`
  circular for WayvePay was not located.

---

## Issues opened

| ID | Issue | Priority |
|---|---|---|
| D1 | [#463 — BASE: "unrecognised transaction, call this number" SMS composite](https://github.com/alekslinde/veriguard/issues/463) | HIGH |
| D2 | [#464 — AU: `netbank` lookalike logon domains (2026-10-06 D3, promoted)](https://github.com/alekslinde/veriguard/issues/464) | HIGH |

D3, D4 (MEDIUM, new) and D8 (MEDIUM, carried from 2026-10-06) are not filed,
per the HIGH-only threshold. Their full detail is above for a human to
triage, and D3 is time-sensitive.
