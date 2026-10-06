# Threat-intelligence roadmap — 2026-10-06

*Sweep period: 2026-09-28 – 2026-10-06 (since the last merged sweep,
2026-09-27). Next sweep due on or around 2026-10-13.*

---

## Provenance note: the scheduled 2026-10-04 run did not happen

The weekly sweep fired on schedule on 2026-10-04 and failed four minutes in:
every research step returned HTTP 429 (an account spend limit), so no research
was done and nothing was written or pushed. This file is that cycle, run by
hand on 2026-10-06 against the same brief. No sweep is missing from the
archive; the gap is two days, not a cycle.

**How the evidence was gathered this cycle, and its limit.** The environment
this ran in could not fetch most source pages directly (an egress policy, not
a site problem). Every claim below is therefore sourced from search-indexed
copies of the cited pages, with the publisher and date as indexed. Every
*gap* claim, by contrast, was measured, not inferred: each candidate lure was
run through the live engine (`analyzeContent`, with the stated region pack)
and its verdict and score are quoted. A proposal here exists because a
realistic lure built from the cited advisory scored low, not because a
keyword looked absent.

---

## Step 1 — live orientation (verify-before-propose)

`ls packages/detect/src/regions/*.ts | grep -Ev '/(base|rest-of-world|types|index)\.ts$' | wc -l`
→ **27 region packs.** `grep -H 'coverage:'`:

| Tier | Regions |
|---|---|
| `full` (5) | AU, GB, US, NZ, IE |
| `partial` (1) | CA |
| `minimal` (21) | AE, BR, DE, ES, FR, ID, IN, IT, JP, KE, KR, MX, NG, NL, PH, PL, SE, SG, TH, VN, ZA |
| `none` (1, `ZZ`) | rest-of-world.ts fallback |

Unchanged from 2026-09-27. Read `types.ts`, `base.ts` and the five `full`
packs plus `ca.ts` against each candidate below; read the 2026-09-27 roadmap
and its watchlist in full. Detection changes on `main` since the last sweep
are ReDoS fixes only (#372, `cb75715`, `d80de5c`) — no new signals to
account for.

---

## Executive summary

A productive cycle. Two cross-region gaps scored **0** on lures taken straight
from current law-enforcement advisories, and both route to BASE:

| Rank | Proposal | Pack | Measured today | Why |
|---|---|---|---|---|
| 1 | D4 — "don't tell your bank" scam-coaching phrases | `base.ts` (new list) | **safe 0** | FBI PSA (17 Sep 2026) and ANZ (Aug 2026) both name it; it is the step right before money moves |
| 2 | D5 — "your funds have been recovered, pay a release fee" | `scamDetector.ts` composite | **safe 0** (US, GB, CA) | CAFC names recovery fraud a 2026 growth area; base only catches the *offer* form |
| 3 | D1 — AUSTRAC impersonation | `au.ts` | **safe 10** (SMS), **0** (lookalike domain) | AUSTRAC's own alert, Sep 2026; agency absent from every AU list |
| 4 | D2 — government agency + "contact us on WhatsApp/Telegram" | `au.ts` + new pack field | **safe 0** | AUSTRAC states it never moves contact to messaging apps; ATO+WhatsApp scores nothing |
| 5 | D6 — US law-enforcement "case" wording | `us.ts` | **safe 0** | FBI PSA: ~61,000 complaints, >$1.6bn losses; the exact-phrase list misses one-word variants |
| 6 | D7 — NZ NCSC impersonation | `nz.ts` | **safe 10** | NCSC's own alert; the merged CERT NZ body is not an authority term |

Two lower-priority items (D3 AU `netbank` lookalike domains, D8 IE Fixed
Charge Notice texts) and one copy correction (D9 NZ reporting body) complete
the list.

**Pack-interface notes:** D2 and D4 each need a field `types.ts` cannot
express today — see §Pack-interface notes.

**Region demand:** not measurable from this environment — see §Region demand signal.

---

## Threats by region

### Australia (primary)

#### AU-1 — AUSTRAC staff impersonation → **D1**

AUSTRAC published a scam alert in September 2026 (relayed by Scamwatch):
scammers impersonate the agency and **name real AUSTRAC officials**, by
email, phone, fake websites and messaging apps, to pressure people into
payments, transfers or handing over personal and business information.
AUSTRAC "will never unexpectedly request payments, ask for sensitive
information via unofficial channels, or direct you to communicate through
apps such as WhatsApp or Telegram."

AUSTRAC appears in no AU list — not `AUTHORITY_MENTIONS`, not
`TYPOSQUAT_BRANDS`, not `LEGIT_DOMAINS`. Measured:

| Lure | Verdict |
|---|---|
| "AUSTRAC notice: your account has been flagged for suspicious transactions. To avoid a freeze, contact our compliance officer on WhatsApp +61 412 345 678 today." | **safe 10** (only "your account has been") |
| `https://austrac-compliance.com/case` | **safe 0** |
| For comparison, `https://commbank-giveaway.com/enter` | likely_scam 45 (typosquat) |

The ACCC/NASC spoofed-number campaign (NASC, Sep 2026) was checked in the
same pass and is **already covered** (`"accc"`, `"nasc"` are authority
mentions since #65; the comparable lure reaches likely_scam 45).

Sources: [AUSTRAC — Scam alert: scammers impersonating AUSTRAC staff](https://www.austrac.gov.au/scam-alert-scammers-impersonating-austrac-staff) (Tier 1); [Scamwatch — browse news and alerts](https://www.scamwatch.gov.au/about-us/news-and-alerts/browse-news-and-alerts) (Tier 1); [NASC — warning issued after ACCC phone numbers spoofed](https://www.nasc.gov.au/news/warning-issued-after-accc-phone-numbers-spoofed-by-scammers) (Tier 1).

#### AU-2 — Agency + messaging-app hand-off → **D2**

The AUSTRAC alert's sharpest line generalises: Australian federal agencies do
not move a case onto WhatsApp or Telegram. Today the engine gives that move
nothing:

| Lure | Verdict |
|---|---|
| "ATO notice: there is an issue with your tax account. Please contact our officer on WhatsApp +61 412 345 678 to resolve it today." | **safe 0** ("Names a government agency, with nothing else unusual") |
| Same text, "call our officer on 0412 345 678" | safe 0 |
| "Hey it's Sam from footy, message me on WhatsApp when you're free" | safe 12 (unrelated "free") |

The WhatsApp-specific rules that exist are about account *hijack* notices
(#227) and investment-group invites (#166) — neither fires on an agency
asking to continue by app. This is **routed to AU, not BASE**: whether a
government uses WhatsApp is a per-country fact. Singapore runs official
Gov.sg WhatsApp channels and several Indian and Brazilian agencies take
reports by WhatsApp, so a base rule would assert something false for those
users. It needs a pack opt-in (see Pack-interface notes).

#### AU-3 — CommBank "win a car" sponsored ads → **D3**

CommBank warned in September 2026 of sponsored social-media ads offering
customers a draw for a new car; the entry button leads to a fake NetBank
login. The realistic thing a user pastes here is the landing URL. `commbank`
is a typosquat brand (45), but **`netbank`** — the name of the login page the
lure imitates — is not:

| URL | Verdict |
|---|---|
| `https://netbank-giveaway.com/enter` | **safe 0** |
| `https://netbank-login-au.com/` | safe 10 (login keyword only) |
| `https://www.my.commbank.com.au/netbank/Logon/Logon.aspx` (genuine) | safe 0 |

The ad text itself ("CommBank customers: enter our competition to WIN a new
Toyota! Log in to NetBank…") scores safe 15. That is not proposed for change:
bank names are deliberately absent from `BRAND_MENTIONS` (FP — banks are
named in ordinary messages constantly), and the URL is the better hook.

Source: [CommBank — latest scams and security alerts](https://www.commbank.com.au/support/security/latest-scams-and-security-alerts.html) (Tier 1 for its own brand).

#### Checked and already covered

- **ATO "income statement" / "payment update" email** (ATO, Sep 2026):
  "New myGov Inbox Message: Action Required – Income Statement Report
  Available. Review Document: [link]" → **likely_scam 65** (authority +
  no-link sender + urgency). No gap.
- **Fake purchase callback** (Scamwatch): covered, per the 2026-09-27 sweep.
- **Scam coaching** (ANZ, Aug 2026): the AU instance of BASE-1/D4 below.

Sources: [ATO — scam alerts](https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection/scam-alerts) (Tier 1); [ANZ — warns of troubling scam-coaching trend](https://www.anz.com.au/newsroom/media/2026/august/anz-warns-of-troubling-scam-coaching-trend/) (Tier 2).

---

### United Kingdom

**Quiet for text signals.** The HMRC "TaxGateway — confirm your Agent Services
Account" SMS reported to ACCA members was measured at **likely_scam 85**
(message) and 75 (URL). The Action Fraud → Report Fraud transition (live since
December 2025, public launch January 2026) is **already reflected** in
`gb.ts` (`reportingBody: "Report Fraud (reportfraud.police.uk)"` and the
foreign-authority flag text). No proposal. The BASE items below apply to GB
unchanged — the "your recovered funds need a release fee" lure scored **safe
0** under the GB pack.

Sources: [ACCA — beware the latest scam warnings](https://www.accaglobal.com/uk/en/technical-activities/uk-tech/in-practice-ezine-archive/In-Practice-archive-2026/January/Beware-the-latest-scam-warnings.html) (Tier 2); [City of London Police — Report Fraud service goes live](https://www.cityoflondon.police.uk/news/city-of-london/news/2025/december/report-fraud-service-goes-live-with-full-public-launch-in-january-2026/) (Tier 1).

---

### United States

#### US-1 — Law-enforcement impersonation, "case" wording → **D6**

The FBI's PSA of 17 September 2026 (I-091726-PSA) reports nearly 61,000
complaints from January 2025 to July 2026 about criminals posing as local
police, federal agents or court officials, with losses above $1.6 billion.
Field offices (Newark, Jacksonville) describe spoofed field-office numbers,
**real agents' names**, a claim that the victim's identity is tied to a crime,
and instructions to tell no one — including their bank.

`us.ts` already lists `"fbi"` and keeps `"money laundering investigation"` in
`URGENCY_FOREIGN_AUTHORITY` (alongside the jury-duty phrases from #275). The
exact-phrase list is brittle to one word:

| Lure | Verdict |
|---|---|
| "FBI: your Social Security number is part of a money laundering **investigation**. Call Agent Reyes at 973-555-0142 today." | suspicious 35 |
| "FBI: your Social Security number has been **linked to a money laundering case**. Call Agent Reyes at 973-555-0142 today." | **safe 0** |
| "This is Special Agent Mark Reyes with the FBI field office. Your identity has been used in a money laundering case. Do not discuss this with anyone. Call me back…" | **safe 0** |

The secrecy instruction is handled by BASE-1/D4; D6 covers the case wording.

Sources: [FBI IC3 — PSA I-091726-PSA](https://www.ic3.gov/PSA/2026/PSA260917) (Tier 1).

#### Checked and not proposed

- **Farm-equipment marketplace fraud** (FTC, Sep 2026) — a social-media ad
  and wire-transfer purchase, with no SMS/email text shape to match.
- **Health-insurance open-enrollment scams** (FTC, Sep 2026) — paid search
  placement, not a message lure.
- **FinCEN scam-centre alert** (Sep 2026) — guidance for financial
  institutions; the consumer-facing side is pig-butchering, already covered
  by the investment-group composite.
- **Parking-meter QR codes** (FTC, again) — on the watchlist as an education
  gap; not detectable from text.

Sources: [FTC — consumer alerts, September 2026](https://consumer.ftc.gov/consumer-alerts/archive/202609) (Tier 1); [FinCEN — nearly $13 billion linked to suspected scam-centre digital asset scams](https://www.fincen.gov/news/news-releases/fincen-identifies-nearly-13-billion-linked-suspected-digital-asset-scams) (Tier 1).

---

### New Zealand

#### NZ-1 — NCSC impersonation → **D7**, and a stale reporting body → **D9**

The NCSC published an alert that people are receiving scam calls
impersonating the NCSC, which "does not generally initiate unsolicited
contact". `nz.ts` lists `"cert nz"` and `"netsafe"` as authorities, but not
the NCSC that CERT NZ merged into:

| Lure | Verdict |
|---|---|
| "NCSC alert: your device has been compromised. Call 0800 555 123 now to secure your accounts." | **safe 10** |
| "This is the National Cyber Security Centre. Your computer has been compromised… Call us back on 09 888 1234 immediately…" | suspicious 30 (call-a-number + urgency only) |

Separately, `nz.ts` still sets `reportingBody: "CERT NZ"`, and the NZ
foreign-authority flag tells users to "Report it to CERT NZ or Netsafe". The
code comment already notes the merger and that `cert.govt.nz` resolves to the
successor. The **user-facing name** is now the wrong one; D9 corrects the copy.

**Bank impersonation** reached its highest share of Netsafe reports this year
in August (34%, up from 20%). A representative "ANZ: a payment of $2,450 to a
new payee… call our fraud team" lure is already **suspicious 30**, and the
BASE coaching phrases (D4) cover the follow-on stage. No NZ-specific phrase
proposed — see the watchlist entry on "was this you?" texts.

Sources: [NCSC NZ — scammers impersonating the NCSC](https://www.ncsc.govt.nz/alerts/scammers-impersonating-the-ncsc/) (Tier 1); [Newstalk ZB — Netsafe urges extra checks](https://www.newstalkzb.co.nz/news/national/netsafe-urges-extra-checks-as-wave-of-sophisticated-online-scams-emerges-on-the-internet) (Tier 2).

---

### Ireland

#### IE-1 — Fake Garda Fixed Charge Notice texts → **D8**

Gardaí issued a nationwide warning about texts claiming an unpaid Fixed
Charge Notice with a payment link, and were categorical: "An Garda Síochána
do not communicate with individuals regarding Fixed Charge Notices by SMS
message. All Fixed Charge Notice correspondence is issued by post." The lure
already reaches **suspicious 40** (link + government agency), but "fixed
charge notice" is not in `ie.ts`'s fine/toll vocabulary, so the strongest
claim in the message adds nothing.

**PTSB "an attempt was made to transfer €4,800 — confirm this was not you"**
texts were also reported. With a lookalike link this is already **likely_scam
55** (`ptsb` typosquat). The no-link variant ("reply NO and our team will
call you") scores 0, but is **not proposed**: it is word-for-word the shape of
a genuine bank fraud alert. Watchlisted.

Sources: [Cork Safety Alerts — Gardaí nationwide warning over fake Fixed Charge Notice text](https://news.corksafetyalerts.com/gardai-issue-nationwide-warning-over-fake-fixed-charge-notice-text-scam/) (Tier 3, quoting the Garda statement); [Leinster Express — Gardaí scam alert over bogus text messages](https://www.leinsterexpress.ie/news/warning-gardai-issue-scam-alert-over-people-receiving-bogus-text-messages-8073455) (Tier 3). The Garda statement itself was not reachable from this environment; garda.ie is the Tier 1 source to confirm against before D8 ships.

---

### Canada (`partial` coverage)

The CAFC's first-half 2026 trends name spear phishing, bank-investigator
fraud, extortion and **recovery fraud** as growing against 2025, and the
centre warns of fraudsters impersonating the CAFC itself to "help get money
back". `ca.ts` already lists the CAFC as an authority. The recovery lure
nonetheless scored **0** ("unknown", the `partial`-tier downgrade of a clean
verdict): the gap is the "already recovered + fee" wording, which is
country-independent and handled as BASE-2/D5. No CA-specific proposal.

Sources: [CAFC — fraud trends, first six months of 2026](https://antifraudcentre-centreantifraude.ca/features-vedette/2026/08/fraud-trends-tendances-matiere-fraude-eng.htm) (Tier 1).

---

### Cross-regional (BASE)

#### BASE-1 — Scam coaching: "don't tell your bank" → **D4**

Two independent sources describe the same step from opposite ends. The FBI
PSA: impersonators "urge victims not to tell family, friends, financial
institutions, or law enforcement about the call". ANZ (August 2026): victims
are given scripts and cover stories for bank staff, sometimes coached live
through an earpiece in the branch. It is the last step before money moves,
and it is country-independent — no legitimate body anywhere tells a customer
to keep something from their own bank.

`base.ts` has `"don't tell anyone"` and `"don't tell mum"` in the voice-clone
group, and nothing aimed at the bank:

| Lure | Region | Verdict |
|---|---|---|
| "FBI: Your Social Security number has been linked to a money laundering case. Do not tell your bank about this call. Call Agent Reyes at 973-555-0142." | US | **safe 0** |
| "This is the fraud team. Your account is compromised. Do not tell the bank staff why you are withdrawing the cash, they may be involved." | AU | safe 12 (only "cash") |
| "Your Chase verification code is 482910. Do not share this code with anyone." (benign) | US | safe 0 |
| "Planning Dad's 60th on Saturday - don't tell him, it's a surprise!" (benign) | GB | safe 0 |

The benign rows are the FP guardrail: one-time-code texts say "do not share
… with anyone", and family surprises say "don't tell". The proposed phrases
all name the **bank** or **bank staff**, or the call itself, as the party to
hide from, which neither benign shape does.

#### BASE-2 — "Your funds have been recovered — pay a release fee" → **D5**

Base already carries recovery-fraud *offers* (#179: "we can recover your
money", "fund recovery specialist"). The variant now reported by the CAFC
and seen in law-enforcement impersonation skips the offer: it announces that
money **has been** recovered and asks for a fee to release it.

| Lure | Region | Verdict |
|---|---|---|
| "Report Fraud: your lost funds of £3,200 have been recovered. A release fee of £150 is required before the money can be returned to you." | GB | **safe 0** |
| "Federal Trade Commission: we have recovered $8,400 lost in your previous investment fraud. To release the funds, confirm your banking details and pay the processing fee." | US | **safe 0** |
| Same, "Canadian Anti-Fraud Centre: …" | CA | **unknown 0** |
| Same, "Scamwatch recovery unit: … confirm your bank details and pay a small processing fee." | AU | suspicious 40 (authority + "bank details" only) |

A single phrase list is the wrong tool — "recovered" alone is everywhere.
The signal is the **pair**: a claim that lost money has been recovered, plus
a fee to release it. A composite in `scamDetector.ts`, beside the existing
`withdrawalGate` (the gambling "winnings held behind verification" rule,
which has the same shape).

#### BASE-3 — PhaaS kits: JWR (Smishing Triad) and Phoenix — context, no proposal

Group-IB documented the **JWR** kit (mid-September 2026, the "Outsider"
cluster within the Smishing Triad ecosystem), which streams card numbers and
OTPs to operators as they are typed. It also documented the **Phoenix
System** panel, whose dominant themes are reward-points expiry and failed
parcel delivery. Both themes are already covered — measured: Telstra-points
lure **likely_scam 47** (message) / **75** (URL); EE-points **95** / **75**;
T-Mobile points **59**. The kit's live-keystroke exfiltration changes what
happens after the click, not the text that gets someone to click. No
proposal; Smishing Triad TLD rotation stays on the watchlist.

Sources: [Group-IB — Smishing Triad's phishing cockpit (JWR)](https://www.group-ib.com/blog/smishing-triad-outsider-jwr/) (Tier 2); [Group-IB — Phoenix PhaaS kit](https://www.group-ib.com/blog/phoenix-phaas-kit-smishing/) (Tier 2); [FBI IC3 — PSA I-091726-PSA](https://www.ic3.gov/PSA/2026/PSA260917) (Tier 1); [ANZ — scam-coaching trend](https://www.anz.com.au/newsroom/media/2026/august/anz-warns-of-troubling-scam-coaching-trend/) (Tier 2).

---

### Other regions (`minimal` coverage) — light-touch pass

- **SG** — the Police advisory on ICA officers handing calls to fake Chinese
  officials (72 cases, S$6.1m since January) is **covered**: `sg.ts` has
  `"ica"` and the shared Chinese-authority list. Measured **likely_scam 60**.
- **IN** — another high-value "digital arrest" (Delhi Police impersonation,
  money-laundering pretext, July 2026). The `in.ts` multilingual deferral
  stands; watchlist unchanged.
- **DE** — reports of a September SMS/email wave impersonating mobile
  carriers, parcel services (Hermes) and public bodies. The minimal pack
  lacks German-language urgency by design; nothing distinct enough to
  propose at this tier.
- **KE** — prize/loyalty and "send money to this number" M-PESA texts are
  the standing pattern; prize language and the generic request rules apply.
- **All other minimal regions** (AE, BR, ES, FR, ID, IT, JP, KR, MX, NG, NL,
  PH, PL, SE, TH, VN, ZA): not searched beyond one pass this cycle. Read this
  as *not researched to depth*, not as *nothing happening*. D4 and D5 land
  in `base.ts`/`scamDetector.ts` and reach every one of them.

Sources: [Singapore Police Force — advisories](https://www.police.gov.sg/media-hub/news/2025/12/20251228_police_advisory_on_scams_involving_the_impersonation_of_the_commissioner) (Tier 1); [The Kenya Times — tricky text messages sent to bank customers](https://thekenyatimes.com/latest-kenya-times-news/8-tricky-text-messages-scammers-are-sending-bank-customers-right-now/) (Tier 3).

---

## Region coverage

| Region | Depth | Notes |
|---|---|---|
| AU | deep | Six searches; three gaps measured (D1–D3) |
| GB | deep | Report Fraud and HMRC lures measured: already covered |
| US | deep | FBI PSA and FTC alerts; one gap (D6) |
| NZ | deep | NCSC and Netsafe; one gap (D7), one copy fix (D9) |
| IE | deep | Garda FCN and PTSB texts; one gap (D8) |
| CA | light | CAFC trends; routed to BASE (D5) |
| DE | light | September carrier/parcel wave; nothing to propose at minimal tier |
| IN | light | Digital arrest; deferral stands |
| KE | light | Prize and M-PESA texts; covered by base rules |
| SG | light | ICA + Chinese officials; measured, covered |
| AE | skipped | Not searched this cycle |
| BR | skipped | Not searched this cycle |
| ES | skipped | Not searched this cycle |
| FR | skipped | Not searched this cycle |
| ID | skipped | Not searched this cycle |
| IT | skipped | Not searched this cycle |
| JP | skipped | Named in a combined search with no result read for it |
| KR | skipped | Not searched this cycle |
| MX | skipped | Not searched this cycle |
| NG | skipped | Named in a combined search with no result read for it |
| NL | skipped | Not searched this cycle |
| PH | skipped | Not searched this cycle |
| PL | skipped | Not searched this cycle |
| SE | skipped | Not searched this cycle |
| TH | skipped | Not searched this cycle |
| VN | skipped | Not searched this cycle |
| ZA | skipped | Named in a combined search with no result read for it |

---

## Proposed detection improvements

| ID | Tactic | Proposed rule | Target pack/file | Region(s) | FP risk | Priority |
|---|---|---|---|---|---|---|
| D1 | AUSTRAC impersonation | `"austrac"` in `AUTHORITY_MENTIONS` and `TYPOSQUAT_BRANDS`; `"austrac.gov.au"` in `LEGIT_DOMAINS` | `regions/au.ts` | AU | LOW–MEDIUM (see below) | **HIGH** |
| D2 | Agency moves contact to WhatsApp/Telegram | Authority mention + `(contact\|message\|chat\|continue\|reach)…(whatsapp\|telegram)` → +30, opt-in per pack | `regions/au.ts` + `types.ts` + `scamDetector.ts` | AU | LOW | **HIGH** |
| D3 | `netbank` lookalike domains | `"netbank"` in `TYPOSQUAT_WORD_BRANDS` (boundary-matched) | `regions/au.ts` | AU | LOW | MEDIUM |
| D4 | Scam coaching — hide it from the bank | New base phrase list, +30 | `regions/base.ts` + `types.ts` | All | LOW | **HIGH** |
| D5 | Recovered funds held for a release fee | Composite: recovered-funds claim AND release/processing fee → +35 | `scamDetector.ts` (`checkSms`) | All | LOW | **HIGH** |
| D6 | US law-enforcement case wording | Phrases in `URGENCY_FOREIGN_AUTHORITY` (beside jury duty) | `regions/us.ts` | US | LOW | **HIGH** |
| D7 | NZ NCSC impersonation | `"ncsc"`, `"national cyber security centre"` in `AUTHORITY_MENTIONS` | `regions/nz.ts` | NZ | LOW | **HIGH** |
| D8 | Garda Fixed Charge Notice texts | Fixed-charge phrases in `URGENCY_TOLL` | `regions/ie.ts` | IE | LOW | MEDIUM |
| D9 | Stale NZ reporting body | `reportingBody` / flag copy: CERT NZ → NCSC | `regions/nz.ts` | NZ | none (copy) | LOW |

### Proposed lists

**D1** — `au.ts`:

```
AUTHORITY_MENTIONS:  "austrac", "australian transaction reports and analysis centre",
TYPOSQUAT_BRANDS:    "austrac",
LEGIT_DOMAINS:       "austrac.gov.au",
```

FP note: crypto exchanges and remitters do mention AUSTRAC in genuine
KYC email ("under AUSTRAC requirements we must verify your identity"). A bare
mention scores 0 today ("names a government agency, nothing else unusual"),
so the change only bites alongside a link, request or urgency — the same
trade every other AU authority already makes. Exchanges send that copy from
their own domains, which `isOwnDomainSender` already respects on the email
path.

**D2** — opt-in, AU only for now. A pack field (see interface notes), and in
`checkSms`:

```
authority mention (pack authorityMentions, URLs stripped)
AND /\b(contact|message|chat|continue|reach|speak|talk)\b[^.!?]{0,40}\b(on|via|through|using)\s+(whatsapp|telegram)\b/i
→ +30, flag: pack.authorityMessagingAppFlag
```

Flag wording for AU: *"Australian government agencies don't move a case onto
WhatsApp or Telegram — AUSTRAC, the ATO and Scamwatch all say so. A message
from an 'agency' asking you to continue there is the scam."*

**D3** — `au.ts` `TYPOSQUAT_WORD_BRANDS`: `"netbank"`. The word list is
matched against the whole words of the registrable domain, not as a
substring of the hostname. So `netbank-giveaway.com` fires, while
`netbanking.<bank>.com` (the generic login host several non-AU banks use) and
`netbankingportal.com` do not. The genuine NetBank is a *path* on
`commbank.com.au`, which is already trusted. Trade-off: a lookalike that puts
`netbank` only in a subdomain (`netbank.verify-au.com`) is missed. The
substring list would catch it, but at the cost of every `netbanking.` host.

**D4** — new base list, e.g. `secrecyCoaching`, scored +30 per message (not
per hit):

```
"do not tell your bank", "don't tell your bank", "do not tell the bank",
"don't tell the bank", "do not tell bank staff", "don't tell bank staff",
"do not tell the teller", "don't tell the teller",
"tell the bank it is for", "tell the bank it's for",
"if the bank asks why", "do not discuss this call", "don't discuss this call",
"do not discuss this case", "don't discuss this case",
```

Measure the benign set from the table above after implementing, plus
genuine bank anti-scam copy: *"If someone tells you not to tell your bank,
it's a scam"* would match `"not to tell your bank"` but **not** `"do not tell
your bank"`. Keep the imperative forms only, so that copy stays clean.

**D5** — composite in `checkSms`, beside `withdrawalGate`:

```
claim: /\b(funds?|money|losses|payment|deposit)\b[^.!?]{0,40}\b(have|has)\s+been\s+recovered\b/i
       or /\bwe\s+(have\s+)?recovered\b[^.!?]{0,40}(\$|£|€|\d)/i
fee:   /\b(release|processing|clearance|recovery|transfer|administration|admin)\s+fee\b/i
       or /\bpay\b[^.!?]{0,40}\bto\s+release\b/i
both → +35
```

Flag: *"Says your lost money has been recovered but needs a fee to release —
recovery fraud. No police force, regulator or bank charges you to return
recovered funds; this is the same scammer, or one who bought the victim
list, coming back for a second payment."*

**D6** — `us.ts` `URGENCY_FOREIGN_AUTHORITY`, beside the existing
`"money laundering investigation"` (the group already holds domestic
jury-duty phrases, #275):

```
"linked to a money laundering", "used in a money laundering",
"money laundering case", "your identity has been used in",
"federal case against you", "case has been opened against you",
```

**D7** — `nz.ts` `AUTHORITY_MENTIONS`: `"ncsc"`, `"national cyber security centre"`.
`"ncsc"` is four characters and so substring-matched by `mentions()`; no
English word contains it.

**D8** — `ie.ts` `URGENCY_TOLL`: `"fixed charge notice"`, `"unpaid fixed charge"`,
`"fixed charge penalty"`. Garda FCN correspondence is postal only, so any SMS
using the term is the lure.

**D9** — `nz.ts`: `reportingBody: "NCSC (ncsc.govt.nz)"`, `reportingUrl:
"https://www.ncsc.govt.nz"`, and "Report it to the NCSC or Netsafe" in the
foreign-authority flag. Copy only; no score changes.

---

## Pack-interface notes

**D2 needs an opt-in field.** Whether a government contacts people by
WhatsApp is a per-country fact, so the rule cannot live in base and cannot
apply to every pack. Proposed, on `RegionDefinition`:

```ts
/** Set only where the jurisdiction's agencies do not handle cases over
 *  messaging apps. Absent → the authority + WhatsApp/Telegram rule is skipped. */
authorityMessagingAppFlag?: string;
```

The same optional-flag pattern as `senderIdFlag` (skipped where absent).
GB, IE and NZ are plausible next adopters, but each needs its own evidence
that the agencies say so. Do not copy AU's value across.

**D4 needs a base field.** `BaseSignals` has `urgency.voiceClone` and
`urgency.generic`, but both score as urgency (+10), too weak for an
instruction this specific. Proposed: `secrecyCoaching: string[]` on
`BaseSignals`, scored once per message at +30 with its own flag. A region
can extend it later (`"don't tell the post office"` was not evidenced this
cycle and is not proposed).

D1, D3, D5–D9 use existing fields or sit beside an existing composite.

---

## Region demand signal

`TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` are not set in this environment, so
`scripts/region-demand.ts` could not run against production. The local
`local.db` is the development fallback, not production data, and was not
read. No figures are estimated.

---

## Watchlist — deferred or monitored

| Item | Status | Notes |
|---|---|---|
| "Was this you?" bank-transfer texts with no link (PTSB, ANZ NZ) | **DEFERRED — new** | Score 0 without a link, but word-for-word the shape of a genuine bank fraud alert. The link variant is already caught by typosquat. Revisit only with a phrase genuine banks do not use. |
| Bank brand in ad / giveaway text (CommBank car draw) | **DEFERRED — new** | Banks are deliberately absent from `BRAND_MENTIONS`. D3 covers the URL, which is what gets pasted. |
| Authority + messaging-app hand-off for GB/IE/NZ | **MONITORING — new** | D2 is AU-only until each country's agencies are on record. |
| JWR live-keystroke exfiltration (Smishing Triad) | **MONITORING — new** | Changes post-click behaviour, not lure text. |
| "Hi Mum" / "Hi Dad" first-contact opener | **DEFERRED** | No new distinct opener this cycle. |
| India "digital arrest" | **DEFERRED** | `in.ts` multilingual reasoning holds; another July 2026 case does not change it. |
| Physical QR quishing (parking meters) | **EDUCATION GAP** | FTC repeated the warning in September; not detectable from text. |
| myGov multi-benefit compound scoring (AU) | **WATCHLIST** | Unchanged since 2026-09-25. |
| IC3/FBI recovery scam ("ic3 agent", "ic3 case number") | **PARTLY ADDRESSED** | D5 covers the fee-to-release shape regardless of which agency is named. |
| LINE/KakaoTalk recruitment funnels | **DEFERRED** | Insufficient evidence; FP risk. |
| CA French-keyword gap | **BLOCKED** | Pending native reviewer. |
| Smishing Triad TLD rotation | **MONITORING** | No new TLD surfaced beyond `SUSPICIOUS_TLDS`. |
| D2/D3 from 2026-09-27 ("new secure message", DVLA clamping) | **AWAITING DECISION** | Per that file's Status block; not re-proposed. |

---

## Sources

| Source | Tier | Used for |
|---|---|---|
| AUSTRAC — scam alert: scammers impersonating AUSTRAC staff (`austrac.gov.au`, Sep 2026) | 1 | AU-1/D1, AU-2/D2 |
| Scamwatch — browse news and alerts | 1 | AU coverage check |
| NASC — warning after ACCC phone numbers spoofed | 1 | AU (already covered) |
| ATO — scam alerts | 1 | AU (already covered) |
| CommBank — latest scams and security alerts | 1 (own brand) | AU-3/D3 |
| ANZ — scam-coaching trend (Aug 2026) | 2 | BASE-1/D4 |
| FBI IC3 — PSA I-091726-PSA (17 Sep 2026) | 1 | US-1/D6, BASE-1/D4 |
| FTC — consumer alerts, September 2026 | 1 | US coverage check |
| FinCEN — scam-centre digital asset alert | 1 | US coverage check |
| ACCA — beware the latest scam warnings | 2 | GB (already covered) |
| City of London Police — Report Fraud goes live | 1 | GB (already reflected) |
| NCSC NZ — scammers impersonating the NCSC | 1 | NZ-1/D7, D9 |
| Newstalk ZB — Netsafe bank-impersonation warning | 2 | NZ coverage check |
| Cork Safety Alerts — Garda FCN text warning (quotes the Garda statement) | 3 | IE-1/D8 |
| Leinster Express — Gardaí bogus text warning | 3 | IE coverage check |
| CAFC — fraud trends, first six months of 2026 | 1 | CA, BASE-2/D5 |
| Group-IB — JWR kit; Phoenix PhaaS kit | 2 | BASE-3 |
| Singapore Police Force — advisories | 1 | SG (already covered) |
| The Kenya Times — bank-customer text scams | 3 | KE light pass |

`austrac.gov.au` and `group-ib.com` were added to `sources.yml` in this PR.

---

## Issues opened

| ID | Issue | Priority |
|---|---|---|
| D1 | [#425 — AU: AUSTRAC impersonation](https://github.com/alekslinde/veriguard/issues/425) | HIGH |
| D2 | [#426 — AU: agency moves contact to WhatsApp/Telegram](https://github.com/alekslinde/veriguard/issues/426) | HIGH |
| D4 | [#423 — BASE: scam coaching, "don't tell your bank"](https://github.com/alekslinde/veriguard/issues/423) | HIGH |
| D5 | [#424 — BASE: recovered funds held for a release fee](https://github.com/alekslinde/veriguard/issues/424) | HIGH |
| D6 | [#427 — US: law-enforcement "money laundering case" wording](https://github.com/alekslinde/veriguard/issues/427) | HIGH |
| D7 | [#428 — NZ: NCSC impersonation](https://github.com/alekslinde/veriguard/issues/428) (D9 noted on the same issue) | HIGH |

D3 (MEDIUM), D8 (MEDIUM) and D9 (LOW, copy) are not filed, per the HIGH-only
threshold; their full detail is above for a human to triage.
