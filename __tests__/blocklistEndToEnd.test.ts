// Server hashes a host; client looks it up; the engine scores it.
//
// The unit tests on either side can both pass while the whole path is broken —
// a truncation-length or normalisation mismatch produces no error, just a
// lookup that always answers false. This asserts the join: the score actually
// moves, on the same hostname, through the real scorer.

import { describe, it, expect } from "vitest";
import { hashHost, hashedHostLookup } from "@veriguard/engine/hostHash";
import { checkUrl } from "@veriguard/engine/scamDetector";

/** What the endpoint publishes for a set of hosts. */
const publish = (hosts: string[]) => [...new Set(hosts)].map(hashHost).sort();

describe("blocklist round trip", () => {
  it("raises the score for a host the server published", async () => {
    const url = "https://malware-host.example/login";
    const lookup = hashedHostLookup(publish(["malware-host.example"]));

    const without = checkUrl(url);
    const with_ = checkUrl(url, lookup);

    expect(with_.score).toBeGreaterThan(without.score);
    expect(with_.flags.join(" ")).toContain("URLhaus");
  });

  it("leaves an unpublished host exactly as it was", async () => {
    const url = "https://ordinary-site.example/page";
    const lookup = hashedHostLookup(publish(["malware-host.example"]));

    expect(checkUrl(url, lookup).score).toBe(checkUrl(url).score);
  });

  it("matches regardless of the case or trailing dot in the URL", async () => {
    // The scorer lowercases and strips trailing dots before its lookup. If the
    // published hash were computed over a different normalisation, these would
    // silently miss.
    const lookup = hashedHostLookup(publish(["malware-host.example"]));

    for (const url of [
      "https://MALWARE-HOST.example/login",
      "https://Malware-Host.Example/login",
      "https://malware-host.example./login",
    ]) {
      expect(checkUrl(url, lookup).flags.join(" "), url).toContain("URLhaus");
    }
  });

  it("does not match a subdomain or parent of a published host", async () => {
    // Membership is exact, as it is for the plain Set the server uses. A
    // hashing scheme that accidentally matched suffixes would flag every
    // subdomain of a blocklisted host, including ones nobody reported.
    const lookup = hashedHostLookup(publish(["malware-host.example"]));

    for (const url of [
      "https://sub.malware-host.example/login",
      "https://malware-host.example.org/login",
    ]) {
      expect(checkUrl(url, lookup).flags.join(" "), url).not.toContain("URLhaus");
    }
  });

  it("scores identically to the plain hostname Set the server uses", async () => {
    // The two lookups must be interchangeable — that is the whole claim of the
    // hashed form. Any divergence means the extension and the site disagree
    // about the same input.
    const hosts = ["malware-host.example", "phish.test", "münchen-bank.example"];
    const hashed = hashedHostLookup(publish(hosts));
    const plain = new Set(hosts);

    for (const host of [...hosts, "innocent.example", "sub.phish.test"]) {
      const url = `https://${host}/x`;
      expect(checkUrl(url, hashed).score, host).toBe(checkUrl(url, plain).score);
    }
  });
});
