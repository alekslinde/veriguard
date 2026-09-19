// Stand-in for the `cloudflare:email` runtime module.
//
// The Workers runtime provides it; the default ESM loader rejects the
// `cloudflare:` scheme outright, which is why src/index.ts could not be
// imported by a test at all — and why its failure handling went uncovered
// while a stale secret took the whole path down unnoticed.
//
// EmailMessage is a passive carrier here: the handler constructs one and hands
// it to message.reply(), and the tests assert on what reply() received. Nothing
// in src/index.ts reads it back, so holding the three values is the whole
// contract.
export class EmailMessage {
  constructor(from, to, raw) {
    this.from = from;
    this.to = to;
    this.raw = raw;
  }
}
