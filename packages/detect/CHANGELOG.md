# Changelog

## [0.3.0](https://github.com/alekslinde/veriguard/compare/engine-v0.2.1...engine-v0.3.0) (2026-10-18)


### Features

* **detector:** score the callback-SMS composite (#463) ([#468](https://github.com/alekslinde/veriguard/pull/468)) ([b721e6f](https://github.com/alekslinde/veriguard/commit/b721e6fbd8eab1e420595f72dd617b01be2c68be))
* **detector:** catch netbank lookalike logon domains ([#466](https://github.com/alekslinde/veriguard/pull/466)) ([6b2c2f4](https://github.com/alekslinde/veriguard/commit/6b2c2f432c8b7e53dbc5eac56e14cb5bf5f4a099))
* **detector:** separate language coverage from pack depth ([#461](https://github.com/alekslinde/veriguard/pull/461)) ([523721f](https://github.com/alekslinde/veriguard/commit/523721f4ab537111940905d51fd5e1fd8f399a29))
* **detector:** three NLP-assessment items — confusables, language ID, stemmer ([#441](https://github.com/alekslinde/veriguard/pull/441)) ([04dbf6f](https://github.com/alekslinde/veriguard/commit/04dbf6f9f833eb07c83273e19906b7d37e18a144))
* **detector:** flag NCSC impersonation (NZ) ([#436](https://github.com/alekslinde/veriguard/pull/436)) ([1cb4d03](https://github.com/alekslinde/veriguard/commit/1cb4d031332f5ba2fb93d821663390bbb034cf41))
* **detector:** flag recovered funds held for a release fee ([#435](https://github.com/alekslinde/veriguard/pull/435)) ([a590e2b](https://github.com/alekslinde/veriguard/commit/a590e2bc1114c6766721b9f729ef144ce084aba8))
* **detector:** flag scam coaching and "money laundering case" wording ([#434](https://github.com/alekslinde/veriguard/pull/434)) ([80f2761](https://github.com/alekslinde/veriguard/commit/80f2761d237f1b5d613a21d1fb5d456a42270fb7))
* **detector:** flag AUSTRAC impersonation and agency WhatsApp hand-offs (AU) ([#433](https://github.com/alekslinde/veriguard/pull/433)) ([8f1ec11](https://github.com/alekslinde/veriguard/commit/8f1ec11d0a14fb06061ca7d8a8212ebf038b8bc7))

### Fixes

* **detector:** add .info/.works to SUSPICIOUS_TLDS ([#479](https://github.com/alekslinde/veriguard/pull/479)) ([e12fa47](https://github.com/alekslinde/veriguard/commit/e12fa47ce6c91f26ec2659db4ecfa18a77ac0f59))
* **detector:** stop a corroborated deferred row escaping the email discount ([#473](https://github.com/alekslinde/veriguard/pull/473)) ([9c386e7](https://github.com/alekslinde/veriguard/commit/9c386e750332fd8e608b479b4d85a4586bb61d96))
* **detector:** flag AE agency WhatsApp hand-off ([#448](https://github.com/alekslinde/veriguard/pull/448)) ([133c146](https://github.com/alekslinde/veriguard/commit/133c146bcdc320bbca3979332a214955606cf621))
* **detector:** point NZ reporting copy at the NCSC, not CERT NZ ([#440](https://github.com/alekslinde/veriguard/pull/440)) ([b1c3b5f](https://github.com/alekslinde/veriguard/commit/b1c3b5fbc8939d6bcc9f553c186d45e872c88b10))

## [0.2.1](https://github.com/alekslinde/veriguard/compare/engine-v0.2.0...engine-v0.2.1) (2026-10-06)


### Fixes

* **config:** ship mcp's bundled lib code as Apache-2.0, link package docs ([#418](https://github.com/alekslinde/veriguard/issues/418)) ([4bdb288](https://github.com/alekslinde/veriguard/commit/4bdb2880ae64981f9ba887362e8032a437708b35))

## [0.2.0](https://github.com/alekslinde/veriguard/compare/engine-v0.1.1...engine-v0.2.0) (2026-10-06)


### Features

* **api:** publish @veriguard/detect and @veriguard/mcp ([8c89eb9](https://github.com/alekslinde/veriguard/commit/8c89eb9301ebc100016f163280df0fdfa952c7e3))


### Fixes

* **detector:** remove backtracking blowup in four message patterns, and anchor the digit run in the counted voicemail rule ([049bf2c](https://github.com/alekslinde/veriguard/commit/049bf2ceb9364c1bea141ad39cd5d25c6fa5b600), [cb75715](https://github.com/alekslinde/veriguard/commit/cb757150b849bc184b06736d3d447c2660ff0205), [d80de5c](https://github.com/alekslinde/veriguard/commit/d80de5c35d369023f0dbfc8823f87353ebf258f9))
