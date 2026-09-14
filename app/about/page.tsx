import type { Metadata } from "next";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "About & Privacy — Veriguard",
  description:
    "What Veriguard stores, what it never stores (your IP, your uploads), how the checker works, and which countries it covers. Step-by-step guides for blocking and reporting spam live on the Learn page.",
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
        lede="Detection here is hardcoded pattern logic — no models in the scoring path, nothing sent off-device for scoring."
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
              Only if you submit the report form — and personal details are removed before
              storage, not before display. What&apos;s kept is the scam: the link, the sender,
              the wording.
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
