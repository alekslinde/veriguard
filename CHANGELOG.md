# Changelog

## [0.41.0](https://github.com/alekslinde/veriguard/compare/app-v0.40.0...app-v0.41.0) (2026-10-18)


### Features

* **detector:** catch netbank lookalike logon domains ([#466](https://github.com/alekslinde/veriguard/issues/466)) ([6b2c2f4](https://github.com/alekslinde/veriguard/commit/6b2c2f432c8b7e53dbc5eac56e14cb5bf5f4a099))
* **detector:** flag AUSTRAC impersonation and agency WhatsApp hand-offs (AU) ([#433](https://github.com/alekslinde/veriguard/issues/433)) ([8f1ec11](https://github.com/alekslinde/veriguard/commit/8f1ec11d0a14fb06061ca7d8a8212ebf038b8bc7))
* **detector:** flag NCSC impersonation (NZ) ([#436](https://github.com/alekslinde/veriguard/issues/436)) ([1cb4d03](https://github.com/alekslinde/veriguard/commit/1cb4d031332f5ba2fb93d821663390bbb034cf41))
* **detector:** flag recovered funds held for a release fee ([#435](https://github.com/alekslinde/veriguard/issues/435)) ([a590e2b](https://github.com/alekslinde/veriguard/commit/a590e2bc1114c6766721b9f729ef144ce084aba8))
* **detector:** flag scam coaching and "money laundering case" wording ([#434](https://github.com/alekslinde/veriguard/issues/434)) ([80f2761](https://github.com/alekslinde/veriguard/commit/80f2761d237f1b5d613a21d1fb5d456a42270fb7))
* **detector:** score the callback-SMS composite ([#463](https://github.com/alekslinde/veriguard/issues/463)) ([#468](https://github.com/alekslinde/veriguard/issues/468)) ([b721e6f](https://github.com/alekslinde/veriguard/commit/b721e6fbd8eab1e420595f72dd617b01be2c68be))
* **detector:** separate language coverage from pack depth ([#461](https://github.com/alekslinde/veriguard/issues/461)) ([523721f](https://github.com/alekslinde/veriguard/commit/523721f4ab537111940905d51fd5e1fd8f399a29))
* **detector:** three NLP-assessment items — confusables, language ID, stemmer ([#441](https://github.com/alekslinde/veriguard/issues/441)) ([04dbf6f](https://github.com/alekslinde/veriguard/commit/04dbf6f9f833eb07c83273e19906b7d37e18a144))
* **ui:** promote 2026-10-16 sweep to radar and calendar ([#474](https://github.com/alekslinde/veriguard/issues/474)) ([c5e18d1](https://github.com/alekslinde/veriguard/commit/c5e18d149c14e0f35a03d7435993a6f2456eb962))
* **ui:** promote 2026-10-18 sweep to radar and calendar ([#480](https://github.com/alekslinde/veriguard/issues/480)) ([84e85a2](https://github.com/alekslinde/veriguard/commit/84e85a29632fd506187ab33e5df47ac8b276cd40))


### Fixes

* **deps:** bump sharp to ^0.35.5 for GHSA-wq5f-xc86-pv6w ([#449](https://github.com/alekslinde/veriguard/issues/449)) ([189be20](https://github.com/alekslinde/veriguard/commit/189be207e04f1a8449ea399853b78124db3005c4))
* **detector:** add .info/.works to SUSPICIOUS_TLDS ([#479](https://github.com/alekslinde/veriguard/issues/479)) ([e12fa47](https://github.com/alekslinde/veriguard/commit/e12fa47ce6c91f26ec2659db4ecfa18a77ac0f59))
* **detector:** flag AE agency WhatsApp hand-off ([#448](https://github.com/alekslinde/veriguard/issues/448)) ([133c146](https://github.com/alekslinde/veriguard/commit/133c146bcdc320bbca3979332a214955606cf621))
* **detector:** point NZ reporting copy at the NCSC, not CERT NZ ([#440](https://github.com/alekslinde/veriguard/issues/440)) ([b1c3b5f](https://github.com/alekslinde/veriguard/commit/b1c3b5fbc8939d6bcc9f553c186d45e872c88b10))
* **detector:** stop a corroborated deferred row escaping the email discount ([#473](https://github.com/alekslinde/veriguard/issues/473)) ([9c386e7](https://github.com/alekslinde/veriguard/commit/9c386e750332fd8e608b479b4d85a4586bb61d96))
* **docs:** update dead CTM360 reports URL ([#462](https://github.com/alekslinde/veriguard/issues/462)) ([e036f2d](https://github.com/alekslinde/veriguard/commit/e036f2de3072b665fea9867a4a32b9e9f614b19b))
* **threat-intel:** close gaps in the sweep brief and source checks ([#437](https://github.com/alekslinde/veriguard/issues/437)) ([de30c6f](https://github.com/alekslinde/veriguard/commit/de30c6f6c0c346df277fd0afcdf3c2114da3392f))
* **ui:** make the email guide tabs keyboard-operable ([#451](https://github.com/alekslinde/veriguard/issues/451)) ([7282756](https://github.com/alekslinde/veriguard/commit/7282756347dbeaba690dc8b44c6b59e9b5e589f9))

## [0.40.0](https://github.com/alekslinde/veriguard/compare/app-v0.39.3...app-v0.40.0) (2026-10-06)


### Features

* **threat-intel:** sweep brief and region research rotation ([#430](https://github.com/alekslinde/veriguard/issues/430)) ([f65a878](https://github.com/alekslinde/veriguard/commit/f65a878d49be2226311cbd97643b0d763338b118))


### Fixes

* **threat-intel:** share the source checker's rot rule with the calendar check ([#431](https://github.com/alekslinde/veriguard/issues/431)) ([260f5ef](https://github.com/alekslinde/veriguard/commit/260f5efe6d2e57fbcfb3a1402bb1d9ff40b7c44d))

## [0.39.3](https://github.com/alekslinde/veriguard/compare/app-v0.39.2...app-v0.39.3) (2026-10-06)


### Fixes

* **config:** ship mcp's bundled lib code as Apache-2.0, link package docs ([#418](https://github.com/alekslinde/veriguard/issues/418)) ([4bdb288](https://github.com/alekslinde/veriguard/commit/4bdb2880ae64981f9ba887362e8032a437708b35))
* **threat-intel:** stop reporting live sources as dead in the source check ([#422](https://github.com/alekslinde/veriguard/issues/422)) ([9179e16](https://github.com/alekslinde/veriguard/commit/9179e16097e74e3117820993db78e83769637468))

## [0.39.2](https://github.com/alekslinde/veriguard/compare/app-v0.39.1...app-v0.39.2) (2026-10-06)


### Fixes

* **config:** bump source-map-js to 1.2.2 for GHSA-68fv-2mgg-jv7q ([#408](https://github.com/alekslinde/veriguard/issues/408)) ([23b56d8](https://github.com/alekslinde/veriguard/commit/23b56d83f61aebd25d4484cd19587399f4c185d7))
* **config:** generate extension icons before packing the store zips ([#409](https://github.com/alekslinde/veriguard/issues/409)) ([b0a9ff0](https://github.com/alekslinde/veriguard/commit/b0a9ff03a97f2050b7157a767c86004bfa52dfb0))

## [0.39.1](https://github.com/alekslinde/veriguard/compare/app-v0.39.0...app-v0.39.1) (2026-10-03)


### Fixes

* **ui:** stop every page's column taking its width from its content ([#400](https://github.com/alekslinde/veriguard/issues/400)) ([f9b367e](https://github.com/alekslinde/veriguard/commit/f9b367e18a5216d8cb5beecdf8ca355ddf5a42f1))

## [0.39.0](https://github.com/alekslinde/veriguard/compare/app-v0.38.0...app-v0.39.0) (2026-10-02)


### Features

* **config:** adopt release-please for all five parts ([293d8d5](https://github.com/alekslinde/veriguard/commit/293d8d5320be53dc50f109d52f39afe0c88e1ca6), [0deb91c](https://github.com/alekslinde/veriguard/commit/0deb91c88ce1dbe22417b0f5f9d53bfe26d1c6d3))
