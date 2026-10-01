import type { Metadata } from "next";
import PackagesDocs from "@/components/PackagesDocs";
import { NPM_PACKAGE, MCP_PACKAGE } from "@/lib/npmPackage";

export const metadata: Metadata = {
  title: "Packages — Veriguard",
  description:
    `Run Veriguard's scam detection yourself. ${NPM_PACKAGE} scores messages inside your own ` +
    `product; ${MCP_PACKAGE} gives your AI assistant the same checks as tools. Rule-based, ` +
    "local, no API key. Install, quickstart, the tools, and the coverage caveat.",
};

export default function PackagesPage() {
  return (
    // Narrower than the site's 1180px container. This page is a single column
    // of prose and code, and every block inside it is capped at a reading
    // measure anyway — the wide container left the right half of a desktop
    // window empty and made the column look misaligned rather than centred.
    <main className="max-w-[860px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <PackagesDocs />
    </main>
  );
}
