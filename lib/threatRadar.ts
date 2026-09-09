// Threat radar — what's circulating now, and whether we catch it.
//
// The companion to lib/scamCalendar.ts. The calendar answers "what is likely at
// this time of year"; the radar answers "what turned up in the last few weeks".
// Same discipline applies to both: this is educational data and it does **not**
// touch scoring. A campaign being on the radar must never make a message score
// higher — see the note on `coverage` below for the one place that distinction
// gets subtle.
//
// SOURCE OF TRUTH
//
// Entries are promoted by hand from the weekly sweeps in docs/threat-intel/.
// That indirection is deliberate and worth defending, because the obvious
// alternative — polling the `feed:` URLs in docs/threat-intel/sources.yml and
// rendering the results — is worse in a way that isn't obvious until you look
// at which sources actually have feeds:
//
//   · Tier 1 (Scamwatch, ASIC, IDCARE, the ATO — the sources whose word is
//     sufficient evidence on its own) is almost entirely `check: manual`. They
//     publish no feed. cyber.gov.au is the lone exception.
//   · Most sources that DO have feeds are tier 2 vendor blogs, which skew
//     toward APT and CVE reporting rather than consumer scams, and which have a
//     commercial interest in novelty.
//
// So an auto-populated feed would systematically surface the least AU-relevant,
// most commercially-motivated material while our best sources stayed invisible
// — inverting the trust hierarchy that sources.yml exists to encode. A poller
// is still useful, but as an *input to the sweep*, not as output to users.
//
// WHAT BELONGS HERE
//
// A campaign a person could plausibly meet: something they might receive, click
// or be phoned about. Infrastructure findings do not qualify, however good the
// intel. The sweeps carry plenty of the latter — PhaaS platforms adding AU
// targeting modules, tunnel abuse, hosting shifts — and none of it belongs in
// front of a member of the public, who can do nothing with it. If an entry does
// not lead to a sentence starting "so when you get one of these, …", it is
// research and it stays in docs/.

import type { RegionCode } from "@veriguard/engine/regions";

/**
 * Whether the detector actually catches this campaign today.
 *
 * This field is the reason the radar is worth building rather than linking to a
 * security news feed, and it is also the riskiest thing on the page: `none` and
 * `partial` publicly state a live detection gap.
 *
 * Publishing that is a deliberate call and consistent with the rest of the
 * project — the keyword lists are already open source on the reasoning that
 * transparency buys more than obscurity does. A gap we admit teaches someone to
 * check by hand; a gap we hide gets read as "the tool said fine, so it's fine",
 * which is the more dangerous failure by a wide margin.
 *
 * The subtlety: `covered` describes what the *detector* does, and the radar
 * must not change it. Nothing in this module is read by scamDetector.ts, and no
 * verdict moves because an entry exists. The flag reports on scoring; it is
 * never an input to it.
 *
 *   covered  — shipped rules fire on this; cite the rule in `detection`
 *   partial  — related signals fire, but the distinctive part is not matched
 *   none     — no rule targets this yet; the advice is all the user gets
 *   n/a      — nothing to detect in text (voice calls, physical mail, QR
 *              stickers). Not a gap: it is outside what a text checker can see,
 *              and saying so is more honest than an empty badge.
 */
export type RadarCoverage = "covered" | "partial" | "none" | "n/a";

/**
 * How live the campaign is.
 *
 * `subsided` entries are kept rather than deleted, mirroring the negative-result
 * discipline in docs/threat-intel/README.md: a campaign that quietened down is
 * information, and these recur seasonally. The UI separates them so nothing
 * dormant is presented as current.
 *
 * AUTHORING RULE. `active` means a sweep in the last fortnight confirmed it —
 * in practice `lastSeen` is one of the two most recent roadmap dates. Anything
 * older is `watchlist` even if it feels current, because "circulating now" stops
 * meaning anything the moment it covers everything we have ever recorded. The
 * first draft of this file marked 21 of 24 entries active, which is exactly that
 * failure: a reader learns nothing from a label every entry carries.
 *
 * Two deliberate exceptions, both persistent rather than campaign-shaped:
 * `hi-mum` and `voice-clone-family` stay `active` on older sweep dates because
 * they run continuously at a steady baseline rather than in waves. They are not
 * re-reported every fortnight because nothing about them *changes* — which is a
 * statement about the reporting, not about the risk. An entry only earns this
 * exception if it is a standing tactic; a campaign that merely feels familiar
 * does not qualify and should age into `watchlist` like the rest.
 */
export type RadarStatus = "active" | "watchlist" | "subsided";

/** How a person would actually meet this. Drives the channel chip in the UI. */
export type RadarChannel = "sms" | "email" | "phone" | "web" | "mixed";

export interface ThreatEntry {
  /** Stable identifier — React key, and the anchor a sweep can link to. */
  id: string;
  /** Plain-language name. Not the vendor's branding for the campaign. */
  title: string;
  channel: RadarChannel;
  status: RadarStatus;
  coverage: RadarCoverage;
  /**
   * ISO date (YYYY-MM-DD) of the sweep that first recorded this. Anchored to
   * the roadmap filename so an entry is always traceable to its evidence.
   */
  firstSeen: string;
  /** ISO date of the most recent sweep that still saw it. */
  lastSeen: string;
  /** One or two sentences: what is happening, in the second person. */
  summary: string;
  /**
   * Verbatim-style lures. Concrete strings beat description for recognition.
   *
   * Authored for every entry but not currently rendered: the radar's rows show
   * title, channel, coverage, summary and provenance, because printing lures
   * and advice for all 28 is what made the page 17,000px on a phone. Kept
   * deliberately — it is researched content, it costs nothing at runtime, and
   * it is the obvious source for a per-entry detail view or an email reply. A
   * test asserts every entry has some, so it cannot rot unnoticed.
   */
  lures: string[];
  /** A verifiable habit, not "be careful". Same contract as ScamSeason.advice. Also unrendered — see `lures`. */
  advice: string;
  /**
   * What the detector does about it — one sentence, in user-facing terms.
   * Required for `covered` and `partial`; omitted for `none` and `n/a`, where
   * the badge already says everything true we can say.
   */
  detection?: string;
  /**
   * The sweep this was promoted from, e.g. "2026-08-09". Rendered as a link to
   * the roadmap so a reader can follow the evidence — see roadmapUrl().
   */
  roadmap: string;
}

/**
 * Where the roadmaps are published.
 *
 * They live in docs/ and are not served by the app, so the evidence link has to
 * point at the repository. That is not a workaround: the sweeps are markdown
 * research documents with their own review history, and GitHub renders them
 * with that history attached, which is more of the provenance than a rehosted
 * copy would carry.
 *
 * Hardcoded rather than derived from SITE_URL — the repo origin and the site
 * origin are different things, and deriving one from the other would break the
 * link on any deploy that isn't the canonical one.
 */
const ROADMAP_BASE =
  "https://github.com/alekslinde/veriguard/blob/main/docs/threat-intel";

/**
 * Public URL for the sweep an entry was promoted from.
 *
 * The filename convention is asserted by a test against the real directory, so
 * a renamed roadmap fails CI rather than shipping a 404 in place of the
 * evidence — which would be worse than showing no citation at all.
 */
export function roadmapUrl(entry: ThreatEntry): string {
  return `${ROADMAP_BASE}/${entry.roadmap}-threat-roadmap.md`;
}

// ── Australia ───────────────────────────────────────────────────────────────
//
// Promoted from docs/threat-intel/2026-06-21 through 2026-08-16. Ordered
// roughly by how likely someone is to meet it, not by sweep date — the reader
// wants "what should I know", not our publication history.

const AU_THREATS: ThreatEntry[] = [
  {
    id: "state-gov-impersonation",
    title: "State government agency impersonation",
    channel: "sms",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-23",
    summary:
      "Texts claiming to be from VicRoads, Service NSW, Revenue NSW, Transport NSW or QLD Transport about an unpaid fine or a licence about to be suspended. State agencies were a gap while the scams focused on federal ones, and the kits have moved to fill it. Some now arrive after a phone call from a spoofed government or bank number, which is there to make the text look expected.",
    lures: [
      "\"You have an unpaid fine — pay now to avoid licence suspension\"",
      "\"Your vehicle registration has expired\"",
      "\"Final notice: infringement notice overdue\"",
      "A call from a government or bank caller-ID first, then the text",
      "Fake Service NSW and VicRoads payment pages",
    ],
    advice:
      "No state agency texts you a payment link for a fine. Caller-ID can be faked, so a call beforehand proves nothing. Look the fine up in the Service NSW or VicRoads app, or ring the number on a letter you were already sent — never the one in the message.",
    detection: "We flag these state agency names alongside payment-pressure language.",
    roadmap: "2026-08-09",
  },
  {
    id: "customs-duty-fee",
    title: "Customs and import-duty fee texts",
    channel: "sms",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-09",
    summary:
      "Australia Post and DHL-branded texts saying a parcel is held at customs and needs a clearance fee. The Australian Border Force has confirmed it never asks for payment by SMS.",
    lures: [
      "\"Your parcel is held at customs — pay the clearance fee\"",
      "\"Import duty of $3.50 is outstanding\"",
      "\"Package held at border, release your parcel here\"",
      "\"Customs charge unpaid — delivery cancelled in 24 hours\"",
    ],
    advice:
      "A small, oddly specific fee is the tell — it's priced low enough that paying feels easier than checking. Track the parcel in the official app with the number you got at purchase.",
    detection: "Customs and border-hold phrasing is matched as a parcel-scam signal.",
    roadmap: "2026-08-09",
  },
  {
    id: "clickfix-macos",
    title: "\"Paste this to fix it\" fake error pages",
    channel: "web",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-09",
    lastSeen: "2026-08-16",
    summary:
      "A fake CAPTCHA or browser-error overlay asks you to copy a command and paste it into your computer to prove you're human or fix a problem. Long-running on Windows via the Run box, now also using a Win+X → Windows Terminal route that skips Run entirely, and confirmed in a Mac version that points you at Terminal or Spotlight instead.",
    lures: [
      "\"Press Windows+R, then paste this to verify you're human\"",
      "\"Press Win+X, then I, and paste this into Windows Terminal\"",
      "\"Open Terminal and paste the command below to fix the error\"",
      "\"Press Cmd+Space and paste to continue\"",
      "A fake Cloudflare or \"verify you are human\" screen with a copy button",
    ],
    advice:
      "No website ever needs you to paste a command into your own computer. Nothing legitimate has ever asked this. Close the tab — if you already pasted, disconnect from the internet and get help.",
    detection: "We flag the Run box, the Win+X Windows Terminal route and the macOS Spotlight version of this instruction.",
    roadmap: "2026-08-16",
  },
  {
    id: "health-insurer-impersonation",
    title: "Private health insurer impersonation",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-09",
    summary:
      "Medibank, Bupa, nib and HCF login pages turning up in phishing kits aimed at Australians, usually framed as a policy expiring or a membership suspended.",
    lures: [
      "\"Your policy is expiring — confirm your details to stay covered\"",
      "\"Your membership has been suspended\"",
      "\"You're owed a premium refund — claim it here\"",
      "Fake Medibank and Bupa member login pages",
    ],
    advice:
      "Go to your insurer through the app or a bookmark. Health cover is a slow-moving thing — nothing about it genuinely expires in the next few hours.",
    detection: "These insurer names are matched as impersonation targets.",
    roadmap: "2026-08-09",
  },
  {
    id: "ato-tax-debt",
    title: "ATO tax debt and refund lures",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-08-23",
    summary:
      "The steadiest campaign on the list, and it peaks now. Both directions get used: a refund waiting for your bank details, or a debt with legal action attached. Reports rose sharply through July.",
    lures: [
      "\"Your tax refund is waiting — confirm your bank details\"",
      "\"Outstanding tax debt — legal action will be taken\"",
      "\"Your TFN has been suspended\"",
      "\"Your tax appointment is scheduled — open the attached PDF\"",
      "\"Your myGov account has been locked — click to unlock\"",
      "Fake myGov and ATO login pages",
    ],
    advice:
      "The ATO never sends a link to log in and never threatens arrest by SMS. Open the ATO app, or type my.gov.au yourself.",
    detection: "ATO and myGov impersonation combined with payment or login pressure scores highly.",
    roadmap: "2026-08-09",
  },
  {
    id: "super-rule-change",
    title: "Superannuation \"rule change\" lures",
    channel: "sms",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-09",
    lastSeen: "2026-08-23",
    summary:
      "The July 2026 superannuation changes have been picked up as cover: texts posing as your fund or the ATO saying a rule change affects your balance and you need to verify details to keep access. The current wave often starts with a phone call — a friendly chat first, then the link by text.",
    lures: [
      "\"A new super rule change affects your balance\"",
      "\"Verify your details or lose access to your super\"",
      "\"Changes to your super require immediate action\"",
      "A cold call about your super, followed by a text with a link",
      "\"Secure your super\" campaign pages",
    ],
    advice:
      "Real super rule changes are applied for you and never need you to confirm anything by text. A call doesn't make the text that follows genuine — ring your fund on the number from your annual statement.",
    detection: "Super rule-change phrasing is matched, and scores higher alongside a link or an agency name.",
    roadmap: "2026-08-09",
  },
  {
    id: "svg-attachments",
    title: "SVG image attachments in phishing email",
    channel: "email",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-09",
    lastSeen: "2026-08-09",
    summary:
      "An email arrives with an attachment ending in .svg — an image format that can carry hidden code and opens straight into your browser. Attachment scanners that only inspect Office and PDF files miss it entirely.",
    lures: [
      "\"See the attached invoice\" with a .svg file",
      "\"Open the attached document to view your statement\"",
      "An attachment that opens a login page in a browser tab instead of an image",
    ],
    advice:
      "An image attachment that opens a login page is a scam, every time. Legitimate invoices don't arrive as .svg — if you weren't expecting it, don't open it.",
    detection: "We flag .svg attachment references alongside sender spoofing or urgency.",
    roadmap: "2026-08-09",
  },
  {
    id: "toad-callback",
    title: "Fake subscription renewal callbacks",
    channel: "email",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-07-26",
    lastSeen: "2026-08-09",
    summary:
      "An email confirms a renewal you never bought — Norton, McAfee, PayPal, Geek Squad — for a few hundred dollars, with a phone number to cancel. There is no link to check, which is the point: the number is the trap, and the call ends in remote access to your computer.",
    lures: [
      "\"Your Norton subscription has been renewed — $499.99\"",
      "\"To cancel this charge, call 1800 …\"",
      "An invoice as an image or PDF with no clickable link",
      "\"Your PayPal payment is being processed\"",
    ],
    advice:
      "Never ring the number in the email. Check your actual bank statement — if there's no charge, there's no problem. Reported heavily among older Australians.",
    detection: "We flag renewal-invoice language paired with a callback number and no link.",
    roadmap: "2026-08-09",
  },
  {
    id: "reportcyber-cold-storage",
    title: "Fake \"fund recovery\" using a ReportCyber reference",
    channel: "phone",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-16",
    lastSeen: "2026-08-16",
    summary:
      "A follow-up to an earlier scam: someone posing as a cyber-crime investigator or a \"cryptocurrency representative\" quotes a genuine-looking ReportCyber reference number to prove they're official, then tells you to move your money into a \"cold storage account\" they control while they investigate. AFP and the ACSC flagged this two-actor version this cycle.",
    lures: [
      "\"Your ReportCyber reference is CY-… — quote it to our recovery team\"",
      "\"We can recover the funds you lost — move them to a secure cold storage account\"",
      "A call that arrives soon after you reported an earlier scam",
      "\"Our officer will help you transfer to a safe wallet\"",
    ],
    advice:
      "A reference number proves nothing about who is calling — ReportCyber issues them and never rings you back to move your money. No genuine recovery service asks you to transfer funds to an account you don't control. Hang up and check via cyber.gov.au.",
    detection: "We flag \"cold storage account\" and \"reportcyber reference\" as recovery-scam signals.",
    roadmap: "2026-08-16",
  },
  {
    id: "fake-gambling-platform",
    title: "Fake gambling platforms holding your \"winnings\"",
    channel: "mixed",
    status: "active",
    coverage: "covered",
    firstSeen: "2026-08-31",
    lastSeen: "2026-08-31",
    summary:
      "A text or DM offers VIP access, a bonus or free spins on a betting site you have never used. You appear to win, then the site says the balance can only be released once you verify your account — which means a fee, an ID upload, or both. The winnings were never real. The ACCC recorded a 927% rise in reports over the first half of 2026, and the National Anti-Scam Centre has a dedicated taskforce running to December.",
    lures: [
      "\"Verify your account to withdraw your winnings\"",
      "\"Exclusive bonus for new members — VIP access, limited spots\"",
      "\"Your withdrawal is pending — one final verification step\"",
      "A win that arrives quickly, on a site you did not sign up for",
      "\"Wagering requirement waived for VIP members\"",
    ],
    advice:
      "A licensed operator checks your identity when you open the account or when a payout is processed — it never holds a balance you can already see behind an extra fee or ID upload. If a site is asking you to pay to get your own winnings out, the winnings are the bait. Check the licence on the regulator’s list before depositing anywhere.",
    detection: "We flag messages that tie a verification step to releasing winnings, plus gambling bait with no licensed equivalent.",
    roadmap: "2026-08-31",
  },
  {
    id: "stock-tips-group",
    title: "Investment \"stock tips\" group invites",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-16",
    lastSeen: "2026-08-16",
    summary:
      "An invite to a WhatsApp or Telegram \"stock tips\" group, \"investment club\" or \"exclusive trading group\" promising coordinated buys and expert picks. ASIC tied one run of these to $2.7M lost in a fortnight — the group talks a stock up, then dumps it on the members who bought in.",
    lures: [
      "\"Join our exclusive stock tips group — members only\"",
      "\"VIP investment club with guaranteed picks\"",
      "A group chat pushing an ASX-lookalike trading platform",
      "\"Our closed trading group is up 300% this month\"",
    ],
    advice:
      "A real broker doesn't recruit through a group chat, and a coordinated \"buy now\" signal is the scam, not a tip-off. Check any platform against ASIC's list at moneysmart.gov.au before putting in a cent.",
    detection: "We flag \"stock tips group\", \"investment club\" and \"exclusive/closed trading group\" as investment-recruitment signals.",
    roadmap: "2026-08-16",
  },
  {
    id: "courier-collection",
    title: "Bank or police \"courier\" sent to collect your card or cash",
    channel: "phone",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-16",
    lastSeen: "2026-08-16",
    summary:
      "A caller posing as your bank's fraud team or the police says your account is compromised and a courier will come to your home to collect your card or cash \"for safekeeping\" while they investigate. A convergent pattern across Australia, the UK and Ireland this cycle.",
    lures: [
      "\"A courier will collect your card for safekeeping\"",
      "\"Withdraw the cash and hand it to our officer\"",
      "\"We're sending someone to collect your bank card\"",
      "A request to cut your card in half and hand over the pieces",
    ],
    advice:
      "No bank or police force ever sends someone to your home for your card or your cash — that request is the scam by itself. Hang up and ring your bank on the number printed on the back of your card.",
    detection: "We flag courier-collection phrasing — \"a courier will collect\", \"send a courier\", \"collect/hand over your card\".",
    roadmap: "2026-08-16",
  },
  {
    id: "crypto-exchange-impersonation",
    title: "AU crypto exchange impersonation",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-02",
    summary:
      "CoinSpot and Swyftx impersonation with fake security alerts, following an AFP warning. Lookalike domains are used heavily since crypto transfers can't be reversed.",
    lures: [
      "\"Suspicious login detected — verify your wallet\"",
      "\"Your withdrawal is pending approval\"",
      "Lookalike domains such as swyftx-account and coinspot-verify",
      "\"Complete verification or your account will be frozen\"",
    ],
    advice:
      "Type the exchange address in yourself and check the domain character by character. A crypto transfer cannot be reversed — there is no chargeback, so the check has to happen first.",
    detection: "Exchange names are matched, and lookalike domain patterns score separately.",
    roadmap: "2026-08-02",
  },
  {
    id: "energy-utility",
    title: "Energy and utility impersonation",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-02",
    summary:
      "AGL and Origin impersonation running both ways — a rebate to claim, or a disconnection to avoid. Winter bills and cost-of-living rebates in the news make both plausible.",
    lures: [
      "\"Your energy rebate is ready — claim it now\"",
      "\"Final notice before disconnection\"",
      "\"Your account is overdue — pay to avoid interruption\"",
      "Fake AGL and Origin billing pages",
    ],
    advice:
      "Log in to your energy account directly. Real rebates are applied to your bill — they're never paid out after you enter card details.",
    detection: "Energy retailer names combined with disconnection or rebate pressure are flagged.",
    roadmap: "2026-08-02",
  },
  {
    id: "voicemail-lures",
    title: "Fake voicemail notifications",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-08-02",
    lastSeen: "2026-08-02",
    summary:
      "A text or email saying you have a new voicemail, with a link to hear it. The curiosity gap does the work — there's no threat and no urgency, just a message you might have missed.",
    lures: [
      "\"You have a new voicemail message\"",
      "\"Missed call — listen to your message here\"",
      "\"Voicemail transcription attached\"",
    ],
    advice:
      "Voicemail lives in your phone's own app or on your carrier's service — it never needs a link from a text. Check the app instead.",
    detection: "Voicemail-notification phrasing paired with a link is flagged.",
    roadmap: "2026-08-02",
  },
  {
    id: "toll-road-smishing",
    title: "Toll road texts (Linkt, E-Toll)",
    channel: "sms",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-08-02",
    summary:
      "Linkt and E-Toll impersonation over a small unpaid toll. Amounts stay under about $10 deliberately — small enough that paying is less effort than checking, which is what makes the campaign profitable at volume.",
    lures: [
      "\"You have an unpaid toll of $4.80\"",
      "\"Your toll account is suspended\"",
      "\"Pay now to avoid a $195 fine\"",
      "Lookalike Linkt domains",
    ],
    advice:
      "Check your toll account in the Linkt app or by typing the address yourself. A trivial amount plus a large threatened fine is the signature of this one.",
    detection: "Toll operator names and unpaid-toll phrasing are matched as a dedicated campaign.",
    roadmap: "2026-06-21",
  },
  {
    id: "deepfake-investment",
    title: "Deepfake celebrity investment platforms",
    channel: "web",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-07-01",
    lastSeen: "2026-07-26",
    summary:
      "Ads and articles using AI-generated video of Australian public figures endorsing trading platforms. ASIC has named several by name — Quantum AI and Immediate Edge among them.",
    lures: [
      "\"[Celebrity] reveals the platform banks don't want you to know about\"",
      "Named platforms: Quantum AI, Immediate Edge, Bitcoin Revolution",
      "A fake news article carrying a familiar masthead's styling",
      "\"Start with $250 and earn daily returns\"",
    ],
    advice:
      "No public figure endorses a trading platform in a video ad. Check ASIC's investor alert list before any investment, and treat guaranteed daily returns as proof of fraud.",
    detection: "ASIC-named platform names score highly on their own.",
    roadmap: "2026-07-26",
  },
  {
    id: "quishing",
    title: "QR codes in phishing (quishing)",
    channel: "mixed",
    status: "watchlist",
    // `covered`, not `partial`. Both halves ship: the text side matches
    // scan-prompt language *and* the inverted PDF-hybrid phrasing ("the
    // attachment contains a QR code", D7/#113) that the generic patterns miss,
    // and the image side decodes the code client-side via jsqr in CheckFlow and
    // feeds the URL through the normal scoring path. Downgrading this to
    // `partial` claimed a gap that does not exist — which is the same failure as
    // hiding a real one, just pointed the other way.
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-07-26",
    summary:
      "A QR code stands in for a link, in an email, a PDF attachment, or a sticker over a real code on a parking meter or EV charger. The destination is hidden until you've already scanned it, and the code itself carries no text for a filter to read.",
    lures: [
      "\"Scan to view your invoice\" in an email with no link",
      "A PDF attachment whose only content is a QR code",
      "Stickers over legitimate codes on parking meters and chargers",
      "\"Scan to verify your account\"",
    ],
    advice:
      "Preview the address before opening — most phone cameras show it first, or upload a photo of the code here and we'll check it. On a parking meter, check whether the code is a sticker sitting on top of a printed one.",
    detection:
      "We flag scan-this-code wording, including the \"the attached PDF contains a QR code\" phrasing. You can also upload a photo of the code — we read it on your device and check where it actually goes.",
    roadmap: "2026-07-26",
  },
  {
    id: "rental-bond-fraud",
    title: "Rental and bond \"updated bank details\"",
    channel: "email",
    status: "watchlist",
    coverage: "partial",
    firstSeen: "2026-07-26",
    lastSeen: "2026-07-26",
    summary:
      "An email in an existing rental thread saying the agency's bank details have changed, timed to when a bond or first month's rent is due. Often follows a real compromised agency mailbox, so the thread and signature are genuine.",
    lures: [
      "\"Please note our bank details have changed\"",
      "\"Updated remittance details for your bond payment\"",
      "A reply inside a real thread with a slightly different sender address",
    ],
    advice:
      "Any bank-detail change gets a phone call to a number you already had — never one from the email. Send $1 first and confirm it landed before the rest.",
    detection:
      "Rental wording plus a bank-detail change scores highly, and \"our details have changed\" is flagged on its own. But a compromised real mailbox has no spoofing for us to catch, so the phone call is still the check that works.",
    roadmap: "2026-07-26",
  },
  {
    id: "foreign-authority-diaspora",
    title: "Foreign authority impersonation",
    channel: "phone",
    status: "watchlist",
    coverage: "partial",
    firstSeen: "2026-07-26",
    lastSeen: "2026-07-26",
    summary:
      "Callers posing as Chinese police, embassy or customs officials, targeting diaspora communities in Australia and usually conducted in Mandarin or Cantonese. The script involves an alleged crime committed in your name and a bond to clear it.",
    lures: [
      "A parcel intercepted containing contraband in your name",
      "An arrest warrant issued in China requiring a bond",
      "\"Do not tell your family — this is a confidential investigation\"",
      "A demand to move to WeChat or an encrypted app",
    ],
    advice:
      "No foreign police force can arrest you in Australia or demand money here. The secrecy instruction is the tell — it exists to stop you asking someone. Hang up and tell someone anyway.",
    detection:
      "Named foreign authorities — Chinese police, customs, the embassy, the consulate, the Public Security Bureau — are flagged in text, in either word order. But the pressure here happens on a live call we never see, which is why this stays a partial catch.",
    roadmap: "2026-07-26",
  },
  {
    id: "myid-reregistration",
    title: "myID re-registration phishing",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-07-26",
    lastSeen: "2026-07-26",
    summary:
      "The myGovID rename to myID is being used as cover: messages claim your identity needs re-registering or migrating to the new system or you'll lose access to government services.",
    lures: [
      "\"myGovID is now myID — re-register to keep access\"",
      "\"Your digital identity requires migration\"",
      "\"Account verification required for the new myID system\"",
    ],
    advice:
      "The rename needed nothing from you. Get the myID app from the official app store, never a link — and no government service asks you to re-register by text.",
    detection: "myID and myGov impersonation combined with verification pressure is flagged.",
    roadmap: "2026-07-26",
  },
  {
    id: "food-delivery",
    title: "Food delivery platform impersonation",
    channel: "mixed",
    status: "active",
    coverage: "covered",
    firstSeen: "2026-07-01",
    lastSeen: "2026-09-06",
    summary:
      "Uber Eats, DoorDash and Menulog impersonation — a refund for an order that went wrong, or a driver needing address confirmation. Now also aimed at drivers rather than customers: a message about an account problem that ends with a one-time code being read out, after which the earnings in the account are gone.",
    lures: [
      "\"Your order was cancelled — claim your refund\"",
      "\"Driver needs you to confirm your address\"",
      "\"You have an unclaimed credit of $25\"",
      "\"Your driver account is suspended — verify to keep working\"",
      "A support agent asking you to read back the code just texted to you",
    ],
    advice:
      "Refunds happen inside the app you ordered in. Open the app and check your order history — nothing legitimate needs card details re-entered for a refund. If you drive: no platform ever needs the code it just sent you, and anyone asking for it is taking your account.",
    detection: "Delivery platform names paired with refund or confirmation pressure are flagged, as is being asked to pass on a one-time code.",
    roadmap: "2026-09-06",
  },
  {
    id: "nbn-telco",
    title: "NBN and telco disconnection threats",
    channel: "phone",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-07-01",
    lastSeen: "2026-07-01",
    summary:
      "Calls and texts claiming your NBN or phone service is about to be disconnected, usually leading to a remote-access request to \"fix\" the connection.",
    lures: [
      "\"Your NBN service will be disconnected today\"",
      "\"Technical fault detected on your line\"",
      "\"Install this app so we can fix your connection\"",
      "\"Your router has been compromised\"",
    ],
    advice:
      "NBN Co has no customers and never calls you — your retailer does. Nobody legitimate needs remote access to your computer to fix a phone line.",
    detection: "NBN and telco disconnection language plus remote-access requests are flagged.",
    roadmap: "2026-07-01",
  },
  {
    id: "voice-clone-family",
    title: "AI voice cloning of family members",
    channel: "phone",
    status: "active",
    coverage: "n/a",
    firstSeen: "2026-06-21",
    lastSeen: "2026-07-01",
    summary:
      "A call in a familiar voice — a child, a grandchild — in trouble and needing money now. A few seconds of audio from social media is enough to clone a voice convincingly.",
    lures: [
      "A distressed call from a number you don't recognise",
      "\"I've been in an accident and need bail money\"",
      "\"I'm stranded overseas, don't tell Dad\"",
      "Pressure to pay before you can call anyone back",
    ],
    advice:
      "Agree a family code word now, before you need it. Hang up and ring the person back on the number you already have — a real emergency survives a two-minute call back.",
    roadmap: "2026-07-01",
  },
  {
    id: "hi-mum",
    title: "\"Hi Mum\" messages from a new number",
    channel: "sms",
    status: "active",
    // `partial`, corrected 2026-08-10. This claimed `covered` with "dedicated
    // detection, including the reluctance-to-call pattern" — neither is true.
    // base.ts URGENCY_VOICE_CLONE covers the *escalation* ("bail money",
    // "stranded overseas", "don't tell mum") but has nothing for the opening
    // message, which is the one people actually receive: "Hi Mum, new number,
    // phone broke" scores 0. The code comment marks that half "D17 — watchlist",
    // i.e. surveyed and never implemented. Found by the coverage-claim test.
    coverage: "partial",
    firstSeen: "2026-06-21",
    lastSeen: "2026-07-01",
    summary:
      "A WhatsApp or SMS from an unknown number claiming to be your child, phone broken or lost, moving to a payment request within a few messages.",
    lures: [
      "\"Hi Mum, this is my new number — my phone broke\"",
      "\"Can you pay this bill for me? I'll pay you back\"",
      "Reluctance to take a phone call",
    ],
    advice:
      "Ring the old number. A broken phone doesn't break the number — and someone who won't take a call is telling you something.",
    detection:
      "We catch the money stage — \"bail money\", \"stranded overseas\", \"don't tell Mum\". The opening message is the gap: \"Hi Mum, new number\" on its own reads exactly like a real one, so ringing the old number is the check that works.",
    roadmap: "2026-06-21",
  },
  {
    id: "loyalty-points",
    title: "Loyalty points expiry phishing",
    channel: "mixed",
    status: "active",
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-09-06",
    summary:
      "Flybuys, Everyday Rewards and Qantas Frequent Flyer impersonation saying points expire imminently. Back through August and September in a bank-branded form — CommBank Awards points \"about to expire\", leading to a fake NetBank sign-in.",
    lures: [
      "\"Your 12,000 points expire in 48 hours\"",
      "\"Claim your reward before it's forfeited\"",
      "\"Your CommBank Awards points are about to expire — redeem now\"",
      "Fake Flybuys, Everyday Rewards and NetBank login pages",
    ],
    advice:
      "Check your points balance in the app. Loyalty programs give long notice of expiry — never 48 hours. A points reminder that lands you on a bank sign-in page is after the bank account, not the points.",
    detection: "Loyalty program names paired with expiry pressure are flagged, and the bank-branded variants are caught on the brand and the link together.",
    roadmap: "2026-09-06",
  },
  {
    id: "immigration-visa",
    title: "Visa and immigration scams",
    channel: "mixed",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-06-21",
    summary:
      "Home Affairs impersonation aimed at visa holders — an application problem, a fee outstanding, or a status about to lapse. Targets people whose situation genuinely does depend on paperwork and deadlines.",
    lures: [
      "\"Your visa application requires an additional fee\"",
      "\"Your visa status will be cancelled\"",
      "\"Immigration compliance action pending\"",
      "Offers of guaranteed visa approval for a fee",
    ],
    advice:
      "Check ImmiAccount directly. No registered migration agent guarantees an outcome, and Home Affairs never takes payment by gift card or bank transfer to a personal account.",
    detection: "Home Affairs and visa-status language paired with payment demands is flagged.",
    roadmap: "2026-06-21",
  },
  {
    id: "acsc-remote-access",
    title: "Cyber security agency impersonation",
    channel: "phone",
    status: "watchlist",
    coverage: "covered",
    firstSeen: "2026-06-21",
    lastSeen: "2026-06-21",
    summary:
      "Callers posing as the ACSC or ASD saying your computer is compromised and they need remote access to secure it. Impersonating the agency people are told to trust on exactly this.",
    lures: [
      "\"We've detected malicious activity on your device\"",
      "\"Install AnyDesk so we can secure your system\"",
      "\"Your bank account is being accessed right now\"",
      "\"Move your money to a safe account we'll set up\"",
    ],
    advice:
      "The ACSC does not ring individuals about their computers. Nobody legitimate asks for remote access, and there is no such thing as a safe account someone else sets up for you.",
    detection: "Agency impersonation paired with remote-access tooling names is flagged.",
    roadmap: "2026-06-21",
  },
  {
    id: "sim-swap",
    title: "SIM swap and phone porting fraud",
    channel: "phone",
    status: "watchlist",
    coverage: "n/a",
    firstSeen: "2026-07-26",
    lastSeen: "2026-07-26",
    summary:
      "Your number is ported to an attacker's SIM, so the SMS codes protecting your bank arrive on their phone. The theft happens at the carrier — you may see nothing until service drops.",
    lures: [
      "Your phone losing service unexpectedly and staying dead",
      "An unrequested porting confirmation from your carrier",
      "Being asked to read out a porting authorisation code",
    ],
    advice:
      "If your phone loses service for no reason, treat it as an emergency and ring your carrier from another phone. Set a porting PIN with your carrier now, and use an authenticator app rather than SMS codes where you can.",
    roadmap: "2026-07-26",
  },
];

// `satisfies` rather than a plain annotation, so RadarRegion below resolves to
// exactly the authored regions instead of widening to every RegionCode. Same
// reasoning as CALENDARS in lib/scamCalendar.ts.
const RADARS = {
  AU: AU_THREATS,
} satisfies Partial<Record<RegionCode, ThreatEntry[]>>;

export type RadarRegion = keyof typeof RADARS;

function isRadarRegion(code: RegionCode): code is RadarRegion {
  return code in RADARS;
}

/**
 * The region codes with an authored radar.
 *
 * Derived from RADARS rather than hand-listed, so it can never drift from the
 * data. Mirrors authoredCalendarRegions() in lib/scamCalendar.ts — the two
 * modules are deliberately parallel.
 *
 * Today this is AU alone. That is the point of exporting it: the promotion
 * freshness check reads this instead of a hardcoded "AU", so the day a second
 * region grows a radar it is measured automatically rather than silently
 * skipped — and until then, the gap between this list and the calendar's is
 * itself the honest coverage signal.
 */
export function authoredRadarRegions(): RadarRegion[] {
  return Object.keys(RADARS) as RadarRegion[];
}

/**
 * Entries authored for a region, or an empty list where we have none.
 *
 * Empty is the honest answer. Showing a British user Australian toll-road
 * campaigns would be worse than showing nothing — same contract as
 * calendarForRegion(), and for the same reason.
 */
export function radarForRegion(code: RegionCode): ThreatEntry[] {
  return isRadarRegion(code) ? RADARS[code] : [];
}

/** Entries by status, in authored order. */
export function threatsByStatus(code: RegionCode, status: RadarStatus): ThreatEntry[] {
  return radarForRegion(code).filter((t) => t.status === status);
}

/** Currently-circulating entries. The headline list. */
export function activeThreats(code: RegionCode): ThreatEntry[] {
  return threatsByStatus(code, "active");
}

/**
 * Entries the detector does not fully catch — `partial` and `none`.
 *
 * Surfaced as its own group because it is the part of the radar a reader can
 * act on. Most entries are `covered`, so the badge is near-constant and carries
 * almost no information scanning down the page; the handful of exceptions are the
 * ones worth pulling out. `n/a` is deliberately excluded —
 * a voice call is not a gap in our coverage, it is outside what a text checker
 * can ever see, and mixing the two would overstate the shortfall.
 */
export function uncoveredThreats(code: RegionCode): ThreatEntry[] {
  return radarForRegion(code).filter(
    (t) => t.coverage === "partial" || t.coverage === "none",
  );
}

/** The channel filter's selection: a channel, or every channel. */
export type ChannelFilterValue = RadarChannel | "all";

/**
 * Entries matching the selected channel. "all" passes everything through.
 *
 * Pure and here rather than inline in the component so it can be tested without
 * a browser — the same reason lib/toc.ts holds the table-of-contents selection.
 */
export function filterByChannel(
  entries: ThreatEntry[],
  channel: ChannelFilterValue,
): ThreatEntry[] {
  return channel === "all" ? entries : entries.filter((e) => e.channel === channel);
}

/**
 * How many entries each channel has in this region.
 *
 * Counted across the whole board rather than the filtered view, so the numbers
 * on the filter buttons stay put as the reader switches between them. Every
 * channel is present in the result, including those with zero — the caller
 * decides whether to offer an empty one.
 */
export function channelCounts(code: RegionCode): Record<RadarChannel, number> {
  const counts: Record<RadarChannel, number> = { sms: 0, email: 0, phone: 0, web: 0, mixed: 0 };
  for (const entry of radarForRegion(code)) counts[entry.channel] += 1;
  return counts;
}

/** Counts behind the at-a-glance line. Derived so they cannot drift. */
export interface RadarSummary {
  total: number;
  active: number;
  watchlist: number;
  covered: number;
  uncovered: number;
}

export function radarSummary(code: RegionCode): RadarSummary {
  const entries = radarForRegion(code);
  return {
    total: entries.length,
    active: entries.filter((t) => t.status === "active").length,
    watchlist: entries.filter((t) => t.status === "watchlist").length,
    covered: entries.filter((t) => t.coverage === "covered").length,
    uncovered: uncoveredThreats(code).length,
  };
}

/**
 * The most recent `lastSeen` across a region's entries — the radar's "as at"
 * date.
 *
 * Derived rather than hand-maintained: a separate constant would drift the
 * moment someone added an entry without touching it, and a stale date on a page
 * about what's current is worse than no date. Returns null for an unauthored
 * region, where there is nothing to date.
 */
export function lastUpdated(code: RegionCode): string | null {
  const entries = radarForRegion(code);
  if (entries.length === 0) return null;
  return entries.reduce((latest, t) => (t.lastSeen > latest ? t.lastSeen : latest), entries[0].lastSeen);
}

/**
 * Whether an ISO date string is a real YYYY-MM-DD calendar date.
 *
 * Exported for tests rather than called at render: a malformed date is an
 * authoring bug for CI to catch, not a runtime branch. String comparison is
 * what orders these dates (see lastUpdated), and that is only valid for
 * zero-padded, fixed-width, real dates — "2026-8-9" sorts before "2026-08-02"
 * and would silently report the wrong "as at" date on the page.
 */
export function isWellFormedDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() + 1 === Number(m) &&
    date.getUTCDate() === Number(d)
  );
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Human-readable date, e.g. "9 August 2026".
 *
 * Parses the parts directly rather than going through Date so the rendered
 * string can't shift by a day in a timezone behind UTC — the same class of bug
 * CivilDate exists to prevent in lib/scamCalendar.ts. Returns the input
 * unchanged if it isn't a well-formed date, so a bad value shows as itself
 * rather than as "NaN undefined".
 */
export function formatRadarDate(iso: string): string {
  if (!isWellFormedDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month]} ${year}`;
}
