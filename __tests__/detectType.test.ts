// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { detectType } from "@veriguard/detect/detectType";

describe("detectType — URLs", () => {
  it("classifies http/https URLs as url", () => {
    expect(detectType("http://bit.ly/scam")).toBe("url");
    expect(detectType("https://paypa1.com/login")).toBe("url");
  });

  it("classifies bare www. hostnames as url", () => {
    expect(detectType("www.example.com")).toBe("url");
  });

  it("is case-insensitive on the scheme", () => {
    expect(detectType("HTTPS://EXAMPLE.COM")).toBe("url");
    expect(detectType("WWW.example.com")).toBe("url");
  });

  it("ignores surrounding whitespace", () => {
    expect(detectType("   https://example.com   ")).toBe("url");
  });

  it("does not treat a URL mentioned mid-sentence as a url", () => {
    // Only matches when the content STARTS with the URL.
    expect(detectType("click here: https://example.com")).toBe("sms");
  });
});

describe("detectType — phone numbers", () => {
  it("classifies plain and international numbers as phone", () => {
    expect(detectType("0412 345 678")).toBe("phone");
    expect(detectType("+61 412 345 678")).toBe("phone");
  });

  it("accepts separators and brackets when the number starts with a digit", () => {
    expect(detectType("02 (9876) 5432")).toBe("phone");
  });

  it("does NOT detect a number that starts with a bracket (known limitation)", () => {
    // The regex anchors on an optional '+' then a digit, so a leading '('
    // prevents a match and the input falls through to sms. Documented here
    // so a future regex change to support this is a deliberate, visible edit.
    expect(detectType("(02) 9876-5432")).toBe("sms");
  });

  it("does not classify a too-short number as phone", () => {
    expect(detectType("12345")).toBe("sms");
  });
});

describe("detectType — emails", () => {
  it("classifies pasted email headers as email", () => {
    expect(detectType("From: scammer@evil.com\nSubject: Urgent")).toBe("email");
    expect(detectType("Subject: You won")).toBe("email");
  });

  it("matches headers case-insensitively and on later lines", () => {
    expect(detectType("Hi there\nTO: victim@example.com")).toBe("email");
  });

  it("does not classify a bare email address as email", () => {
    // A lone address has no header prefix, so it falls through to sms.
    expect(detectType("scammer@evil.com")).toBe("sms");
  });
});

describe("detectType — fallback", () => {
  it("classifies free-text messages as sms", () => {
    expect(detectType("Your parcel is held, pay a fee to release it")).toBe("sms");
  });

  it("classifies empty input as sms", () => {
    expect(detectType("")).toBe("sms");
    expect(detectType("   ")).toBe("sms");
  });
});

describe("detectType — precedence", () => {
  it("prefers url over phone when content starts with a URL", () => {
    expect(detectType("https://0412345678.example.com")).toBe("url");
  });
});
