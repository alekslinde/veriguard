// The hostname-hashing scheme shared by the blocklist endpoint and its clients.
//
// **This is obfuscation, not confidentiality, and the difference matters.**
// Hostnames are low-entropy and enumerable: anyone with a domain wordlist can
// hash candidates offline and recover most of any list published this way. So
// this does NOT protect the contents, and no part of the system may assume it
// does.
//
// What it does buy, which is narrower but real: the response is not a
// ready-to-use list of live malware hosts, served under our name and indexed at
// our URL. A reader who wants the list can still reconstruct it — from
// abuse.ch, where it is published openly, which is the honest answer to "why
// bother". The endpoint carries the same note so nobody reading only one half
// of this comes away with the wrong idea.
//
// Lives in the engine because both sides must agree byte for byte, and a
// scheme defined twice is a scheme that drifts. The server hashes the feed; the
// client hashes each hostname it is asked about. A mismatch in truncation
// length or digest would not throw — it would silently answer `false` for every
// lookup, which is a blocklist that quietly does nothing.

/**
 * Hex characters kept from each digest.
 *
 * 16 hex chars is 64 bits. At the feed's ~5000 entries the chance of any
 * collision is about 5000² / 2⁶⁵ ≈ 7e-13 — far below the rate at which the
 * upstream feed itself carries a wrong entry, so truncation is not the weak
 * link. A collision would produce a false positive (an innocent host reported
 * as malicious), which is the expensive direction, hence the headroom.
 */
export const HOST_HASH_HEX_LENGTH = 16;

/** Identifies the scheme in the payload, so a change is visible to clients. */
export const HOST_HASH_ALGORITHM = "sha256-64";

/**
 * SHA-256, synchronous, returning the first `HOST_HASH_HEX_LENGTH` hex chars.
 *
 * Implemented here rather than via WebCrypto because the engine's blocklist
 * lookup is synchronous — one `has()` call inside the scorer — and
 * `crypto.subtle.digest` is async-only. Making the scorer async to accommodate
 * a hash would turn every checker's signature inside out for one membership
 * test, so the hash comes to the scorer instead.
 *
 * Node's `crypto` is deliberately not used even where it is available: the
 * engine is framework-free and bundles for a browser, and importing a node
 * builtin here would break that and trip the no-network lint scope besides.
 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** UTF-8 bytes of `text`, without depending on TextEncoder's availability. */
function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      // Surrogate pair — combine into one code point rather than encoding each
      // half, which would produce CESU-8 and disagree with every other SHA-256.
      const next = text.charCodeAt(i + 1);
      code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
      i++;
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
}

/** Full SHA-256 of `text`, as 64 lowercase hex characters. */
export function sha256Hex(text: string): string {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  // Length as a 64-bit big-endian count. The high word is written from the
  // float rather than a shift: `bitLength >>> 32` is 0 for every 32-bit int in
  // JavaScript, which would silently truncate any input over 512MB.
  const high = Math.floor(bitLength / 0x100000000);
  bytes.push(
    (high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
    (bitLength >>> 24) & 0xff, (bitLength >>> 16) & 0xff, (bitLength >>> 8) & 0xff, bitLength & 0xff,
  );

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }

  let out = "";
  for (let i = 0; i < 8; i++) out += h[i].toString(16).padStart(8, "0");
  return out;
}

/**
 * The published hash for one hostname.
 *
 * Normalises exactly as the scorer does before its lookup — lowercased, trailing
 * dots stripped. Both sides call this rather than normalising separately, so
 * "example.com." and "Example.com" cannot hash to something the other side
 * never produces.
 */
export function hashHost(hostname: string): string {
  const normalised = hostname.toLowerCase().replace(/\.+$/, "");
  return sha256Hex(normalised).slice(0, HOST_HASH_HEX_LENGTH);
}

/**
 * A `HostLookup` over published hashes.
 *
 * Hashes on each call rather than pre-hashing, because the scorer asks about a
 * handful of hostnames per check while the list holds thousands — hashing the
 * question is orders of magnitude less work than hashing the answer set.
 */
export function hashedHostLookup(hashes: Iterable<string>): { has(hostname: string): boolean } {
  const set = new Set(hashes);
  return {
    has(hostname: string): boolean {
      if (!hostname) return false;
      return set.has(hashHost(hostname));
    },
  };
}
