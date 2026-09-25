"use client";

import { useSearchParams } from "next/navigation";
import { parseReportPrefill } from "@/lib/reportPrefill";
import ReportForm from "./ReportForm";

// Thin client wrapper: reads the prefill out of the query string and hands it to
// the same ReportForm the in-app Check→Report handoff uses. Kept separate from
// app/report/page.tsx so the page itself stays a server component and only this
// (Suspense-wrapped) subtree opts into useSearchParams.
//
// The params come from a link in an email we sent, but they are still untrusted
// input — parseReportPrefill validates the type and length of everything before
// it reaches the form, and the reporter sees and can edit every field before
// submitting.
export default function ReportPrefillForm() {
  const prefill = parseReportPrefill(useSearchParams());
  return (
    <ReportForm
      initialType={prefill.type}
      initialScamUrl={prefill.scamUrl}
      initialScamEmail={prefill.scamEmail}
      initialScamReplyTo={prefill.scamReplyTo}
      initialScamPhone={prefill.scamPhone}
      source={prefill.source}
    />
  );
}
