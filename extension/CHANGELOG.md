# Changelog

## [0.4.0](https://github.com/alekslinde/veriguard/compare/extension-v0.3.2...extension-v0.4.0) (2026-10-06)


### Features

* **api:** publish @veriguard/detect and @veriguard/mcp ([8c89eb9](https://github.com/alekslinde/veriguard/commit/8c89eb9301ebc100016f163280df0fdfa952c7e3))
* **api:** serve the blocklist to bundled clients ([1fe86e7](https://github.com/alekslinde/veriguard/commit/1fe86e7f33cb59061f0268c6d769662bacfb4c22))
* **ext:** add Chrome Web Store listing assets ([731c902](https://github.com/alekslinde/veriguard/commit/731c9024b373871737fc6fee201769e0e40e70d3))
* **ext:** add Chrome Web Store promo tiles ([5b01eb7](https://github.com/alekslinde/veriguard/commit/5b01eb73cd99e3f3d9495e6bcdabfb6d5ad8b995))
* **ext:** add the AMO store screenshot ([d6f3b2d](https://github.com/alekslinde/veriguard/commit/d6f3b2d15f8c93f757f820bbcf51a1733fb93a23))
* **ext:** add the AMO store screenshot ([d978c90](https://github.com/alekslinde/veriguard/commit/d978c90ac062d43199f362238f32bf3bacc5ea67))
* **ext:** generate the store marketing screenshot ([05fced1](https://github.com/alekslinde/veriguard/commit/05fced1b87dbd83cacdf63dd2fe0b71620f6fbd2))
* **ext:** publish extension reach, attribute prompted reports ([a0ea17f](https://github.com/alekslinde/veriguard/commit/a0ea17fe681cd26b333e4e73a733ce46f79aabd2))
* **ext:** publish reach, attribute prompted reports ([6cfeeab](https://github.com/alekslinde/veriguard/commit/6cfeeab285c50d1c30162621a381c3fd8f54aad3))
* **ext:** signal a right-click result, and explain it on install ([c8d32d7](https://github.com/alekslinde/veriguard/commit/c8d32d7ba631de4f506745531e33cb69e05c5948))
* **ext:** signal a right-click result, with a polished first-run page ([5f9dd60](https://github.com/alekslinde/veriguard/commit/5f9dd604d84004a3dd2fcdb44b8e631d6474a529))
* **ui:** add a report hand-off to the extension popup ([ec9ede8](https://github.com/alekslinde/veriguard/commit/ec9ede813d1bf2400a4d20bcc192d352c478cb0e))
* **ui:** add Safari target and pin Edge compatibility ([be93b64](https://github.com/alekslinde/veriguard/commit/be93b64243df6d93b0f86545182d97a63ce50cc4))
* **ui:** add WebExtension scaffold with offline text check ([36bbc49](https://github.com/alekslinde/veriguard/commit/36bbc49167d0d1c0f3c45b1ba4bc9e0b832cc57e))
* **ui:** adopt the two-tone mark across all surfaces ([dc4414a](https://github.com/alekslinde/veriguard/commit/dc4414afbe157c69489dda7fec730d1cc7d91d4e))
* **ui:** version the extension separately, add listing and policy ([4c3973c](https://github.com/alekslinde/veriguard/commit/4c3973c0aeb1778fa54b3e50677995fdda9c7837))


### Fixes

* **config:** resolve the engine from source, publish from dist ([c88634c](https://github.com/alekslinde/veriguard/commit/c88634c14ee7641250f94bb98e44d1f79603abf8))
* **db:** persist report source end to end ([61f5c37](https://github.com/alekslinde/veriguard/commit/61f5c37fb7d8940c637ee08a7a4c14ac9c742de1))
* **detector:** make long unbroken runs scan linearly ([ce91bcb](https://github.com/alekslinde/veriguard/commit/ce91bcbaa2a26a9bf15dc98863665f7d24471356))
* **ext:** close review findings on right-click signalling ([50dda90](https://github.com/alekslinde/veriguard/commit/50dda906921de5c05e2bb73e51e11f59384beb53))
* **ext:** declare no data collection to AMO ([a03fc11](https://github.com/alekslinde/veriguard/commit/a03fc1122fe1d789bf1ba2a4e5103e85dddb4ed0))
* **ext:** draw the mark's dog on dark surfaces ([f135de0](https://github.com/alekslinde/veriguard/commit/f135de00642fb6381874571814c5dcbb8bf5111b))
* **ext:** draw the mark's dog on dark surfaces ([01a48f8](https://github.com/alekslinde/veriguard/commit/01a48f893f45747adecb5d2dbe3c8299fd2e5fbb))
* **ext:** keep Safari app icon out of store zips ([2b2a9d6](https://github.com/alekslinde/veriguard/commit/2b2a9d6825f750cf2d7d720cb114cd2f194052d6))
* **ext:** pack store zips without hidden files ([1c334aa](https://github.com/alekslinde/veriguard/commit/1c334aa545e09ad7c0434b734387b37f355dcedb))
* **ext:** package store zips without hidden files ([7a5a078](https://github.com/alekslinde/veriguard/commit/7a5a078e0d1648ec6e75ec26b1d6de23090d7a15))
* **ext:** polish first-run page layout and confirmation ([047f5c7](https://github.com/alekslinde/veriguard/commit/047f5c7ec71f6cf0af529e33645b5a7a96072c6c))
* **ext:** publish only the newest right-click check ([a19ffdd](https://github.com/alekslinde/veriguard/commit/a19ffdd782887ef9727cb702b0c3ebbf4e7dc29a))
* **ext:** raise Firefox minimum to match declared keys ([008a7d5](https://github.com/alekslinde/veriguard/commit/008a7d5d94bf2ab0ddc95630781b8c2100fbd712))
* **ext:** satisfy AMO version floors, survive Android's missing menus API ([fe52536](https://github.com/alekslinde/veriguard/commit/fe525363d65d1e2a274824da3e68e9b09dad920a))
* **ext:** survive runtimes with no context-menu API ([1913d5e](https://github.com/alekslinde/veriguard/commit/1913d5e95e20b602cbe5976871257c4068d58817))
* **ui:** close review findings in the WebExtension ([b134026](https://github.com/alekslinde/veriguard/commit/b1340265980739676316104b9cd57818afad9d0d))


### Refactors

* **config:** name the detection package @veriguard/detect ([3b0276b](https://github.com/alekslinde/veriguard/commit/3b0276bc379c046b482c04815a96a0a884fe5415))
* **ext:** move store assets out of the served root ([9634ffb](https://github.com/alekslinde/veriguard/commit/9634ffb420757475fea11886b0d40fab71b49a03))
* **i18n:** adopt the next-intl bundle layout and drop the tone axis ([10070d9](https://github.com/alekslinde/veriguard/commit/10070d9d2a5191e2fc8259340364c45d8b34858b))
