"use client";

// Developer documentation for the published engine.
//
// A quickstart, not a reference. Install, one working call, what comes back,
// and the two things a consumer must not get wrong — the coverage caveat and
// the no-network property. Everything exhaustive (every entry point, every
// subpath, the type definitions) lives in the package README, linked at the
// bottom, so there is one canonical list rather than two that drift.
//
// The samples below are real: __tests__/npmDocs.test.ts runs the quickstart
// against the engine and fails if the verdict it claims stops being true.

import { useLang } from "@/lib/lang";
import PageHeader from "@/components/PageHeader";
import CodeBlock from "@/components/CodeBlock";
import {
  NPM_PACKAGE,
  NPM_URL,
  ENGINE_README_URL,
  ENGINE_SOURCE_URL,
} from "@/lib/npmPackage";

export const INSTALL = `npm install ${NPM_PACKAGE}`;

export const QUICKSTART = `import { checkUrl } from "${NPM_PACKAGE}";

// Synchronous: no I/O, so there is nothing to await.
const result = checkUrl("https://commbank-secure-login.tk/verify");

result.verdict; // "likely_scam"
result.score;   // 85
result.flags;   // why, in sentences you can show someone`;

export const ANALYZE = `import { analyzeContent } from "${NPM_PACKAGE}";

// One result per link, number or address found in the text.
const results = await analyzeContent(
  "Your parcel is held. Pay the fee at auspost-redelivery.bond",
);

for (const { kind, value, result } of results) {
  console.log(kind, value, result.verdict, result.score);
}`;

export const REGIONS = `import { checkSms } from "${NPM_PACKAGE}";

// Region is the third argument. The second is an optional blocklist —
// pass undefined to score without one.
checkSms("Your parcel is held", undefined, "gb");`;

const FIELDS: { name: string; key: Parameters<ReturnType<typeof useLang>["t"]>[0] }[] = [
  { name: "verdict", key: "npm.result.verdict" },
  { name: "score", key: "npm.result.score" },
  { name: "flags", key: "npm.result.flags" },
  { name: "signals", key: "npm.result.signals" },
  { name: "coverage", key: "npm.result.coverage" },
];

const H2 = "text-[17px] font-semibold text-[var(--foreground)]";
const BODY = "mt-2 text-[14px] text-[var(--text-dim)] leading-relaxed max-w-[68ch]";
const SECTION = "mt-8";

export default function NpmDocs() {
  const { t } = useLang();

  return (
    <>
      <PageHeader eyebrow={t("npm.eyebrow")} title={t("npm.headline")} lede={t("npm.lede")} />

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.install.heading")}</h2>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={INSTALL} label="install command" />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.quickstart.heading")}</h2>
        <p className={BODY}>{t("npm.quickstart.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={QUICKSTART} label="quickstart example" />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.analyze.heading")}</h2>
        <p className={BODY}>{t("npm.analyze.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={ANALYZE} label="analyzeContent example" />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.result.heading")}</h2>
        <p className={BODY}>{t("npm.result.body")}</p>
        <dl className="mt-3 max-w-[68ch] rounded-2xl border border-[var(--rule)] divide-y divide-[var(--rule)]">
          {FIELDS.map((f) => (
            <div key={f.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-4">
              <dt className="shrink-0 sm:w-28 font-[family-name:var(--font-mono-ui)] text-[13px] text-[var(--clear)]">
                {f.name}
              </dt>
              <dd className="text-[13.5px] text-[var(--text-dim)] leading-relaxed">{t(f.key)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Tinted, and placed before the privacy section rather than after the
          links, because it is the one thing on this page that changes whether
          an integration is safe. A caution styled like body copy is a caution
          that gets skimmed. */}
      <section className={`${SECTION} max-w-[68ch] rounded-2xl border border-[var(--caution)]/35 bg-[var(--caution)]/10 p-5`}>
        <h2 className={H2}>{t("npm.coverage.heading")}</h2>
        <p className={BODY}>{t("npm.coverage.body")}</p>
        <p className="mt-2 text-[13.5px] font-semibold text-[var(--foreground)]">
          {t("npm.coverage.advice")}
        </p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.privacy.heading")}</h2>
        <p className={BODY}>{t("npm.privacy.body")}</p>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.regions.heading")}</h2>
        <p className={BODY}>{t("npm.regions.body")}</p>
        <div className="mt-3 max-w-[68ch]">
          <CodeBlock code={REGIONS} label="region example" />
        </div>
      </section>

      <section className={SECTION}>
        <h2 className={H2}>{t("npm.more.heading")}</h2>
        <p className={BODY}>{t("npm.more.body")}</p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[14px] font-semibold text-[var(--clear)]">
          {[
            { href: ENGINE_README_URL, label: t("npm.more.readme") },
            { href: NPM_URL, label: t("npm.more.npm") },
            { href: ENGINE_SOURCE_URL, label: t("npm.more.source") },
          ].map((link) => (
            <li key={link.href}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
                <span aria-hidden="true"> →</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
