import { describe, it, expect } from "vitest";
import { scrubPii, stripReporterHeaders, findPii } from "@/lib/piiScrubber";

describe("scrubPii", () => {
  it("redacts email addresses", () => {
    expect(scrubPii("Contact me at alice@example.com please")).toBe(
      "Contact me at [email removed] please"
    );
  });

  it("redacts email with plus-sign alias", () => {
    expect(scrubPii("user+tag@mail.co.uk")).toBe("[email removed]");
  });

  it("redacts Australian mobile numbers (spaced)", () => {
    expect(scrubPii("My number is 0412 345 678")).toBe(
      "My number is [phone removed]"
    );
  });

  it("redacts Australian mobile numbers (dashed)", () => {
    expect(scrubPii("Call 0412-345-678")).toBe("Call [phone removed]");
  });

  it("redacts Australian mobile numbers (no spacing)", () => {
    expect(scrubPii("Ring 0412345678 thanks")).toBe("Ring [phone removed] thanks");
  });

  it("redacts Australian landline numbers", () => {
    expect(scrubPii("Office: 02 9876 5432")).toBe("Office: [phone removed]");
  });

  it("redacts international phone numbers", () => {
    expect(scrubPii("Call +44 1234 567 890")).toBe("Call [phone removed]");
  });

  it("redacts IPv4 addresses", () => {
    expect(scrubPii("Server at 192.168.1.1 is down")).toBe(
      "Server at [IP removed] is down"
    );
  });

  it("redacts Australian TFN (space-separated 3-3-3)", () => {
    expect(scrubPii("My TFN is 123 456 789")).toBe("My TFN is [TFN removed]");
  });

  it("redacts BSB (xxx-xxx)", () => {
    expect(scrubPii("BSB 062-123")).toBe("BSB [BSB removed]");
  });

  it("redacts credit card numbers (space-separated groups)", () => {
    expect(scrubPii("Card: 4532 1234 5678 9012")).toBe("Card: [card removed]");
  });

  it("redacts credit card numbers (dash-separated groups)", () => {
    expect(scrubPii("Card: 4532-1234-5678-9012")).toBe("Card: [card removed]");
  });

  it("redacts multiple PII types in a single string", () => {
    const input = "Email alice@example.com, phone 0412 345 678, IP 10.0.0.1";
    const result = scrubPii(input);
    expect(result).toContain("[email removed]");
    expect(result).toContain("[phone removed]");
    expect(result).toContain("[IP removed]");
    expect(result).not.toContain("alice@example.com");
    expect(result).not.toContain("0412 345 678");
    expect(result).not.toContain("10.0.0.1");
  });

  it("leaves text with no PII unchanged", () => {
    const clean = "This message contains no personal information.";
    expect(scrubPii(clean)).toBe(clean);
  });

  it("does not modify empty string", () => {
    expect(scrubPii("")).toBe("");
  });

  // ── Email header content scenarios (as submitted by the report API) ──────────

  it("scrubs the reporter's email address embedded in raw headers", () => {
    const headers = [
      "Delivered-To: victim@gmail.com",
      "From: myGov <noreply@au-taxrefund.click>",
      "Subject: Your account is locked",
    ].join("\n");
    // The Delivered-To header is stripped at the route layer; scrubPii catches
    // any address that slips through (e.g. in X-Received or the body).
    const result = scrubPii(headers);
    expect(result).not.toContain("victim@gmail.com");
    expect(result).toContain("[email removed]");
    // Scammer address also redacted — that's expected at this layer; the route
    // stores scamEmail separately and doesn't need it preserved in content.
    expect(result).not.toContain("noreply@au-taxrefund.click");
  });

  it("scrubs an origin IP from Authentication-Results / Received-SPF headers", () => {
    const header = "Received-SPF: fail (domain of evil.tk) client-ip=203.0.113.42";
    const result = scrubPii(header);
    expect(result).not.toContain("203.0.113.42");
    expect(result).toContain("[IP removed]");
  });

  it("scrubs a full IPv6 address", () => {
    const result = scrubPii("relay 2001:0db8:85a3:0000:0000:8a2e:0370:7334 seen");
    expect(result).not.toContain("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
    expect(result).toContain("[IP removed]");
  });

  it("scrubs a compressed IPv6 address whole (no remnant)", () => {
    // The full-then-compressed form must be consumed entirely, leaving no "::1".
    expect(scrubPii("from 2002:a05:6512:31c3::1 by mx")).toBe("from [IP removed] by mx");
  });

  it("scrubs a short compressed IPv6 (link-local fe80::)", () => {
    expect(scrubPii("relay fe80::1234:5678 hop")).toBe("relay [IP removed] hop");
  });

  it("scrubs a trailing-compressed IPv6 (2001:db8::)", () => {
    const result = scrubPii("via 2001:db8:: now");
    expect(result).not.toContain("2001:db8");
    expect(result).toContain("[IP removed]");
  });

  it("scrubs a bracketed IPv6 whole, leaving no digit remnant", () => {
    // Regression: must not leave a stray "1]" — the whole address goes.
    expect(scrubPii("from [2001:db8::1]:25 by mx")).toBe("from [[IP removed]]:25 by mx");
  });

  it("does not mistake an HH:MM:SS timestamp for an IPv6 address", () => {
    const line = "Date: Tue, 21 Jun 2026 01:00:00 -0700";
    expect(scrubPii(line)).toBe(line);
    expect(scrubPii("sent at 12:30:45")).toBe("sent at 12:30:45");
  });

  it("does not mistake a short-decimal sequence for an IPv6 address", () => {
    // Regression: "1:2:3:4" (4 one-digit groups) is not an address.
    expect(scrubPii("grid 1:2:3:4 cols")).toBe("grid 1:2:3:4 cols");
    expect(scrubPii("ratio 16:9 screen")).toBe("ratio 16:9 screen");
  });

  it("scrubs the IPv6 in a Received header", () => {
    const result = scrubPii("Received: by 2002:a05:6512:31c3 with SMTP id x");
    expect(result).not.toContain("2002:a05:6512:31c3");
    expect(result).toContain("[IP removed]");
  });

  it("leaves an ordinary hex word untouched", () => {
    // A single hex group with no colon must not be mistaken for an IPv6 address.
    expect(scrubPii("order deadbeef confirmed")).toBe("order deadbeef confirmed");
  });

  it("redacts an AU mobile written in fullwidth Unicode digits", () => {
    // ０-９ are fullwidth 0-9 — visually a phone number, invisible to \d.
    expect(scrubPii("Call ０４１２ ３４５ ６７８ now")).toBe(
      "Call [phone removed] now"
    );
  });

  it("redacts an AU mobile with zero-width characters spliced between digits", () => {
    expect(scrubPii("Ring 0412​345​678 thanks")).toBe("Ring [phone removed] thanks");
  });
});

describe("stripReporterHeaders", () => {
  const phishHeaders = [
    "Delivered-To: victim@gmail.com",
    "X-Original-To: victim@gmail.com",
    "X-Forwarded-To: forward@gmail.com",
    "X-Google-Original-To: victim@googlemail.com",
    "X-Received: by 2002:a05:6512:31c3 with SMTP",
    "From: myGov <noreply@au-taxrefund.click>",
    "Reply-To: scammer@evil.ru",
    "Subject: Your account is locked",
    "Authentication-Results: mx.google.com; spf=fail",
    "",
    "Click here to verify.",
  ].join("\n");

  it("removes Delivered-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^Delivered-To:/im);
  });

  it("removes X-Original-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Original-To:/im);
  });

  it("removes X-Forwarded-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Forwarded-To:/im);
  });

  it("removes X-Google-Original-To header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Google-Original-To:/im);
  });

  it("removes X-Received header", () => {
    expect(stripReporterHeaders(phishHeaders)).not.toMatch(/^X-Received:/im);
  });

  it("removes a Received header and its folded continuation lines", () => {
    const withReceived = [
      "Delivered-To: victim@gmail.com",
      "Received: from mail.evil.tk (mail.evil.tk [203.0.113.9])",
      "        by mx.google.com with ESMTPS id abc123",
      "        for <victim@gmail.com>; Tue, 21 Jun 2026 01:00:00 -0700 (PDT)",
      "Received: from [2001:db8::1] by relay.example.com",
      "From: myGov <noreply@au-taxrefund.click>",
      "Subject: Locked",
      "",
      "Body here.",
    ].join("\n");
    const result = stripReporterHeaders(withReceived);
    expect(result).not.toMatch(/^Received:/im);
    expect(result).not.toContain("mx.google.com");
    expect(result).not.toContain("2001:db8::1");
    expect(result).not.toContain("203.0.113.9");
    // Scammer-side headers and the body survive.
    expect(result).toContain("From: myGov");
    expect(result).toContain("Body here.");
  });

  it("does not strip a body line that begins with a header-like word", () => {
    // Regression: "received"/"delivered-to" are ordinary words; a body sentence
    // starting with one (and a colon) must survive — stripping is header-only.
    const email = [
      "From: myGov <noreply@evil.tk>",
      "Subject: Action required",
      "",
      "Dear customer,",
      "Received: your parcel could not be delivered.",
      "Delivered-To: confirm your address at the link below.",
      "Click https://evil.tk to confirm.",
    ].join("\n");
    const result = stripReporterHeaders(email);
    expect(result).toContain("Received: your parcel could not be delivered.");
    expect(result).toContain("Delivered-To: confirm your address");
    expect(result).toContain("Click https://evil.tk to confirm.");
  });

  it("preserves the CRLF separator and body when stripping headers", () => {
    const email = "Delivered-To: me@x.com\r\nFrom: a@b.com\r\n\r\nBody line.";
    const result = stripReporterHeaders(email);
    expect(result).not.toMatch(/Delivered-To:/i);
    expect(result).toContain("From: a@b.com");
    expect(result).toContain("\r\n\r\nBody line.");
  });

  it("removes X-Originating-IP and Received-SPF but keeps Authentication-Results", () => {
    const headers = [
      "X-Originating-IP: [203.0.113.42]",
      "Received-SPF: fail (evil.tk) client-ip=203.0.113.42",
      "Authentication-Results: mx.google.com; spf=fail dkim=fail",
      "From: x@y.com",
    ].join("\n");
    const result = stripReporterHeaders(headers);
    expect(result).not.toMatch(/^X-Originating-IP:/im);
    expect(result).not.toMatch(/^Received-SPF:/im);
    expect(result).toContain("Authentication-Results:");
  });

  it("preserves scammer-side headers (From, Reply-To, Subject, Authentication-Results)", () => {
    const result = stripReporterHeaders(phishHeaders);
    expect(result).toContain("From: myGov");
    expect(result).toContain("Reply-To: scammer@evil.ru");
    expect(result).toContain("Subject: Your account is locked");
    expect(result).toContain("Authentication-Results:");
  });

  it("preserves the email body", () => {
    expect(stripReporterHeaders(phishHeaders)).toContain("Click here to verify.");
  });

  it("is case-insensitive on header names", () => {
    const mixed = "DELIVERED-TO: me@example.com\nx-received: by server\nFrom: x@y.com";
    const result = stripReporterHeaders(mixed);
    expect(result).not.toMatch(/DELIVERED-TO:/i);
    expect(result).not.toMatch(/x-received:/i);
    expect(result).toContain("From: x@y.com");
  });

  it("leaves non-email content unchanged", () => {
    const sms = "Your parcel is on hold. Pay $3.50 at https://auspost-fee.cc/pay";
    expect(stripReporterHeaders(sms)).toBe(sms);
  });
});

describe("findPii", () => {
  it("returns nothing for clean text", () => {
    expect(findPii("Your parcel is on board for delivery today")).toEqual([]);
  });

  it("returns each identifier as its own exact span", () => {
    expect(findPii("a@victim.com and c@evil.tk")).toEqual(["a@victim.com", "c@evil.tk"]);
  });

  it("keeps adjacent identifiers separate", () => {
    // Two addresses one character apart. The span must not run from the first
    // to the end of the second.
    expect(findPii("From: evil@scam.tk <victim@gmail.com>")).toEqual([
      "evil@scam.tk",
      "victim@gmail.com",
    ]);
  });

  it("separates identifiers whose own pattern spans whitespace", () => {
    expect(findPii("Call 0412 345 678 or 0412 999 111 today")).toEqual([
      "0412 345 678",
      "0412 999 111",
    ]);
  });

  it("reports spans in order of appearance across pattern kinds", () => {
    expect(findPii("mail a@b.com then call 0412 345 678")).toEqual(["a@b.com", "0412 345 678"]);
  });

  it("does not double-report a span an earlier pattern already consumed", () => {
    // scrubPii runs IPv4 before IPv6 so a mapped address has its tail redacted
    // first; findPii mirrors that rather than reporting both.
    expect(findPii("relay ::ffff:1.2.3.4 hop")).toEqual(["1.2.3.4"]);
  });

  it("agrees with scrubPii on whether anything matched", () => {
    for (const text of [
      "nothing here",
      "TFN 123 456 789",
      "BSB 062-123",
      "Card: 4532 1234 5678 9012",
      "Server at 192.168.1.1",
      "sent at 12:30:45",
    ]) {
      expect(findPii(text).length > 0).toBe(scrubPii(text) !== text);
    }
  });

  it("returns spans that are literal substrings of the input", () => {
    const text = "From: \"myGov\" <noreply@evil.tk> ring 0412 345 678";
    for (const hit of findPii(text)) expect(text).toContain(hit);
  });
});
