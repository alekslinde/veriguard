# Changelog

## [0.7.0](https://github.com/alekslinde/veriguard/compare/worker-v0.6.0...worker-v0.7.0) (2026-10-06)


### Features

* rename to Veriguard: brand copy, and plumbing pointed at veriguard.app ([73b3c95](https://github.com/alekslinde/veriguard/commit/73b3c9512ae8af845ca25cbcda76bae10b8959fb), [1b37d36](https://github.com/alekslinde/veriguard/commit/1b37d366df7ea4eb847ebbb8b1b5a05cac644baa), [54cce3e](https://github.com/alekslinde/veriguard/commit/54cce3e41eaaa079aea6e10a0a572a585f752f04))
* **email:** partial verdict for oversized forwards ([dd0a8db](https://github.com/alekslinde/veriguard/commit/dd0a8db978281ffd4c54d444bed505c605b968a0), [1d1ebe2](https://github.com/alekslinde/veriguard/commit/1d1ebe28e900cd17414bde19c56fbf7bd98cdda1))
* **email:** gate a fresh-send fallback on the platform's DKIM ([788abb3](https://github.com/alekslinde/veriguard/commit/788abb3c0de924d91ec565e2c63a1633ebfced14))


### Fixes

* **email:** analyse only the forwarded scam ([6eb777a](https://github.com/alekslinde/veriguard/commit/6eb777ab0ae5d03957be671c41f60a621eb8f415))
* **email:** bound and de-duplicate the reply's References chain ([11ccda2](https://github.com/alekslinde/veriguard/commit/11ccda240d4e2031572942914050b37edbca9949), [973c7c1](https://github.com/alekslinde/veriguard/commit/973c7c1f3a582a3211fc04b26b40cfa16f1e872a), [56a41a3](https://github.com/alekslinde/veriguard/commit/56a41a3ea5213a3ae61da2c2a86df3435ab82531), [017fa41](https://github.com/alekslinde/veriguard/commit/017fa4187b493255e2e312dbf1a2ec37c0c7f835))
* **email:** log inbound auth verdicts, grouped by identity and labelled with who wrote each, from the first auth-results set only ([a540268](https://github.com/alekslinde/veriguard/commit/a5402689e24ec43467e3748ebe1f239a2288e8a4), [70f60eb](https://github.com/alekslinde/veriguard/commit/70f60ebf898c92ecc9b954b8cb00c337c2541378), [33d7fe2](https://github.com/alekslinde/veriguard/commit/33d7fe2086556345d693d06af389f55111bcee56), [03576ba](https://github.com/alekslinde/veriguard/commit/03576bab1c3b0b2d73bae990411ff3e1e96e17f5), [551bfeb](https://github.com/alekslinde/veriguard/commit/551bfeb0500dc8b2d4168599ce61943725bb57a9), [784ab21](https://github.com/alekslinde/veriguard/commit/784ab219999275a0451ecae1ce6e894466ee3545), [10659fa](https://github.com/alekslinde/veriguard/commit/10659fa570643d5a5c891501a9e2f79481f8fd44))
* **email:** log envelope shape, correct the authentication framing ([6cb1057](https://github.com/alekslinde/veriguard/commit/6cb1057af05403f624713a0796296a4f871b8a7d), [ec78c4d](https://github.com/alekslinde/veriguard/commit/ec78c4d69fb85f1d94e2edf82a9f0c0f41fa2df4))
* **email:** report every way a forwarded check can fail, including the platform's own reply-refusal reason ([cc1985c](https://github.com/alekslinde/veriguard/commit/cc1985c352147dbe151b2203d824efdb86ef7b35), [2a1a82e](https://github.com/alekslinde/veriguard/commit/2a1a82ebcfce5ead604922fdb3c86642441cbe74), [906aa3e](https://github.com/alekslinde/veriguard/commit/906aa3e146c6b2f704a0753751d9f8f5d5f336e3), [907cb8e](https://github.com/alekslinde/veriguard/commit/907cb8e03ad54d63e59cb25ceb05d643d68e1591))
* **email:** send the verdict reply as 7-bit ASCII ([e8947cf](https://github.com/alekslinde/veriguard/commit/e8947cf326408fd61de8776c656f4190ca9633ee), [edf7c12](https://github.com/alekslinde/veriguard/commit/edf7c1295f757506a3f1b05319cb4f2e61785214))
* **email:** parse addresses without a backtracking regex; decode entities once and trim the domain linearly ([73e5469](https://github.com/alekslinde/veriguard/commit/73e5469c96a4774ecb0e7710400139f32bab1b79), [649780e](https://github.com/alekslinde/veriguard/commit/649780e07f7689422fe45e51b67f3993bb8d28b1))
* security audit findings and open Dependabot alerts ([bae429e](https://github.com/alekslinde/veriguard/commit/bae429e73649d9dd0421f2aef593a2acfdde3c3f))
* **worker:** pin undici to ^7.29.1 to close 6 advisories ([#402](https://github.com/alekslinde/veriguard/issues/402)) ([636b515](https://github.com/alekslinde/veriguard/commit/636b515892080cb096de2109379a0c49e19626c0))
