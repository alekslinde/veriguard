import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { EXTENSION_LISTINGS, reportedAsOf, totalReportedUsers } from "@/lib/extensionInstalls";

export const metadata: Metadata = {
  title: "About & Privacy — Veriguard",
  description:
    "What Veriguard stores, what it never stores (your IP, your uploads), what a mail provider records if you forward an email, how the checker works, which countries it covers, and the browser extension's privacy policy. Step-by-step guides for blocking and reporting spam live on the Learn page.",
};

// This page is the canonical record of the project's privacy behaviour, so it
// is deliberately kept in plain English in both language modes — slang
// variants could blur the meaning of a promise. That is also why it carries no
// message keys: there is one wording, and it is this one.

const H2 =
  "font-[family-name:var(--font-display)] font-semibold text-[clamp(18px,2.2vw,22px)] leading-tight tracking-[-0.015em] text-[var(--foreground)]";
const P = "text-[14.5px] text-[var(--text-dim)] leading-relaxed";
// Emphasis inside a paragraph. The promises on this page are the reason anyone
// reads it, so the load-bearing clause of each one is lifted out of the body
// colour rather than being left to bold alone.
const STRONG = "font-semibold text-[var(--foreground)]";
const LINK = "text-[var(--clear)] underline underline-offset-2 hover:no-underline";
// Every section is a prose block at a reading measure. The old page wrapped all
// seven in one 820px card, which made the whole page one object and gave the
// headings nothing to sit against.
const SECTION = "space-y-3 max-w-[68ch]";

/**
 * One privacy fact, as a card.
 *
 * The four of these are the page's central claim, and they are a grid rather
 * than prose because the shape *is* the argument: four things, three of which
 * we never hold at all. Buried in a paragraph — which is where this lived — the
 * same facts read as reassurance; laid out as a set they read as a list a
 * reader can check us against.
 */
function DataCard({
  kicker,
  title,
  children,
}: {
  /** What happens to it. Deliberately the first thing read, not the subject. */
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--ink-2)] px-5 py-4 space-y-1.5">
      <p className="font-[family-name:var(--font-mono-ui)] text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--clear)]">
        {kicker}
      </p>
      <h3 className="font-semibold text-[15px] text-[var(--foreground)]">{title}</h3>
      <p className="text-[13.5px] text-[var(--text-dim)] leading-relaxed">{children}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <PageHeader
        eyebrow="About & privacy"
        title="What we store, and what we **never** store"
        lede="Every verdict here comes from hardcoded pattern logic — no AI anywhere in the scoring, and nothing about your message leaves your device to be judged."
      />

      <div className="space-y-10">
        {/* The grid leads because it is the answer to the question the page
            title asks. The prose below explains and qualifies it; a reader who
            stops after the grid has still had the honest version.

            Capped to the same measure as that prose: left at the full 1180px
            the page opened wide and then stepped abruptly in, which reads as
            two different layouts rather than one page. */}
        <section className="space-y-3 max-w-[68ch]">
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2">
            <DataCard kicker="Never stored" title="The message you paste">
              Analysed in memory and discarded. It isn&apos;t written to a database, sent to a
              third party, or used to train anything — screenshots and .eml files included, and
              QR decoding happens entirely on your device.
            </DataCard>
            <DataCard kicker="Never opened" title="The links inside it">
              We read the URL as text. We don&apos;t visit it, so the sender never learns you
              checked and no tracking pixel fires. Our security policy blocks the browser from
              contacting any outside server at all.
            </DataCard>
            <DataCard kicker="Stored, scrubbed" title="Reports you choose to submit">
              Only if you submit the report form — and personal details are stripped before
              anything is written down, not merely hidden when it&apos;s shown. What&apos;s kept
              is the scam: the link, the sender, the wording.
            </DataCard>
            <DataCard kicker="Counted only" title="How many checks ran">
              A running total with no content attached. That&apos;s what the numbers on the
              reports page come from.
            </DataCard>
          </div>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>What this is</h2>
          <p className={P}>
            Veriguard is a free scam checker built for Australians, with local coverage
            for the UK, US, New Zealand and Ireland as well. Paste a suspicious link, text, email
            or phone number and get an instant best-effort verdict — no account, no tracking, no
            data sold. It&apos;s an independent project by{" "}
            <a
              href="https://alekslinde.com"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Aleks Linde<span className="sr-only"> (opens in a new tab)</span>
              <span aria-hidden="true"> ↗</span>
            </a>
            , not a government service.
          </p>
          <p className={P}>
            It gives a best-effort check only — <strong className={STRONG}>it can&apos;t
            guarantee it catches every scam</strong>. For official reporting, use Scamwatch
            (scamwatch.gov.au) and ReportCyber (cyber.gov.au/report).
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>Where we work</h2>
          <p className={P}>
            Anyone, anywhere can paste a message here. The universal checks — links, shorteners,
            redirects, tracking, and requests for personal details — run the same way everywhere,
            because those tricks don&apos;t respect borders.
          </p>
          <p className={P}>
            What varies is local knowledge: the brands scammers impersonate, the tax deadlines
            they exploit, the phone-number formats that signal a fake. We cover Australia, the UK,
            the US, New Zealand and Ireland in full, Canada in part, and fall back to
            country-neutral checks everywhere else.
          </p>
          <p className={P}>
            To pick the right set we use{" "}
            <strong className={STRONG}>a two-letter country code, and nothing finer</strong> —
            derived from your connection by the network, never read from your IP address by us,
            and not stored when you run a check. If it guesses wrong, because you&apos;re
            travelling or on a VPN, you can change the region yourself and check again.
          </p>
          {/* The strongest sentence on the page gets the strongest treatment.
              A reader who takes "nothing found" as "safe" outside our coverage
              has been misled by us, so this is set apart rather than left to
              land in the middle of a paragraph. */}
          <p className="text-[14.5px] leading-relaxed text-[var(--text-dim)] border-l-2 border-l-[var(--caution)] pl-4 py-0.5">
            Outside the countries we cover properly, &ldquo;nothing found&rdquo; can just mean
            &ldquo;we have no local rules to find it with&rdquo;. You&apos;ll see a note saying
            so — <strong className={STRONG}>treat a quiet result as &ldquo;not checked&rdquo;,
            not &ldquo;safe&rdquo;.</strong>
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>Threat radar &amp; scam calendar</h2>
          <p className={P}>
            The <Link href="/radar" className={LINK}>threat radar</Link> lists campaigns doing
            the rounds in the last few weeks, and the{" "}
            <Link href="/calendar" className={LINK}>scam calendar</Link> shows when scams spike
            through the year — tax time, Black Friday, the Christmas parcel rush. Both are
            hand-written from published threat intelligence and{" "}
            <strong className={STRONG}>read nothing about you</strong>; they&apos;re the same
            pages for everyone in your country.
          </p>
          <p className={P}>
            Both are there to teach, and{" "}
            <strong className={STRONG}>neither changes a verdict</strong>. The date is never part
            of the score: a tax scam in March is still a scam, and a genuine ATO email in July is
            still genuine. The radar also says plainly which campaigns we catch and which we
            don&apos;t yet.
          </p>
        </section>

        {/*
          The forwarding path, disclosed separately.

          Everywhere else on this page, "analysed in memory and discarded" is
          the whole story, because the message reaches us over the web and
          nothing else touches it. Email is the one surface where that is not
          the whole story: getting a message to us at all means handing it to a
          mail provider first, and mail providers keep delivery records. That
          record is not ours to decline — it is how the mail is routed — and a
          page whose title promises what we store owes the reader the part we
          do not control as plainly as the part we do.

          Naming the provider is deliberate. The domain's public MX records
          already name it, so this discloses nothing a lookup would not, and a
          reader cannot judge a disclosure about a third party that is kept
          anonymous.
        */}
        <section className={SECTION} id="email">
          <h2 className={H2}>Email is the one exception</h2>
          <p className={P}>
            You can forward a suspicious email to our check address instead of pasting it. What
            happens to the message is the same:{" "}
            <strong className={STRONG}>read in memory, never stored</strong>, never used to train
            anything. The reply comes back to you and that&apos;s the end of it.
          </p>
          <p className={P}>
            The difference is everything around it. Email has to be delivered before we can read
            it, and ours is delivered by Cloudflare Email Routing — which, like every mail
            service, keeps a record of each message it handles for about a month:{" "}
            <strong className={STRONG}>your address, the subject line, the time, whether the
            message passed its authentication checks, and whether our reply went out</strong>. Not
            the body. Not the scam you forwarded.
          </p>
          <p className={P}>
            <strong className={STRONG}>We can&apos;t switch that off.</strong> It&apos;s part of
            how mail gets delivered, not a setting we chose, and no paid plan removes it — your
            own email provider is keeping a similar record at the other end. We&apos;d rather tell
            you that than let &ldquo;never stored&rdquo; quietly cover something it doesn&apos;t.
          </p>
          <p className={P}>
            So if you&apos;d rather leave no record of having asked,{" "}
            <strong className={STRONG}>paste the message here instead</strong> — nothing about a
            paste touches a mail server. Forwarding exists because it beats retyping a whole email
            on a phone. That&apos;s a fair trade, but it should be yours to make.
          </p>
          {/* Same treatment as the coverage warning above, because it is the
              same failure: a quiet result read as a clean one. A reply that
              never arrives is the most dangerous thing this service can do, so
              it is set apart rather than left to close a paragraph. */}
          <p className="text-[14.5px] leading-relaxed text-[var(--text-dim)] border-l-2 border-l-[var(--caution)] pl-4 py-0.5">
            Replies aren&apos;t guaranteed, either. Whether we&apos;re allowed to answer depends
            on how your email provider vouches for the forward, and for some accounts we simply
            can&apos;t. <strong className={STRONG}>If nothing comes back within a few minutes,
            don&apos;t read the silence as &ldquo;probably fine&rdquo;</strong> — check the message
            here instead.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>When you report a scam</h2>
          <p className={P}>A report stores exactly these things, and nothing else:</p>
          {/* A hairline list rather than bullet glyphs: these are three
              distinct commitments, and the rule between them makes the count
              legible at a glance. */}
          <ul className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--rule)] list-none">
            <li className="bg-[var(--ink-2)] px-4 py-3.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
              The scam content and identifiers you submit — with tracking parameters stripped,
              your own email headers removed, and personal details (emails, phone numbers, tax
              file numbers and the like) automatically scrubbed before storage. Everything shown
              publicly is also &ldquo;defanged&rdquo; so it can&apos;t be clicked or dialled by
              accident.
            </li>
            <li className="bg-[var(--ink-2)] px-4 py-3.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
              <strong className={STRONG}>A coarse location, never your IP address.</strong> At
              submission time we derive a region from the connection — state level for Australia
              (e.g. &ldquo;NSW, Australia&rdquo;), country level elsewhere — and store only that
              string. It&apos;s shown on the public report so people can see where a scam is
              circulating. Your IP is used in memory for rate limiting while the request is
              processed and is never stored by the application; city-level detail is deliberately
              not used.
            </li>
            <li className="bg-[var(--ink-2)] px-4 py-3.5 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
              <strong className={STRONG}>Your email, only if you choose to give it.</strong>{" "}
              It&apos;s used solely to follow up on your report. It is never published, never
              shared with anyone, and never used for anything else.
            </li>
          </ul>
          <p className="text-[13.5px] text-[var(--faint)] leading-relaxed">
            Public reports are community-submitted and unverified. Want one removed or have a
            question about your data? Use the &ldquo;Report a bug&rdquo; button (bottom-right)
            with your report reference and your email — we&apos;ll sort it out.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>Why the rules are public</h2>
          <p className={P}>
            Detection logic is intentionally open source. Transparency lets the community improve
            it, and obscuring keyword lists wouldn&apos;t stop sophisticated scammers — it would
            only stop you from checking our work.
          </p>
        </section>

        {/*
          The browser extension's privacy policy.

          All three stores require a policy at a stable URL, and this is it —
          `/about#extension`. It lives here rather than on a page of its own
          because this page is already the canonical record of the project's
          privacy behaviour, and a second policy is a second thing to keep true.

          Every claim below is a property of the shipped artifact rather than a
          promise about intent, and each one is enforced by a test over the
          built bundle. Keep it that way: a sentence here that nothing checks is
          a sentence that will eventually be wrong.
        */}
        <section className={SECTION} id="extension">
          <h2 className={H2}>The browser extension</h2>
          <p className={P}>
            The extension carries the whole detection engine inside it, so{" "}
            <strong className={STRONG}>
              what you check never leaves your device
            </strong>
            . There is no server call to score a message — not to us, not to anyone. Paste
            something with the browser offline and it still works.
          </p>
          <p className={P}>
            It makes <strong className={STRONG}>one</strong> network request, and it is not about
            you: it downloads a list of known malicious websites, on a timer, so it can recognise
            them offline. That request carries no query and no body — every copy of the extension
            asks for the same list in the same way, and the server learns only that someone asked.
            There is deliberately no &ldquo;is this site dangerous?&rdquo; lookup, because that
            would tell us exactly which sites you are checking.
          </p>
          <p className={P}>
            It asks for <strong className={STRONG}>no access to the pages you visit</strong>. No
            host permissions, no content scripts, nothing reading a tab. The only text it ever
            sees is text you typed into it, or selected and sent to it with a right-click.
          </p>
          <p className={P}>
            Reporting a scam <strong className={STRONG}>opens this website</strong> with the scam
            link or number filled in — the extension never submits anything itself. You see the
            form, edit it, and send it yourself. The message you pasted is not carried across;
            that field is left for you to describe in your own words, because it is the one most
            likely to contain your own details.
          </p>
          <p className={P}>
            What it keeps on your device: the region you picked, and the downloaded site list. No
            history of what you checked is stored anywhere, by us or by it — there is nothing to
            request a copy of, because nothing is kept.
          </p>
          {/* The reach figures, and — more importantly — the number that is
              absent. On-device scoring means there is no check event to count,
              so "how many scams did it catch" is a question this project cannot
              answer about its own product. Saying that plainly is a stronger
              privacy claim than any usage number would be, which is why the
              absence is stated here rather than quietly left out. */}
          <p className={P}>
            <strong className={STRONG}>How many people use it</strong>, as the stores report it:
          </p>
          <ul className="space-y-1.5">
            {EXTENSION_LISTINGS.map((listing) => (
              <li key={listing.store} className={`${P} flex flex-wrap items-baseline gap-x-2`}>
                <span className={STRONG}>
                  {listing.url ? (
                    <a href={listing.url} className={LINK} target="_blank" rel="noopener noreferrer">
                      {listing.name}
                    </a>
                  ) : (
                    listing.name
                  )}
                </span>
                {/* A count is only shown WITH its date, because a count
                    without one is a claim about today whenever it is read. The
                    fallback is the note, and where a listing somehow has
                    neither, it says so rather than rendering an empty space —
                    a blank cell beside a store name invites the reader to
                    supply the missing reason, and the nearest one to hand is
                    "nobody uses it". */}
                {typeof listing.users === "number" && listing.asOf ? (
                  <span>
                    {listing.users.toLocaleString("en-AU")} users, as the store reported it on{" "}
                    {listing.asOf}
                  </span>
                ) : (
                  <span>{listing.note ?? "No figure recorded yet."}</span>
                )}
              </li>
            ))}
          </ul>
          {/* The total is rendered from the helper rather than summed here, so
              the null-vs-zero rule lives in one place: with no store reporting
              a figure this is null and the sentence is skipped entirely,
              because "0 users" and "no figure yet" are different claims and
              only one of them is true. The date is the OLDEST of those read,
              since a total is only as current as its stalest part. */}
          {totalReportedUsers() !== null && (
            <p className={P}>
              That is{" "}
              <strong className={STRONG}>
                {totalReportedUsers()?.toLocaleString("en-AU")} reported users
              </strong>{" "}
              across the stores that publish a figure, as of {reportedAsOf()}. Someone running it
              in two browsers counts twice, and each store estimates over a window it defines —
              it is the sum of what the dashboards say, not a headcount.
            </p>
          )}
          <p className={P}>
            Those come from the store dashboards, which anyone can open and check against what we
            say here — each one is dated with the day it was read, because a count without a date
            quietly becomes a claim about today.
          </p>
          <p className={P}>
            There is <strong className={STRONG}>no figure for how many checks it has run</strong>,
            and there never will be. Scoring happens on your device, so no check is reported to us
            — there is no event to count, and creating one would mean the extension phoning home
            about the thing it promises never to send. We would rather publish a missing number
            with the reason attached than collect the data to fill it in.
          </p>
          <p className={P}>
            None of this is a promise you have to take on trust. The extension ships unminified
            so it can be read, and the{" "}
            <a
              href="https://github.com/alekslinde/veriguard/blob/main/__tests__/extensionBundle.test.ts"
              className={LINK}
            >
              tests that enforce these claims
            </a>{" "}
            run against the built file — they fail if a second network call, a request body, or a
            way to inject markup ever appears in it.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>Bug reports &amp; tracking</h2>
          <p className={P}>
            A wrong verdict is a bug worth knowing about, in either direction. If something breaks
            we may offer to send diagnostics, but{" "}
            <strong className={STRONG}>nothing is ever sent without your explicit consent</strong>{" "}
            — you see the exact details (page, browser, error message) before deciding. The scam
            content you pasted and any files you uploaded are never included.
          </p>
          <p className={P}>
            No analytics scripts, no advertising pixels, no cookies for tracking. Your language
            preference and view settings live in your own browser&apos;s storage and never leave
            it. The site&apos;s security policy prevents pages from talking to any third-party
            server at all.
          </p>
        </section>

        <section className={SECTION}>
          <h2 className={H2}>Blocking &amp; reporting spam</h2>
          <p className={P}>
            Step-by-step guides for blocking and reporting spam — in Gmail, Outlook, Apple Mail
            and Yahoo, and on iPhone, Android and messaging apps — live on the{" "}
            <Link href="/learn#block-email" className={LINK}>Learn page</Link>.
          </p>
        </section>

        <div className="border-t border-[var(--rule)] pt-5">
          <Link href="/" className="text-sm text-[var(--clear)] hover:underline underline-offset-2 font-medium">
            Check or report a scam →
          </Link>
        </div>
      </div>
    </main>
  );
}
