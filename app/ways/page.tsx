import type { Metadata } from "next";
import WaysContent from "@/components/WaysContent";

export const metadata: Metadata = {
  title: "Ways in — Veriguard",
  description:
    "Four ways to check a suspicious link, message, email or phone number: paste it on the site, forward an email, install the browser extension, or run the detection engine yourself as an npm package.",
};

// Static. The cards are copy and links; the only thing resolved at render time
// is which extension stores are live, and that is a constant in the bundle
// rather than a request-time lookup.
export default function WaysPage() {
  return (
    <main className="max-w-[1180px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
      <WaysContent />
    </main>
  );
}
