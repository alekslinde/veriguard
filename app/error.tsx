"use client";

import Link from "next/link";

// Branded error boundary. Deliberately keeps no dependencies on app providers
// (i18n, bug reporting) — if rendering broke, the less this page needs, the
// more reliably it shows. Copy is therefore hardcoded English rather than read
// from the message bundle, which is the one place in the app that is true.
//
// It still uses the design tokens, because those are CSS custom properties on
// :root and cost nothing to reference: there is no provider to fail. What it
// looked like before was a leftover from an earlier palette — raw Tailwind
// greys, font-black, and an emerald headline.
//
// THE HEADLINE IS NOT GREEN, and that is the substantive fix rather than a
// restyle. `--clear` is the verdict colour for "this is safe"; the app spends
// the whole check flow teaching that association, and announcing a failure in
// it contradicts the lesson at the worst moment.
//
// It is not amber or red either. Both are verdict colours too — amber for a
// statement about our detection coverage, red for a finding about the reader's
// own message — and borrowing either for our plumbing makes a server fault look
// like something about what they pasted. ServiceNotice draws this line first
// and reaches the same place: neutral surface, and the signal carried by a
// small marker rather than the type. Here the eyebrow does that job.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      {/* Left-aligned and capped at a reading measure, like every other page
          head. The centred version read as a stand-alone splash rather than a
          page of the site, which is exactly the moment to look like the site. */}
      <header className="max-w-[60ch]">
        <p className="font-[family-name:var(--font-mono-ui)] text-[11px] tracking-[0.1em] uppercase text-[var(--faint)] mb-2.5">
          Error
        </p>
        <h1 className="font-[family-name:var(--font-display)] font-semibold text-[clamp(30px,4.6vw,44px)] leading-[1.07] tracking-[-0.022em] text-[var(--foreground)] text-balance">
          Something went wrong on our end
        </h1>
        <p className="mt-3.5 text-[clamp(15px,1.6vw,17px)] text-[var(--text-dim)] leading-relaxed">
          Not your fault. Try again — and if it keeps happening, the
          &ldquo;Report a bug&rdquo; link at the bottom of the page helps us fix
          it.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center min-h-[44px] rounded-lg bg-[var(--clear)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:brightness-110 transition-[filter]"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center min-h-[44px] rounded-lg border border-[var(--rule)] px-4 py-2.5 text-sm font-semibold text-[var(--text-dim)] hover:border-[var(--clear)] hover:text-[var(--clear)] transition-colors"
          >
            Back to the checker
          </Link>
        </div>
      </header>
    </main>
  );
}
