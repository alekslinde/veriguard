// Scam calendar — which campaigns spike, and when.
//
// Purely educational: this module feeds a calendar view that teaches people what
// to expect at this time of year. It does **not** touch scoring. A verdict must
// not change because of the date — a tax scam in March is still a tax scam, and
// a legitimate ATO email in July is still legitimate. Seasonality raises the
// *base rate* of a campaign, which is useful for a human to know and dangerous
// for a scorer to assume, so it stays out of scamDetector entirely.
//
// The data mirrors the region-pack pattern in lib/regions: seasons are data, not
// logic, and are authored per region. AU, GB, US, CA, IE and NZ are authored;
// any other region resolves to an empty list and the UI hides the section rather
// than showing the wrong country's tax dates to a reader (see calendarForRegion).
//
// Each season carries its own provenance (`sources`) and a `reviewed` date, so
// the calendar can show its working and its freshness the way the threat radar
// does — see the SeasonSource note and lastReviewed() below. Adding or refreshing
// seasons is documented in docs/scam-calendar/README.md.
//
// Windows are month/day pairs with no year, because these recur annually. That
// makes them comparable across years but means a window can wrap the year end
// (Christmas parcel scams run late November into early January) — isActiveOn
// handles that case explicitly rather than assuming start <= end.

import type { RegionCode } from "@veriguard/engine/regions";

/** A recurring annual window. Month is 1-12 to match how people write dates. */
export interface SeasonWindow {
  /** 1-12. */
  startMonth: number;
  startDay: number;
  /** 1-12. */
  endMonth: number;
  endDay: number;
}

/**
 * How reliably this campaign spikes in its window.
 *
 * Honesty matters more than drama here: `fixed` is a date the calendar itself
 * guarantees (tax lodgement opens July 1 every year), while `floating` shifts
 * annually (Black Friday tracks US Thanksgiving) and `elevated` is a broad
 * seasonal lift rather than a sharp spike. The UI says which, so nobody reads a
 * soft trend as a hard deadline.
 */
export type SeasonConfidence = "fixed" | "floating" | "elevated";

/**
 * A citation backing a season — a named authority and the page that supports it.
 *
 * The calendar's answer to the radar's `roadmap` link. A season with no source
 * is a claim with no evidence, and a tool that publicly tells people "this is
 * the scam to expect now" has to be able to show the working — the same
 * reasoning that keeps the detector's keyword lists open (see CLAUDE.md). Prefer
 * a regulator or consumer-protection body: it dates the claim and gives a reader
 * somewhere independent to check it. URLs are validated in CI (see the test and
 * scripts/check-calendar-sources.ts) so a rotted citation surfaces rather than
 * decaying into an unsourced assertion.
 */
export interface SeasonSource {
  /** Short name of the body, e.g. "Scamwatch", "HMRC", "IRS". */
  label: string;
  /** https URL to the supporting page. Reachability is checked out of band. */
  url: string;
  /**
   * `"blocked"` — edge bot-protection refuses every automated request, so
   * reachability is unverifiable from CI. The checker reports it as expected
   * rather than as rot.
   *
   * Same flag and same semantics as the threat-intel registry's `expect:
   * blocked`. Use sparingly: each one is a citation the job has stopped
   * genuinely checking, so it must be verified in a browser when set and
   * re-verified whenever the season is reviewed. It is NOT a way to silence a
   * 403 that is really a moved page — Garda returned 403 on a path that had
   * genuinely moved, and the root still answered, which is how to tell the two
   * apart: if the site's root responds and the path does not, it is rot.
   */
  expect?: "blocked";
}

export interface ScamSeason {
  /** Stable identifier — used as a React key and for message lookups. */
  id: string;
  /** Short display name, e.g. "Tax season". */
  title: string;
  window: SeasonWindow;
  confidence: SeasonConfidence;
  /** One sentence on why this window is busy. */
  why: string;
  /** The specific lures that spike. Concrete beats abstract for recognition. */
  lures: string[];
  /**
   * What to actually do. Phrased as a verifiable habit rather than "be careful",
   * so the calendar teaches a check rather than just raising anxiety.
   */
  advice: string;
  /**
   * At least one authoritative citation. Required, not optional: an unsourced
   * season is exactly the magic-number decay docs/threat-intel exists to prevent,
   * pointed at the calendar. The provenance test fails an empty list.
   */
  sources: SeasonSource[];
  /**
   * ISO date (YYYY-MM-DD) this entry was last checked against its sources. Drives
   * the "Reviewed <date>" line via lastReviewed(), the same freshness signal the
   * radar carries — a page about what's current is worse than useless if a reader
   * can't tell whether it is itself current.
   */
  reviewed: string;
}

// ── Australia ───────────────────────────────────────────────────────────────
//
// Sourced from the campaigns already detected in lib/regions/au.ts, so the
// calendar explains signals the tool genuinely looks for rather than inventing
// a parallel taxonomy. Where au.ts carries a keyword group, the season below
// names the same campaign.
//
// Sources are named authorities, reused across seasons. Landing pages rather
// than dated press releases where possible: a body's scam hub outlives any one
// alert, so it rots less and stays the right place for a reader to check now.

const AU = {
  scamwatch: { label: "Scamwatch", url: "https://www.scamwatch.gov.au" },
  accc: { label: "ACCC", url: "https://www.accc.gov.au" },
  ato: { label: "ATO", url: "https://www.ato.gov.au/online-services/scams-cyber-safety-and-identity-protection" },
  auspost: { label: "Australia Post", url: "https://auspost.com.au/about-us/about-our-site/online-security-scams-fraud/scam-alerts" },
  servicesaustralia: { label: "Services Australia", url: "https://www.servicesaustralia.gov.au/scams" },
  moneysmart: { label: "MoneySmart", url: "https://moneysmart.gov.au/online-safety/protect-yourself-from-scams" },
  acma: { label: "ACMA", url: "https://www.acma.gov.au/scams" },
  studyassist: { label: "StudyAssist", url: "https://www.studyassist.gov.au" },
} satisfies Record<string, SeasonSource>;

const AU_SEASONS: ScamSeason[] = [
  {
    id: "tax-time",
    title: "Tax season",
    // Lodgement opens 1 July; ATO impersonation reports peaked in July and stay
    // elevated while returns are processed and debts issued.
    window: { startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 },
    confidence: "fixed",
    why: "Tax returns open on 1 July, so a message about your refund or a tax debt suddenly looks plausible. ATO impersonation reports jump sharply in July and stay high while returns are processed.",
    lures: [
      "\"Your tax refund is waiting — confirm your bank details\"",
      "\"You have an outstanding tax debt, legal action will be taken\"",
      "Fake myGov and ATO login pages",
      "\"Your myGov account has been locked — click to unlock\"",
      "\"Your TFN has been suspended\"",
    ],
    advice: "The ATO never sends a link to log in, and never threatens arrest by SMS. Open the ATO app or type my.gov.au yourself — never follow the link in the message.",
    sources: [AU.ato, AU.scamwatch],
    reviewed: "2026-09-11",
  },
  {
    id: "eofy-business",
    title: "End of financial year",
    // June: invoice/BAS pressure on businesses before the 30 June close.
    window: { startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 },
    confidence: "fixed",
    why: "Businesses are pushing through invoices and BAS before 30 June, so a fake invoice or a \"we've changed our bank details\" email lands in a pile of real ones.",
    lures: [
      "Fake supplier invoices with changed bank details",
      "\"Update your payment details before EOFY\"",
      "Fake super contribution deadline notices",
    ],
    advice: "Any bank-detail change on an invoice gets a phone call to a number you already had — not the number on the invoice. This is the single most expensive scam for Australian businesses.",
    sources: [AU.scamwatch, AU.accc],
    reviewed: "2026-08-16",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    // Floating: tracks US Thanksgiving (fourth Thursday of November), so the
    // window is deliberately wide rather than pinned to a date that moves.
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Everyone is expecting deals from brands they don't normally hear from, which is exactly the cover a fake store or discount SMS needs.",
    lures: [
      "Fake online stores advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand impersonation SMS with shortened links",
      "Too-good-to-be-true prices on sold-out items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping the ad or the text. If a store is new to you, check how long the domain has existed before you enter card details.",
    sources: [AU.scamwatch, AU.accc],
    reviewed: "2026-08-16",
  },
  {
    id: "christmas-parcels",
    title: "Christmas parcel season",
    // Wraps the year end — the January tail covers returns and late deliveries.
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so \"delivery failed\" is a guess that pays off far more often than usual.",
    lures: [
      "\"Your parcel is held — pay a redelivery fee\"",
      "Fake Australia Post and courier tracking pages",
      "\"Invalid postal code, update your address\"",
      "Fake charity appeals in the giving season",
    ],
    advice: "Australia Post never asks for a fee by SMS link. Track parcels in the official app using the tracking number you were given at purchase.",
    sources: [AU.auspost, AU.scamwatch],
    reviewed: "2026-09-11",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app signups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money in six months.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or share \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who moves the conversation to investing, is running a script. Money sent is money gone — reverse-image-search their photos.",
    sources: [AU.scamwatch, AU.moneysmart],
    reviewed: "2026-09-11",
  },
  {
    id: "winter-energy",
    title: "Winter energy bills",
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Winter bills are high and cost-of-living rebates are in the news, so both \"you owe us\" and \"here's your rebate\" find willing readers.",
    lures: [
      "\"Your energy rebate is ready — claim it now\"",
      "Fake AGL, Origin and EnergyAustralia disconnection notices",
      "\"Final notice before disconnection\"",
    ],
    advice: "Log in to your energy account directly to check any balance or rebate. Real rebates are applied to your bill, not paid out after you enter your card details.",
    sources: [AU.scamwatch, AU.accc],
    reviewed: "2026-08-16",
  },
  {
    id: "back-to-school",
    title: "Back to school & enrolment",
    window: { startMonth: 1, startDay: 10, endMonth: 2, endDay: 20 },
    confidence: "elevated",
    why: "School fees, uniform orders and enrolment paperwork all move in the same few weeks, and parents are paying invoices from addresses they've never seen before.",
    lures: [
      "Fake school fee invoices with altered bank details",
      "\"Confirm your child's enrolment details\"",
      "Fake student discount and device offers",
    ],
    advice: "Confirm any school payment request through the school's published phone number before paying, especially if the bank details differ from last term.",
    sources: [AU.scamwatch, AU.accc],
    reviewed: "2026-08-16",
  },
  {
    id: "uni-offers",
    title: "University offers & enrolment",
    // Main-round offers land in January; enrolment, HECS-HELP and scholarship
    // paperwork run through February. Overlaps back-to-school but the target is
    // different — school-age parents vs. new tertiary students — and so are the
    // lures, so it earns its own row rather than folding in.
    window: { startMonth: 1, startDay: 5, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Offers, enrolment fees and scholarship paperwork all move in the same few weeks, and a new student has no baseline for what the university's real emails and fees look like yet.",
    lures: [
      "\"Pay your enrolment deposit now to secure your place\"",
      "\"You've been awarded a scholarship — pay a processing fee to release it\"",
      "\"Your HECS-HELP debt is overdue\"",
      "Fake student accommodation deposits paid by bank transfer",
    ],
    advice: "Log in to your offer through the tertiary admission centre or the university's own site, never a link in a message. No genuine scholarship charges a fee to release it.",
    sources: [AU.scamwatch, AU.studyassist],
    reviewed: "2026-08-16",
  },
  {
    id: "disaster-recovery",
    title: "Natural disaster & recovery scams",
    // The bushfire/flood season and the fake-charity + fake-grant wave that
    // follows a named event. Deliberately wide — the trigger is a disaster, not
    // a date — and it wraps because the Australian high-risk season runs from
    // spring into autumn.
    window: { startMonth: 10, startDay: 1, endMonth: 3, endDay: 31 },
    confidence: "elevated",
    why: "After a bushfire or flood, fake charity appeals and fake \"disaster relief grant\" messages ride the genuine wave of donations and government support, when people most want to help or need help fast.",
    lures: [
      "A charity appeal for a disaster that's in the news, pushing an urgent link",
      "\"You're eligible for a disaster recovery payment — confirm your bank details\"",
      "Fake GoFundMe-style pages for named victims",
      "Door-to-door or SMS offers for urgent clean-up and repairs, paid upfront",
    ],
    advice: "Donate through the charity's own website, not a link you were sent. Real disaster payments come through myGov and Services Australia — they never arrive as a text asking for your bank details.",
    sources: [AU.scamwatch, AU.servicesaustralia],
    reviewed: "2026-08-16",
  },
  {
    id: "winter-health",
    title: "Medicare & health season",
    // Runs alongside winter-energy through the colder months, when health is
    // top-of-mind and Medicare/myGov lures land more easily. Distinct campaign
    // from the energy one despite the shared window.
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Cold-and-flu season puts health front of mind, so a message about your Medicare card, a rebate or a suspended benefit feels routine rather than odd.",
    lures: [
      "\"Your Medicare card has been suspended — verify to reactivate\"",
      "\"You have an unclaimed Medicare rebate\"",
      "Fake myGov and Medicare login pages",
      "\"Confirm your details for your flu vaccine booking\"",
    ],
    advice: "Medicare lives in the myGov app or Express Plus Medicare — it never suspends your card by SMS. Open the app yourself instead of tapping any link.",
    sources: [AU.servicesaustralia, AU.scamwatch],
    reviewed: "2026-08-16",
  },
  {
    id: "eofy-donations",
    title: "EOFY tax-deductible giving",
    // June again, but the lure is the tax-deduction deadline rather than the
    // business invoice pressure eofy-business covers. Same crowded month, a
    // genuinely different pitch and a different target.
    window: { startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 },
    confidence: "elevated",
    why: "The 30 June deduction deadline drives a surge of last-minute giving, and fake charities and fake receipts ride it — \"donate before EOFY to claim it this year\".",
    lures: [
      "\"Donate before June 30 to claim your tax deduction\"",
      "A charity you've never heard of pushing an urgent end-of-year appeal",
      "Fake tax-deductible receipts for donations you didn't make",
      "Pressure to give by gift card or direct transfer",
    ],
    advice: "Check a charity is a deductible-gift recipient on ABN Lookup, and give through its own website. A real charity is happy for you to donate next week — pressure to beat a deadline is the tell.",
    sources: [AU.accc, AU.ato],
    reviewed: "2026-09-11",
  },
  {
    id: "spring-racing",
    title: "Spring racing & betting scams",
    // Floating: pinned to the Melbourne Cup (first Tuesday in November), so the
    // window is deliberately wide rather than fixed to a moving date.
    window: { startMonth: 10, startDay: 1, endMonth: 11, endDay: 10 },
    confidence: "floating",
    why: "The spring carnival pulls in once-a-year punters who don't know the legitimate betting sites, which is exactly the cover a fake bookie or a \"guaranteed tips\" service needs.",
    lures: [
      "\"Guaranteed winning tips — join our VIP punters' group\"",
      "Fake betting sites advertised on social media around the Cup",
      "\"You've won our Melbourne Cup sweep — pay a fee to release it\"",
      "\"Verify your account to withdraw your winnings\" on a betting site",
      "Offers to recover money lost to a previous betting scam",
    ],
    advice: "Only bet with operators licensed in Australia — check the licence on the regulator's list. Nobody can guarantee a win, and no legitimate prize needs a fee to release it. A site that holds winnings you can already see behind a \"verification\" fee is a fake platform, not a slow payout.",
    sources: [AU.scamwatch, AU.acma],
    reviewed: "2026-09-06",
  },
  {
    id: "summer-travel",
    title: "Summer holiday & travel scams",
    // Wraps the year end across the main AU holiday period — bookings made now
    // for a summer break, and the fake-listing wave that rides them.
    window: { startMonth: 11, startDay: 15, endMonth: 1, endDay: 31 },
    confidence: "elevated",
    why: "Everyone is booking a summer break at once, so a too-cheap holiday rental or flight deal has a ready audience and a plausible reason to rush you.",
    lures: [
      "A holiday rental well below market price, with payment by bank transfer",
      "\"Confirm your booking\" texts linking to a fake airline or hotel page",
      "Fake travel agents advertising unbeatable package deals",
      "\"Your flight is cancelled — pay a rebooking fee\"",
    ],
    advice: "Book through a platform you know and pay by card, never a direct transfer to a private account. If a listing pushes you off the platform to pay, walk away.",
    sources: [AU.scamwatch, AU.accc],
    reviewed: "2026-08-16",
  },
];

// ── United Kingdom ────────────────────────────────────────────────────────────
//
// The tax anchor is the Self Assessment deadline (31 January), not a July peak
// as in AU. Black Friday, romance and the parcel rush are near-universal but
// name local couriers and bodies.

const GB = {
  // Action Fraud's edge refuses every automated request, including its own root,
  // so CI cannot verify it either way. Verified in a browser 2026-09-11 and it is
  // still the UK's national reporting body. Contrast Garda, which 403'd on a path
  // that had genuinely moved while its root answered — that asymmetry is the tell.
  actionfraud: { label: "Action Fraud", url: "https://www.actionfraud.police.uk", expect: "blocked" },
  ncsc: { label: "NCSC", url: "https://www.ncsc.gov.uk/collection/phishing-scams" },
  hmrc: { label: "HMRC", url: "https://www.gov.uk/report-suspicious-emails-websites-phishing" },
  takefive: { label: "Take Five", url: "https://takefive-stopfraud.org.uk" },
  citizensadvice: { label: "Citizens Advice", url: "https://www.citizensadvice.org.uk/consumer/scams/check-if-something-might-be-a-scam" },
} satisfies Record<string, SeasonSource>;

const GB_SEASONS: ScamSeason[] = [
  {
    id: "self-assessment",
    title: "Self Assessment tax deadline",
    window: { startMonth: 1, startDay: 1, endMonth: 1, endDay: 31 },
    confidence: "fixed",
    why: "The 31 January online filing deadline puts tax front of mind, so an HMRC \"rebate\" or \"you owe tax\" message suddenly looks like part of the paperwork you're already doing.",
    lures: [
      "\"You are due a tax rebate — claim before the deadline\"",
      "\"HMRC: outstanding tax, legal action will follow\"",
      "Fake HMRC and Government Gateway login pages",
      "\"Your National Insurance number has been compromised\"",
    ],
    advice: "HMRC never texts or emails a link to claim a refund or to pay. Sign in through GOV.UK yourself, and report suspicious messages to phishing@hmrc.gov.uk.",
    sources: [GB.hmrc, GB.actionfraud],
    reviewed: "2026-08-10",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Shoppers expect deals from brands they don't normally hear from, which is exactly the cover a fake store or discount text needs.",
    lures: [
      "Fake online shops advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand-impersonation texts with shortened links",
      "Prices far below the going rate on hard-to-get items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping an ad or text. Pay by card for the protection it gives, and be wary of a shop that only takes bank transfer.",
    sources: [GB.takefive, GB.actionfraud],
    reviewed: "2026-08-10",
  },
  {
    id: "christmas-parcels",
    title: "Christmas parcel season",
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so a \"missed delivery\" or \"pay a small fee\" text is a guess that pays off far more often than usual.",
    lures: [
      "\"Royal Mail: a fee is due to redeliver your parcel\"",
      "Fake Evri, DPD and Royal Mail tracking pages",
      "\"Your address is incomplete — update it to receive your parcel\"",
      "A small \"customs charge\" on an item from abroad",
    ],
    advice: "Couriers don't ask for card details by text to release a parcel. Track it on the courier's own app or site using the reference from the sender.",
    sources: [GB.actionfraud, GB.ncsc],
    reviewed: "2026-08-10",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app sign-ups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money months later.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or investment \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who steers the chat towards investing, is following a script. Never send money — and reverse-image-search their photos.",
    sources: [GB.actionfraud, GB.citizensadvice],
    reviewed: "2026-08-10",
  },
  {
    id: "winter-energy",
    title: "Winter energy & cost-of-living",
    window: { startMonth: 10, startDay: 1, endMonth: 3, endDay: 31 },
    confidence: "elevated",
    why: "Winter bills are high and government support schemes are in the news, so both \"you're owed a rebate\" and \"pay now or be cut off\" find willing readers. The Ofgem price cap changes on 1 October, and the announcement is reliably followed within days by a wave of \"allowance\" and \"rebate\" texts riding the coverage.",
    lures: [
      "\"You're eligible for an energy rebate — apply now\"",
      "Fake supplier disconnection notices",
      "\"Ofgem/Government cost-of-living payment — confirm your bank details\"",
      "Fake council tax refund messages",
      "\"Benefit entitlement check required\" — a generic eligibility form that never names the payment",
      "\"You are eligible for an energy support allowance of £350 — claim at …\"",
      "\"Claim your bill rebate\" in the days after a price-cap announcement",
    ],
    advice: "Government support is applied automatically or through GOV.UK — never a link asking for your bank details. The DWP writes by letter or through your Universal Credit journal; it doesn't text you an eligibility form. Check any bill by logging in to your supplier directly. A price-cap change in the news is not a reason to trust a text about it — that is precisely when these arrive.",
    sources: [GB.takefive, GB.citizensadvice],
    reviewed: "2026-09-06",
  },
  {
    id: "summer-holiday",
    title: "Summer holiday & travel scams",
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Holiday booking peaks over summer, so a too-cheap villa, flight or package has a ready audience and a reason to rush you.",
    lures: [
      "A holiday let well below market price, paid by bank transfer",
      "Fake package-holiday and flight deals advertised on social media",
      "\"Confirm your booking\" links to fake airline or hotel pages",
      "Cloned travel-agent websites",
    ],
    advice: "Book with an ATOL/ABTA-protected provider and pay by card. If a listing pushes you to pay by transfer or off-platform, walk away.",
    sources: [GB.actionfraud, GB.citizensadvice],
    reviewed: "2026-08-10",
  },
];

// ── United States ─────────────────────────────────────────────────────────────
//
// Tax season runs to the 15 April filing deadline; the parcel carriers and the
// health-cover season are the local specifics.

const US = {
  ftc: { label: "FTC", url: "https://consumer.ftc.gov/scams" },
  irs: { label: "IRS", url: "https://www.irs.gov/newsroom/tax-scams-consumer-alerts" },
  uspis: { label: "USPIS", url: "https://www.uspis.gov/news" },
  cisa: { label: "CISA", url: "https://www.cisa.gov/secure-our-world" },
  studentaid: { label: "Federal Student Aid", url: "https://studentaid.gov/announcements-events/scams" },
} satisfies Record<string, SeasonSource>;

const US_SEASONS: ScamSeason[] = [
  {
    id: "tax-season",
    title: "Tax season",
    window: { startMonth: 1, startDay: 15, endMonth: 4, endDay: 15 },
    confidence: "fixed",
    why: "Filing runs to the 15 April deadline, so an IRS \"refund\" or \"back taxes\" message lands while taxes are already on your mind.",
    lures: [
      "\"Your tax refund is pending — verify your details\"",
      "\"IRS final notice: back taxes owed, arrest warrant issued\"",
      "Fake IRS and state tax login pages",
      "\"Verify your identity to release your refund\"",
    ],
    advice: "The IRS makes first contact by mail, never by text or email, and never threatens arrest. Don't click — check your account at IRS.gov by typing it in yourself.",
    sources: [US.irs, US.ftc],
    reviewed: "2026-08-10",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Shoppers expect deals from brands they don't normally hear from, which is exactly the cover a fake store or discount text needs.",
    lures: [
      "Fake online stores advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand-impersonation texts with shortened links",
      "Too-good-to-be-true prices on sold-out items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping the ad or the text. Pay by credit card for the protection it gives.",
    sources: [US.ftc, US.cisa],
    reviewed: "2026-08-10",
  },
  {
    id: "holiday-parcels",
    title: "Holiday shopping & delivery",
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on packages, so a \"failed delivery\" or \"pay a small fee\" text is a guess that pays off far more often than usual.",
    lures: [
      "\"USPS: your package can't be delivered — update your address\"",
      "Fake UPS and FedEx tracking pages",
      "\"A small redelivery fee is required\"",
      "\"Customs charge unpaid — package on hold\"",
    ],
    advice: "The Postal Service doesn't text you for a fee or address unless you signed up for tracking. Check with the carrier's official site using the number from the sender.",
    sources: [US.uspis, US.ftc],
    reviewed: "2026-08-10",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app sign-ups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money months later.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or investment \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who moves the chat toward investing, is running a script. Never send money — and reverse-image-search their photos.",
    sources: [US.ftc],
    reviewed: "2026-08-10",
  },
  {
    id: "open-enrollment",
    title: "Health insurance open enrollment",
    window: { startMonth: 11, startDay: 1, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "ACA open enrollment fills late fall with genuine plan messages, so fake \"navigators\" and bogus low-cost plans blend into the noise.",
    lures: [
      "\"Limited-time health plan — enroll now for $0 premium\"",
      "Robocalls offering to sign you up over the phone",
      "\"Verify your Medicare/Medicaid details to keep coverage\"",
      "Fake marketplace and insurer login pages",
    ],
    advice: "Enroll only through HealthCare.gov or your state marketplace, typed in yourself. Real plans don't cold-call you for payment or your Social Security number.",
    sources: [US.ftc, US.cisa],
    reviewed: "2026-08-10",
  },
  {
    id: "back-to-school",
    title: "Back to school & student loans",
    window: { startMonth: 7, startDay: 15, endMonth: 9, endDay: 15 },
    confidence: "elevated",
    why: "Term start brings tuition, aid and supply spending together, and student-loan \"forgiveness\" offers ride whatever the latest policy news is.",
    lures: [
      "\"You qualify for student loan forgiveness — apply now for a fee\"",
      "\"Act before the deadline to discharge your loans\"",
      "Fake scholarship and financial-aid portals",
      "Fake student-discount and device offers",
    ],
    advice: "Federal loan help is always free through studentaid.gov — anyone charging a fee to apply is a scam. Never share your FSA ID.",
    sources: [US.studentaid, US.ftc],
    reviewed: "2026-08-10",
  },
];

// ── Canada ────────────────────────────────────────────────────────────────────
//
// CRA filing runs to the 30 April deadline; winter utility-shutoff threats and
// the parcel rush are the local specifics.

const CA = {
  cafc: { label: "Anti-Fraud Centre", url: "https://antifraudcentre-centreantifraude.ca" },
  cra: { label: "CRA", url: "https://www.canada.ca/en/revenue-agency/corporate/security/protect-yourself-against-fraud.html" },
  competition: { label: "Competition Bureau", url: "https://competition-bureau.canada.ca/en/fraud-and-scams" },
  getcybersafe: { label: "Get Cyber Safe", url: "https://www.getcybersafe.gc.ca" },
} satisfies Record<string, SeasonSource>;

const CA_SEASONS: ScamSeason[] = [
  {
    id: "tax-season",
    title: "Tax season",
    window: { startMonth: 2, startDay: 15, endMonth: 4, endDay: 30 },
    confidence: "fixed",
    why: "Returns are due by 30 April, so a CRA \"refund\" or \"tax owing\" message lands while taxes are already on your mind.",
    lures: [
      "\"You have a refund waiting — confirm your details by Interac e-Transfer\"",
      "\"CRA: taxes owing, arrest warrant if unpaid\"",
      "Fake CRA My Account login pages",
      "\"Your SIN has been suspended\"",
    ],
    advice: "The CRA never demands payment by e-Transfer, gift card or crypto, and never threatens arrest. Sign in to My Account by typing canada.ca yourself.",
    sources: [CA.cra, CA.cafc],
    reviewed: "2026-08-10",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Shoppers expect deals from brands they don't normally hear from, which is exactly the cover a fake store or discount text needs.",
    lures: [
      "Fake online stores advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand-impersonation texts with shortened links",
      "Too-good-to-be-true prices on sold-out items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping the ad or the text. Pay by credit card for the protection it gives.",
    sources: [CA.competition, CA.cafc],
    reviewed: "2026-09-11",
  },
  {
    id: "holiday-parcels",
    title: "Holiday parcel season",
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so a \"missed delivery\" or \"pay a small fee\" text is a guess that pays off far more often than usual.",
    lures: [
      "\"Canada Post: a fee is due to redeliver your parcel\"",
      "Fake UPS, FedEx and Purolator tracking pages",
      "\"Update your address to receive your parcel\"",
      "\"Customs duty unpaid — package on hold\"",
    ],
    advice: "Canada Post doesn't text you for a fee to release a parcel. Track it on the carrier's own site using the number from the sender.",
    sources: [CA.cafc, CA.getcybersafe],
    reviewed: "2026-08-10",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app sign-ups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money months later.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or investment \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who moves the chat toward investing, is running a script. Never send money — and reverse-image-search their photos.",
    sources: [CA.cafc],
    reviewed: "2026-08-10",
  },
  {
    id: "winter-utility",
    title: "Winter utility shut-off threats",
    window: { startMonth: 11, startDay: 1, endMonth: 3, endDay: 31 },
    confidence: "elevated",
    why: "In the cold months a \"pay now or your power is cut off today\" call carries real menace, which is what the scam runs on.",
    lures: [
      "\"Your hydro will be disconnected within the hour — pay now\"",
      "Demands for payment by prepaid card or Bitcoin",
      "\"You're owed a utility rebate — confirm your banking details\"",
      "Spoofed calls showing your utility's real number",
    ],
    advice: "Utilities give written notice and never demand gift cards or crypto. Hang up and call the number on a real bill to check your account.",
    sources: [CA.cafc, CA.competition],
    reviewed: "2026-09-11",
  },
  {
    id: "summer-travel",
    title: "Summer travel scams",
    window: { startMonth: 5, startDay: 15, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Summer booking peaks, so a too-cheap cabin, flight or package has a ready audience and a reason to rush you.",
    lures: [
      "A vacation rental well below market price, paid by e-Transfer",
      "Fake flight and package deals on social media",
      "\"Confirm your booking\" links to fake airline or hotel pages",
      "Cloned travel-agency websites",
    ],
    advice: "Book through a platform you know and pay by credit card, never a direct transfer to a person. If a listing pushes you off-platform to pay, walk away.",
    sources: [CA.cafc, CA.competition],
    reviewed: "2026-09-11",
  },
];

// ── Ireland ───────────────────────────────────────────────────────────────────
//
// The tax anchor is the self-assessed pay & file deadline (31 October, extended
// to mid-November for ROS filers). Winter energy and the parcel rush are the
// other local specifics.

const IE = {
  fraudsmart: { label: "FraudSMART", url: "https://www.fraudsmart.ie" },
  revenue: { label: "Revenue", url: "https://www.revenue.ie/en/online-services/support/security/index.aspx" },
  ccpc: { label: "CCPC", url: "https://www.ccpc.ie/manage-your-money/scams-and-frauds" },
  garda: { label: "Garda", url: "https://www.garda.ie/en/crime/fraud/" },
} satisfies Record<string, SeasonSource>;

const IE_SEASONS: ScamSeason[] = [
  {
    id: "revenue-deadline",
    title: "Revenue pay & file deadline",
    window: { startMonth: 10, startDay: 1, endMonth: 11, endDay: 15 },
    confidence: "fixed",
    why: "The self-assessed income-tax deadline falls in this window, so a Revenue \"refund\" or \"amount due\" message lands while tax is already on your mind.",
    lures: [
      "\"You are due a tax refund — submit your bank details\"",
      "\"Revenue: outstanding tax, legal action pending\"",
      "Fake Revenue and myAccount/ROS login pages",
      "\"Your PPSN has been suspended\"",
    ],
    advice: "Revenue never texts or emails a link to claim a refund or make a payment. Sign in through myAccount or ROS on revenue.ie yourself, and report suspicious messages to Revenue.",
    sources: [IE.revenue, IE.fraudsmart],
    reviewed: "2026-08-10",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Shoppers expect deals from brands they don't normally hear from, which is exactly the cover a fake store or discount text needs.",
    lures: [
      "Fake online shops advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand-impersonation texts with shortened links",
      "Prices far below the going rate on hard-to-get items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping an ad or text. Pay by card, and be wary of a shop that only takes bank transfer.",
    sources: [IE.ccpc, IE.fraudsmart],
    reviewed: "2026-09-11",
  },
  {
    id: "christmas-parcels",
    title: "Christmas parcel season",
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so a \"missed delivery\" or \"customs fee\" text is a guess that pays off far more often than usual.",
    lures: [
      "\"An Post: a fee is due to redeliver your parcel\"",
      "Fake An Post, DPD and Fastway tracking pages",
      "\"A customs charge is due on your item\"",
      "\"Update your address to receive your parcel\"",
    ],
    advice: "An Post doesn't text you for a fee by link to release a parcel. Track it on the courier's own site using the reference from the sender.",
    sources: [IE.fraudsmart, IE.garda],
    reviewed: "2026-09-11",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app sign-ups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money months later.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or investment \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who steers the chat towards investing, is following a script. Never send money — and reverse-image-search their photos.",
    sources: [IE.fraudsmart, IE.garda],
    reviewed: "2026-09-11",
  },
  {
    id: "winter-energy",
    title: "Winter energy & cost-of-living",
    window: { startMonth: 10, startDay: 1, endMonth: 3, endDay: 31 },
    confidence: "elevated",
    why: "Winter bills are high and support schemes are in the news, so both \"you're owed a credit\" and \"pay now or be cut off\" find willing readers.",
    lures: [
      "\"You're due an energy credit — confirm your bank details\"",
      "Fake supplier disconnection notices",
      "\"Electric Ireland/SSE refund pending — verify to release it\"",
      "Fake government cost-of-living payment messages",
    ],
    advice: "Government supports are applied automatically or through official channels — never a link asking for your bank details. Check any bill by logging in to your supplier directly.",
    sources: [IE.fraudsmart, IE.ccpc],
    reviewed: "2026-09-11",
  },
  {
    id: "summer-holiday",
    title: "Summer holiday & travel scams",
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Holiday booking peaks over summer, so a too-cheap let, flight or package has a ready audience and a reason to rush you.",
    lures: [
      "A holiday let well below market price, paid by bank transfer",
      "Fake package-holiday and flight deals on social media",
      "\"Confirm your booking\" links to fake airline or hotel pages",
      "Cloned travel-agent websites",
    ],
    advice: "Book with a bonded, licensed travel agent and pay by card. If a listing pushes you to pay by transfer or off-platform, walk away.",
    sources: [IE.ccpc, IE.fraudsmart],
    reviewed: "2026-09-11",
  },
  {
    id: "student-accommodation",
    title: "Student accommodation hunt",
    window: { startMonth: 8, startDay: 1, endMonth: 10, endDay: 15 },
    confidence: "elevated",
    why: "College offers land in August and term starts in September, so thousands of students are hunting scarce rooms at once — a shortage a fake landlord can exploit with a room that was never available.",
    lures: [
      "\"The landlord is abroad\" — so no viewing, and the keys come by post",
      "A deposit by bank transfer to \"hold\" or \"secure\" the room",
      "Listings well below market rent, pushed off-platform to WhatsApp",
      "Pressure to pay today because \"someone else is interested\"",
    ],
    advice: "Never pay a deposit for a room you or someone you trust hasn't stood inside. A landlord who can't do a viewing and wants a transfer is the whole scam in one sentence.",
    sources: [IE.garda, IE.fraudsmart],
    reviewed: "2026-09-11",
  },
];

// ── New Zealand ───────────────────────────────────────────────────────────────
//
// The tax year ends 31 March and Inland Revenue issues automatic assessments
// through the following months, which is when refund/bill lures land. The rest
// tracks the southern-hemisphere calendar — winter power, summer holidays.

const NZ = {
  // CERT NZ was folded into the National Cyber Security Centre, and NCSC sends
  // individuals to Own Your Online — so the BODY changed, not just the URL.
  // Citing "CERT NZ" now names an organisation that no longer publishes.
  cert: { label: "Own Your Online (NCSC)", url: "https://www.ownyouronline.govt.nz/personal/get-protected/" },
  netsafe: { label: "Netsafe", url: "https://netsafe.org.nz/scams/" },
  ird: { label: "Inland Revenue", url: "https://www.ird.govt.nz/managing-my-tax/scams" },
  consumerprotection: { label: "Consumer Protection", url: "https://www.consumerprotection.govt.nz/general-help/scamwatch/" },
} satisfies Record<string, SeasonSource>;

const NZ_SEASONS: ScamSeason[] = [
  {
    id: "ird-assessments",
    title: "Tax assessment season",
    window: { startMonth: 4, startDay: 1, endMonth: 7, endDay: 31 },
    confidence: "elevated",
    why: "The tax year ends 31 March and Inland Revenue issues automatic assessments over the following months, so an IRD \"refund\" or \"bill\" message looks like the one you're expecting.",
    lures: [
      "\"You have a tax refund — confirm your bank details\"",
      "\"IRD: tax to pay, act now to avoid penalties\"",
      "Fake myIR login pages",
      "\"Your IRD number needs to be verified\"",
    ],
    advice: "Inland Revenue puts refunds and bills in myIR and never texts a link for your bank details. Log in to myIR by typing ird.govt.nz yourself.",
    sources: [NZ.ird, NZ.consumerprotection],
    reviewed: "2026-08-10",
  },
  {
    id: "black-friday",
    title: "Black Friday & Cyber Monday",
    window: { startMonth: 11, startDay: 15, endMonth: 12, endDay: 5 },
    confidence: "floating",
    why: "Shoppers expect deals from brands they don't normally hear from, which is exactly the cover a fake store or discount text needs.",
    lures: [
      "Fake online stores advertised on social media",
      "\"Your exclusive discount code expires in 1 hour\"",
      "Brand-impersonation texts with shortened links",
      "Too-good-to-be-true prices on sold-out items",
    ],
    advice: "Type the retailer's address in yourself rather than tapping the ad or the text. Pay by credit card for the protection it gives.",
    sources: [NZ.consumerprotection, NZ.cert],
    reviewed: "2026-09-11",
  },
  {
    id: "christmas-parcels",
    title: "Christmas parcel season",
    window: { startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 },
    confidence: "elevated",
    why: "You're genuinely waiting on parcels, so a \"missed delivery\" or \"customs fee\" text is a guess that pays off far more often than usual.",
    lures: [
      "\"NZ Post: a fee is due to redeliver your parcel\"",
      "Fake NZ Post and CourierPost tracking pages",
      "\"A customs charge is due on your item\"",
      "\"Update your address to receive your parcel\"",
    ],
    advice: "NZ Post doesn't text you for a fee by link to release a parcel. Track it on the courier's own site using the reference from the sender.",
    sources: [NZ.netsafe, NZ.consumerprotection],
    reviewed: "2026-08-10",
  },
  {
    id: "romance",
    title: "Valentine's & romance scams",
    window: { startMonth: 1, startDay: 20, endMonth: 2, endDay: 28 },
    confidence: "elevated",
    why: "Dating-app sign-ups spike around Valentine's Day, and romance scams are patient — the contact made now is the one asking for money months later.",
    lures: [
      "Fast-moving affection from someone who won't video call",
      "A crypto or investment \"opportunity\" introduced by a new partner",
      "An emergency needing money before you've ever met",
    ],
    advice: "Anyone who won't video call, and anyone who moves the chat toward investing, is running a script. Never send money — and reverse-image-search their photos.",
    sources: [NZ.netsafe, NZ.consumerprotection],
    reviewed: "2026-08-10",
  },
  {
    id: "winter-power",
    title: "Winter power bills",
    window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 },
    confidence: "elevated",
    why: "Winter power bills are high, so both \"you're overdue\" and \"here's your rebate\" find willing readers in the cold months.",
    lures: [
      "\"Your power will be disconnected — pay now to avoid it\"",
      "\"You're owed a power rebate — confirm your bank details\"",
      "Fake retailer billing and login pages",
      "\"Winter Energy Payment — verify your details\"",
    ],
    advice: "Log in to your power account directly to check any balance or credit. Government payments like the Winter Energy Payment are applied automatically — never after you enter card details.",
    sources: [NZ.consumerprotection, NZ.cert],
    reviewed: "2026-09-11",
  },
  {
    id: "summer-holiday",
    title: "Summer holiday & travel scams",
    window: { startMonth: 11, startDay: 15, endMonth: 1, endDay: 31 },
    confidence: "elevated",
    why: "Everyone is booking a summer break at once, so a too-cheap bach, flight or package has a ready audience and a reason to rush you.",
    lures: [
      "A holiday rental or bach well below market price, paid by bank transfer",
      "Fake flight and package deals on social media",
      "\"Confirm your booking\" links to fake airline or hotel pages",
      "Cloned travel-agency websites",
    ],
    advice: "Book through a platform you know and pay by credit card, never a direct transfer to a person. If a listing pushes you off-platform to pay, walk away.",
    sources: [NZ.consumerprotection, NZ.netsafe],
    reviewed: "2026-08-10",
  },
];

// `satisfies` (rather than a plain annotation) keeps the literal key type, so
// CalendarRegion below resolves to exactly the authored regions instead of
// widening to every RegionCode.
const CALENDARS = {
  AU: AU_SEASONS,
  GB: GB_SEASONS,
  US: US_SEASONS,
  CA: CA_SEASONS,
  IE: IE_SEASONS,
  NZ: NZ_SEASONS,
} satisfies Partial<Record<RegionCode, ScamSeason[]>>;

/**
 * The regions that actually have an authored calendar, derived from CALENDARS
 * rather than declared alongside it.
 *
 * This is what couples the two maps below: REGION_TIMEZONE is keyed by this
 * type, so adding seasons for a new region without adding its timezone is a
 * compile error rather than a silent revert to the raw server clock — which
 * would reintroduce the very off-by-one-day bug regionToday exists to fix. The
 * omission is invisible at runtime (regionToday falls back rather than throws),
 * so the type is the only place it can be caught.
 */
export type CalendarRegion = keyof typeof CALENDARS;

/** Narrows an arbitrary region code to one that has an authored calendar. */
function isCalendarRegion(code: RegionCode): code is CalendarRegion {
  return code in CALENDARS;
}

/**
 * IANA timezone used to decide what "today" is for a region's calendar.
 *
 * Necessary because the server clock is not the user's clock: in production it
 * is UTC, and AEST is UTC+10. Reading the raw server date would place an AU user
 * loading the page at 9am on 1 July into 30 June — showing "Tax season" as
 * *upcoming* on the exact morning ATO lodgement opens, which is precisely when
 * the advice matters most. Every AU-facing date here (1 July, 30 June EOFY) sits
 * on a boundary that a ten-hour skew crosses.
 *
 * One zone per region is a deliberate simplification. Australia spans three, so
 * this is the eastern seaboard where most of the population lives; the error for
 * a Perth user is at most two hours on a boundary day, against a guaranteed ten
 * hours for everyone if we used UTC. Seasons are month-scale windows, so a
 * two-hour edge case is immaterial in a way a systematic skew is not.
 */
const REGION_TIMEZONE: Record<CalendarRegion, string> = {
  AU: "Australia/Sydney",
  // One zone per region, same deliberate simplification as AU: the seaboard/
  // heartland where most of the population lives, accepting a small edge-case
  // error on a boundary day against a guaranteed skew from using UTC.
  GB: "Europe/London",
  US: "America/New_York",
  CA: "America/Toronto",
  IE: "Europe/Dublin",
  NZ: "Pacific/Auckland",
};

/**
 * A civil date with no instant and no timezone attached — just "what day is it
 * where the user is". Month is 1-12, matching how the windows are authored.
 *
 * Deliberately not a Date. The value is resolved on the server and then crosses
 * the RSC boundary into client components, and a Date carries an *instant*: the
 * browser re-reads it through getMonth()/getDate() in the device's timezone, so
 * a device set to UTC+13 shifts the day forward and can show a season as active
 * a day early. A plain {month, day} means the same thing on both sides of the
 * wire, which is the only property that matters here.
 */
export interface CivilDate {
  /** 1-12. */
  month: number;
  day: number;
}

/** Reads a Date's local-time fields as a CivilDate. */
function toCivilDate(date: Date): CivilDate {
  return { month: date.getMonth() + 1, day: date.getDate() };
}

/**
 * What the windowing functions accept. A Date is convenient at a call site that
 * already has one (tests, and any server-side caller); a CivilDate is what
 * survives the trip to a client component.
 */
export type DateLike = Date | CivilDate;

function asCivilDate(date: DateLike): CivilDate {
  return date instanceof Date ? toCivilDate(date) : date;
}

/**
 * Today's civil date in a region's local timezone.
 *
 * Intl gives the correct civil date without a timezone library and handles DST
 * itself. Returning month/day rather than a Date is what makes the result safe
 * to hand to a client component (see CivilDate).
 */
export function regionToday(code: RegionCode, now: Date = new Date()): CivilDate {
  // A region with no calendar has no seasons to place, so the server date is
  // harmless there — the lookup is total over the regions that do have one.
  if (!isCalendarRegion(code)) return toCivilDate(now);
  const timeZone = REGION_TIMEZONE[code];

  // en-CA formats as YYYY-MM-DD, so the parts are unambiguous by type.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const field = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = field("year");
  const month = field("month");
  const day = field("day");

  // Intl should always supply all three; if a runtime somehow doesn't, fall back
  // to the server date rather than constructing an invalid one.
  if (!year || !month || !day) return toCivilDate(now);

  return { month, day };
}

/**
 * Seasons authored for a region, or an empty list where we have none.
 *
 * Empty is the honest answer, not a reason to substitute Australia's calendar:
 * the whole point of the region packs is that showing AU tax dates to a UK user
 * is worse than showing nothing. Callers render nothing on an empty list.
 */
export function calendarForRegion(code: RegionCode): ScamSeason[] {
  return isCalendarRegion(code) ? CALENDARS[code] : [];
}


/**
 * The region codes with an authored calendar.
 *
 * Derived from CALENDARS rather than hand-listed, so it can never drift from the
 * data. Exported for tests (they iterate every authored region) and for any
 * caller that needs to enumerate coverage.
 */
export function authoredCalendarRegions(): CalendarRegion[] {
  return Object.keys(CALENDARS) as CalendarRegion[];
}

/**
 * Whether an ISO date string is a real YYYY-MM-DD calendar date.
 *
 * The `reviewed` field is compared as a string in lastReviewed(), which is only
 * valid for zero-padded, fixed-width, real dates — "2026-8-9" would sort before
 * "2026-08-02" and report the wrong "as at" date. Exported for the provenance
 * test rather than called at render: a malformed date is an authoring bug for CI
 * to catch. Mirrors the identically-named check in lib/threatRadar.ts; the two
 * modules are deliberately parallel and each carries its own copy.
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

/**
 * The most recent `reviewed` date across a region's seasons — the calendar's
 * "as at" date, shown as "Reviewed <date>".
 *
 * Derived rather than hand-maintained, exactly like the radar's lastUpdated(): a
 * separate constant would drift the moment someone added a season without
 * touching it, and a stale date on a page about what's current is worse than no
 * date. Returns null for a region with no calendar, where there is nothing to
 * date. String comparison is valid because isWellFormedDate is asserted in CI.
 */
export function lastReviewed(code: RegionCode): string | null {
  const seasons = calendarForRegion(code);
  if (seasons.length === 0) return null;
  return seasons.reduce(
    (latest, s) => (s.reviewed > latest ? s.reviewed : latest),
    seasons[0].reviewed,
  );
}

// Day-of-year style ordinal that ignores leap years. Comparing (month, day)
// pairs as a single number is enough for windowing and avoids Date arithmetic
// entirely, which keeps this pure and timezone-free.
function ordinal(month: number, day: number): number {
  return month * 100 + day;
}

/**
 * Whether a season is active on a given date.
 *
 * Handles year-wrapping windows (Nov 20 → Jan 15): when the start ordinal is
 * greater than the end ordinal, the window is the *union* of "after the start"
 * and "before the end" rather than the empty intersection a naive range check
 * would produce.
 */
export function isActiveOn(season: ScamSeason, date: DateLike): boolean {
  const { month, day } = asCivilDate(date);
  const now = ordinal(month, day);
  const start = ordinal(season.window.startMonth, season.window.startDay);
  const end = ordinal(season.window.endMonth, season.window.endDay);

  return start <= end
    ? now >= start && now <= end
    : now >= start || now <= end;
}

/** Seasons active on `date`, in authored order. */
export function activeSeasons(code: RegionCode, date: DateLike): ScamSeason[] {
  return calendarForRegion(code).filter((s) => isActiveOn(s, date));
}

// Distance in days from `now` to the next occurrence of a window's start,
// ignoring leap years. Used only for ordering and for the "starts in N weeks"
// hint, so month-length approximation is acceptable and kept deliberately
// simple rather than pulling in date arithmetic.
const DAYS_BEFORE_MONTH = [0, 0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Non-leap length of each month, 1-indexed to match DAYS_BEFORE_MONTH. February
// is 28 for the same reason the table ignores leap years: these windows are
// month-scale and a single day of drift never changes which season is active.
const DAYS_IN_MONTH = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Both fields are clamped rather than trusted. An out-of-range month indexes
// past the table and yields undefined → NaN, which poisons the sort order and
// renders as "Starts in about NaN months"; an out-of-range day (a 45th, or a
// 31st in a 30-day month) silently produces an ordinal that overlaps the next
// month, mis-sorting the season and counting down to a date that never arrives.
// A 0-based month is an easy slip given the getMonth() + 1 calls nearby, and the
// day is the undefended half of the same pair — so both fail safely here.
// isWellFormedWindow() below is what actually catches the mistake at test time;
// this clamp only guarantees the rendered output stays sane if one slips past.
function dayOfYear(month: number, day: number): number {
  const m = Math.min(Math.max(Math.trunc(month), 1), 12);
  const d = Math.min(Math.max(Math.trunc(day), 1), DAYS_IN_MONTH[m]);
  return DAYS_BEFORE_MONTH[m] + d;
}

/**
 * Whether a window's month/day pairs are real calendar dates.
 *
 * Exported for tests rather than called at render: a malformed window is an
 * authoring bug to be caught in CI, not a runtime condition to branch on. The
 * clamp in dayOfYear keeps the page sane if one ever ships anyway.
 */
export function isWellFormedWindow(window: SeasonWindow): boolean {
  const validPair = (month: number, day: number) =>
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= DAYS_IN_MONTH[month];

  return (
    validPair(window.startMonth, window.startDay) &&
    validPair(window.endMonth, window.endDay)
  );
}

export function daysUntilStart(season: ScamSeason, date: DateLike): number {
  const { month, day } = asCivilDate(date);
  const today = dayOfYear(month, day);
  const start = dayOfYear(season.window.startMonth, season.window.startDay);
  const diff = start - today;
  return diff >= 0 ? diff : diff + 365;
}

/**
 * Days remaining in a season's window, counting the end day itself.
 *
 * Only meaningful while the season is active — the wrap-around that makes
 * daysUntilStart total over the year would here turn "ended three weeks ago"
 * into "340 days left", which reads as a season that has barely begun. Callers
 * check isActiveOn first; this returns 0 rather than a wrapped figure so a
 * missed check degrades to a quiet "last day" instead of a confident lie.
 */
export function daysUntilEnd(season: ScamSeason, date: DateLike): number {
  if (!isActiveOn(season, date)) return 0;

  const { month, day } = asCivilDate(date);
  const today = dayOfYear(month, day);
  const end = dayOfYear(season.window.endMonth, season.window.endDay);

  // Inclusive of the end day: on 30 October a window closing 31 October has one
  // day left, not zero. A wrapping window (Nov 20 → Jan 15) puts the end behind
  // today for the whole November–December leg, so the year's length is added
  // back exactly as in daysUntilStart.
  const diff = end - today;
  return diff >= 0 ? diff : diff + 365;
}


/**
 * Seasons that aren't active yet, ordered by how soon they start.
 *
 * `limit` defaults to 3 — the calendar's "coming up" strip is a glance, not an
 * index; the full year is listed separately below it.
 */
export function upcomingSeasons(code: RegionCode, date: DateLike, limit = 3): ScamSeason[] {
  // Decorate-sort-undecorate: the distance is computed once per season rather
  // than on every comparison, so the comparator is a plain numeric compare over
  // fixed values and cannot go non-transitive if daysUntilStart ever changes.
  return calendarForRegion(code)
    .filter((s) => !isActiveOn(s, date))
    .map((season) => ({ season, days: daysUntilStart(season, date) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, limit)
    .map(({ season }) => season);
}

/** A season's window projected onto the year, as fractions in [0, 1]. */
export interface SeasonBand {
  season: ScamSeason;
  /** Fraction of the year at which the window opens. */
  start: number;
  /** Fraction of the year the window covers. Never crosses the year end. */
  length: number;
  /**
   * Row this band occupies so it doesn't overlap another, 0 upwards.
   *
   * Overlapping seasons drawn at one offset hide each other — June holds both
   * EOFY and the start of winter energy, and late November holds Black Friday
   * and the Christmas parcel run. Since a crowded month is precisely what the
   * ribbon exists to show, occlusion there would hide the signal rather than a
   * detail. Lanes are what let both be seen at once.
   */
  lane: number;
}

/** Where today sits in the year, as a fraction in [0, 1). */
export function yearFraction(date: DateLike): number {
  const { month, day } = asCivilDate(date);
  return (dayOfYear(month, day) - 1) / 365;
}

/**
 * Season windows as bands on a single left-to-right year axis.
 *
 * A wrapping window (Nov 20 → Jan 15) has no single span on an axis that starts
 * in January, so it emits *two* bands — the December leg and the January leg —
 * rather than one band drawn backwards or silently clipped. Both carry the same
 * season, so a caller keying on season.id must expect duplicates; the ribbon
 * draws them as two segments of one campaign, which is what they are.
 *
 * Bands are then packed into lanes so none overlaps another horizontally. The
 * two legs of a wrapping season are packed independently: they sit at opposite
 * ends of the axis and forcing them onto one lane would push an unrelated
 * season down for no visual gain.
 *
 * `start` is 0-based and `end` 1-based on purpose — the difference is then an
 * inclusive day count, so a one-day window has a non-zero length instead of
 * collapsing to nothing. Both fields come from dayOfYear, which clamps, so the
 * arithmetic stays in range for any window an author can write.
 */
export function seasonBands(code: RegionCode): SeasonBand[] {
  return packSeasonBands(calendarForRegion(code));
}

/**
 * seasonBands over an explicit season list rather than a region.
 *
 * Exported so the packing can be tested against windows no region authors —
 * total overlap, single days, wraps meeting non-wraps — without inventing a
 * fake region pack to hold them.
 */
export function packSeasonBands(seasons: readonly ScamSeason[]): SeasonBand[] {
  const spans: Omit<SeasonBand, "lane">[] = [];

  for (const season of seasons) {
    const { startMonth, startDay, endMonth, endDay } = season.window;
    const start = dayOfYear(startMonth, startDay) - 1;
    const end = dayOfYear(endMonth, endDay);

    if (start < end) {
      spans.push({ season, start: start / 365, length: (end - start) / 365 });
      continue;
    }

    // Wraps: the tail of the year, then the head of the next.
    spans.push({ season, start: start / 365, length: (365 - start) / 365 });
    spans.push({ season, start: 0, length: end / 365 });
  }

  // Greedy interval packing: earliest-starting span first, into the lowest lane
  // whose last band already ends. Optimal for interval graphs, and with a
  // handful of seasons the cost is irrelevant next to the clarity.
  const laneEnds: number[] = [];

  return spans
    .sort((a, b) => a.start - b.start)
    .map((span) => {
      let lane = laneEnds.findIndex((end) => end <= span.start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = span.start + span.length;
      return { ...span, lane };
    });
}

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Human-readable window, e.g. "1 July – 31 October". */
export function formatWindow(window: SeasonWindow): string {
  const start = `${window.startDay} ${MONTH_NAMES[window.startMonth]}`;
  const end = `${window.endDay} ${MONTH_NAMES[window.endMonth]}`;
  return `${start} – ${end}`;
}

/**
 * Human-readable review date, e.g. "10 August 2026".
 *
 * Parses the parts directly rather than going through Date so the rendered
 * string can't shift a day in a timezone behind UTC — the same class of bug
 * CivilDate exists to prevent. Returns the input unchanged if it isn't a
 * well-formed date, so a bad value shows as itself rather than "NaN undefined".
 */
export function formatReviewedDate(iso: string): string {
  if (!isWellFormedDate(iso)) return iso;
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_NAMES[month]} ${year}`;
}

/** Where a gantt bar's label can be drawn without clipping or colliding. */
export type LabelPlacement = "inside" | "left" | "right" | "hidden";

/**
 * A label's width as a fraction of the chart, estimated from its character
 * count.
 *
 * Estimated rather than measured: measuring means a layout pass per bar on
 * every resize, for labels that are a convenience on a graphic whose accessible
 * content is the list below it. The constants are a conservative average
 * advance for Inter at the bar's text size plus the bar's horizontal padding,
 * so the estimate errs towards moving a label out of a bar it would just barely
 * have fitted rather than leaving one that clips.
 *
 * Returns Infinity when the chart hasn't been measured yet (width 0), which
 * makes every label "not fitting" and leaves the chart unlabelled until the
 * real width is known — a quiet fill-in rather than a flash of labels that then
 * rearrange.
 */
export function labelSpan(title: string, chartWidth: number): number {
  if (chartWidth <= 0) return Infinity;
  const LABEL_SIZE = 11;
  const CHAR_EM = 0.54;
  const PADDING = 16;
  return (title.length * CHAR_EM * LABEL_SIZE + PADDING) / chartWidth;
}

/**
 * Where to put a bar's label: inside it, in a free gutter beside it, or nowhere.
 *
 * A label wider than its bar has to go somewhere, and the two bad answers are
 * clipping it inside the bar ("Black Frida", which reads as a rendering fault
 * and still doesn't name the season) or letting it run over the neighbouring
 * bar in the same lane. So this checks the gutters for an actual gap: the space
 * to the next bar on that lane, or to the chart edge if there is none.
 *
 * Preference order is inside, right, left, hidden. Right before left because a
 * label trailing its bar reads as belonging to it; a leading label has to be
 * read backwards. Hidden is a real outcome, not a failure — a bar wedged
 * between two others has no honest place for a label, and the season is named
 * in the list below regardless.
 */
export function labelPlacement(
  band: SeasonBand,
  bands: readonly SeasonBand[],
  span: number,
): LabelPlacement {
  if (span <= band.length) return "inside";

  const end = band.start + band.length;
  // Only bars sharing this lane can collide — that is what lanes are for.
  const lane = bands.filter((b) => b.lane === band.lane && b !== band);

  const nextStart = lane
    .filter((b) => b.start >= end)
    .reduce((closest, b) => Math.min(closest, b.start), 1);
  if (nextStart - end >= span) return "right";

  const prevEnd = lane
    .filter((b) => b.start + b.length <= band.start)
    .reduce((closest, b) => Math.max(closest, b.start + b.length), 0);
  if (band.start - prevEnd >= span) return "left";

  return "hidden";
}
