import type { Metadata } from "next";
import NpmDocs from "@/components/NpmDocs";
import { NPM_PACKAGE } from "@/lib/npmPackage";

export const metadata: Metadata = {
  title: `${NPM_PACKAGE} — Veriguard`,
  description:
    "Run Veriguard's scam detection inside your own product. Rule-based, offline, no API key: one npm install and a function call. Install, quickstart, result shape and the coverage caveat.",
};

export default function NpmPage() {
  return (
    // Narrower than the site's 1180px container. This page is a single column
    // of prose and code, and every block inside it is capped at a reading
    // measure anyway — the wide container left the right half of a desktop
    // window empty and made the column look misaligned rather than centred.
    <main className="max-w-[860px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <NpmDocs />
    </main>
  );
}
