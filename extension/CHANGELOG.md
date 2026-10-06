# Changelog

## [0.4.0](https://github.com/alekslinde/veriguard/compare/extension-v0.3.2...extension-v0.4.0) (2026-10-06)


### Features

* **ext:** offline text check as a WebExtension for Chrome, Edge, Firefox and Safari, versioned separately with its own listing and privacy policy ([36bbc49](https://github.com/alekslinde/veriguard/commit/36bbc49167d0d1c0f3c45b1ba4bc9e0b832cc57e), [be93b64](https://github.com/alekslinde/veriguard/commit/be93b64243df6d93b0f86545182d97a63ce50cc4), [4c3973c](https://github.com/alekslinde/veriguard/commit/4c3973c0aeb1778fa54b3e50677995fdda9c7837))
* **ext:** right-click checks signal their result, explained on a first-run page ([c8d32d7](https://github.com/alekslinde/veriguard/commit/c8d32d7ba631de4f506745531e33cb69e05c5948), [5f9dd60](https://github.com/alekslinde/veriguard/commit/5f9dd604d84004a3dd2fcdb44b8e631d6474a529))
* **ext:** report hand-off from the popup; extension reach published and prompted reports attributed ([ec9ede8](https://github.com/alekslinde/veriguard/commit/ec9ede813d1bf2400a4d20bcc192d352c478cb0e), [a0ea17f](https://github.com/alekslinde/veriguard/commit/a0ea17fe681cd26b333e4e73a733ce46f79aabd2), [6cfeeab](https://github.com/alekslinde/veriguard/commit/6cfeeab285c50d1c30162621a381c3fd8f54aad3))
* **ext:** store listing assets for the Chrome Web Store and AMO ([731c902](https://github.com/alekslinde/veriguard/commit/731c9024b373871737fc6fee201769e0e40e70d3), [5b01eb7](https://github.com/alekslinde/veriguard/commit/5b01eb73cd99e3f3d9495e6bcdabfb6d5ad8b995), [d6f3b2d](https://github.com/alekslinde/veriguard/commit/d6f3b2d15f8c93f757f820bbcf51a1733fb93a23), [d978c90](https://github.com/alekslinde/veriguard/commit/d978c90ac062d43199f362238f32bf3bacc5ea67), [05fced1](https://github.com/alekslinde/veriguard/commit/05fced1b87dbd83cacdf63dd2fe0b71620f6fbd2))
* **ui:** the two-tone mark across all surfaces ([dc4414a](https://github.com/alekslinde/veriguard/commit/dc4414afbe157c69489dda7fec730d1cc7d91d4e))
* **api:** serve the blocklist to bundled clients ([1fe86e7](https://github.com/alekslinde/veriguard/commit/1fe86e7f33cb59061f0268c6d769662bacfb4c22))
* **api:** publish @veriguard/detect and @veriguard/mcp ([8c89eb9](https://github.com/alekslinde/veriguard/commit/8c89eb9301ebc100016f163280df0fdfa952c7e3))


### Fixes

* **ext:** right-click signalling publishes only the newest check ([a19ffdd](https://github.com/alekslinde/veriguard/commit/a19ffdd782887ef9727cb702b0c3ebbf4e7dc29a), [50dda90](https://github.com/alekslinde/veriguard/commit/50dda906921de5c05e2bb73e51e11f59384beb53))
* **ext:** survive runtimes with no context-menu API, including Firefox for Android, and meet AMO's version floors ([1913d5e](https://github.com/alekslinde/veriguard/commit/1913d5e95e20b602cbe5976871257c4068d58817), [fe52536](https://github.com/alekslinde/veriguard/commit/fe525363d65d1e2a274824da3e68e9b09dad920a), [008a7d5](https://github.com/alekslinde/veriguard/commit/008a7d5d94bf2ab0ddc95630781b8c2100fbd712))
* **ext:** declare no data collection to AMO ([a03fc11](https://github.com/alekslinde/veriguard/commit/a03fc1122fe1d789bf1ba2a4e5103e85dddb4ed0))
* **ext:** store zips leave out hidden files and the Safari app icon ([1c334aa](https://github.com/alekslinde/veriguard/commit/1c334aa545e09ad7c0434b734387b37f355dcedb), [7a5a078](https://github.com/alekslinde/veriguard/commit/7a5a078e0d1648ec6e75ec26b1d6de23090d7a15), [2b2a9d6](https://github.com/alekslinde/veriguard/commit/2b2a9d6825f750cf2d7d720cb114cd2f194052d6))
* **ext:** draw the mark's dog on dark surfaces, and polish the first-run page ([f135de0](https://github.com/alekslinde/veriguard/commit/f135de00642fb6381874571814c5dcbb8bf5111b), [01a48f8](https://github.com/alekslinde/veriguard/commit/01a48f893f45747adecb5d2dbe3c8299fd2e5fbb), [047f5c7](https://github.com/alekslinde/veriguard/commit/047f5c7ec71f6cf0af529e33645b5a7a96072c6c))
* **ext:** close review findings in the WebExtension ([b134026](https://github.com/alekslinde/veriguard/commit/b1340265980739676316104b9cd57818afad9d0d))
* **db:** persist report source end to end ([61f5c37](https://github.com/alekslinde/veriguard/commit/61f5c37fb7d8940c637ee08a7a4c14ac9c742de1))
* **detector:** make long unbroken runs scan linearly ([ce91bcb](https://github.com/alekslinde/veriguard/commit/ce91bcbaa2a26a9bf15dc98863665f7d24471356))
* **config:** resolve the engine from source, publish from dist ([c88634c](https://github.com/alekslinde/veriguard/commit/c88634c14ee7641250f94bb98e44d1f79603abf8))
