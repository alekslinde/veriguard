import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import { LangProvider } from "@/lib/lang";
import { BugReportProvider } from "@/components/BugReportProvider";
import SiteHeader from "@/components/SiteHeader";
import ServiceNotice from "@/components/ServiceNotice";
import SiteFooter from "@/components/SiteFooter";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";

// Display face, used sparingly: page headings and verdict titles only. The
// optical-size axis is what makes it hold at both 24px and 60px.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

// Mono carries dates, scores and identifiers — anything the reader may need to
// compare or copy exactly. 600 is loaded because the small uppercase labels
// (the card's "Checked on your device", the drop overlay) are set in it; without
// the real weight the browser synthesises a bold, which thickens the strokes
// unevenly and is most obvious at exactly the 11px these labels use.
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const TITLE = "Veriguard — Check Before You Act";
// One constant, three indexed outputs: description, openGraph.description and
// twitter.description. The category term ("scam checker") leads so the search
// intent the old "Aussie Scam Detector" title carried survives the rename,
// while the title itself carries the positioning. The limit is stated rather
// than the ambition: no verdict is certain, and saying so is what makes the
// rest credible.
const DESCRIPTION =
  "Free, open-source scam checker for links, texts, emails and phone numbers. Checking takes seconds; getting it wrong can cost you everything. Nothing you paste is stored.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Veriguard",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "Veriguard",
    locale: "en",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Single theme, so a single colour — and it must be the real page ground.
  themeColor: "#141C2B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LangProvider>
          <BugReportProvider>
            <SiteHeader />
            {/* Under the nav rather than above it: the header is how someone
                orients and navigates away from a degraded feature, so it stays
                the first thing on the page. */}
            <ServiceNotice />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </BugReportProvider>
        </LangProvider>
      </body>
    </html>
  );
}
