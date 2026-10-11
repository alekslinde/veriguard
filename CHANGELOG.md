# Changelog

## [0.41.0](https://github.com/alekslinde/veriguard/compare/app-v0.40.0...app-v0.41.0) (2026-10-11)


### Features

* **detector:** flag AUSTRAC impersonation and agency WhatsApp hand-offs (AU) ([#433](https://github.com/alekslinde/veriguard/issues/433)) ([8f1ec11](https://github.com/alekslinde/veriguard/commit/8f1ec11d0a14fb06061ca7d8a8212ebf038b8bc7))
* **detector:** flag NCSC impersonation (NZ) ([#436](https://github.com/alekslinde/veriguard/issues/436)) ([1cb4d03](https://github.com/alekslinde/veriguard/commit/1cb4d031332f5ba2fb93d821663390bbb034cf41))
* **detector:** flag recovered funds held for a release fee ([#435](https://github.com/alekslinde/veriguard/issues/435)) ([a590e2b](https://github.com/alekslinde/veriguard/commit/a590e2bc1114c6766721b9f729ef144ce084aba8))
* **detector:** flag scam coaching and "money laundering case" wording ([#434](https://github.com/alekslinde/veriguard/issues/434)) ([80f2761](https://github.com/alekslinde/veriguard/commit/80f2761d237f1b5d613a21d1fb5d456a42270fb7))
* **detector:** three NLP-assessment items — confusables, language ID, stemmer ([#441](https://github.com/alekslinde/veriguard/issues/441)) ([04dbf6f](https://github.com/alekslinde/veriguard/commit/04dbf6f9f833eb07c83273e19906b7d37e18a144))


### Fixes

* **detector:** point NZ reporting copy at the NCSC, not CERT NZ ([#440](https://github.com/alekslinde/veriguard/issues/440)) ([b1c3b5f](https://github.com/alekslinde/veriguard/commit/b1c3b5fbc8939d6bcc9f553c186d45e872c88b10))
* **threat-intel:** close gaps in the sweep brief and source checks ([#437](https://github.com/alekslinde/veriguard/issues/437)) ([de30c6f](https://github.com/alekslinde/veriguard/commit/de30c6f6c0c346df277fd0afcdf3c2114da3392f))

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
