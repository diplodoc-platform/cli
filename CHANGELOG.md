# Changelog

## [4.57.7](https://github.com/diplodoc-platform/cli/compare/v4.57.6...v4.57.7) (2025-03-27)


### Bug Fixes

* Write file race condition ([22f3dd9](https://github.com/diplodoc-platform/cli/commit/22f3dd92b2e1f70aadb08aa7a5aca887c2ecff02))

## [4.57.6](https://github.com/diplodoc-platform/cli/compare/v4.57.5...v4.57.6) (2025-03-27)


### Bug Fixes

* Fix sequential includes ([cddae07](https://github.com/diplodoc-platform/cli/commit/cddae07f8fcf0358bf0eb0bb5e50ccae7468baeb))

## [4.57.5](https://github.com/diplodoc-platform/cli/compare/v4.57.4...v4.57.5) (2025-03-27)


### Bug Fixes

* Fix singlepage files race condition ([b4bcc4d](https://github.com/diplodoc-platform/cli/commit/b4bcc4d995f6484387844cc6cd85d25f345be17e))

## [4.57.4](https://github.com/diplodoc-platform/cli/compare/v4.57.3...v4.57.4) (2025-03-26)


### Bug Fixes

* restore broken anchors ([c193a1d](https://github.com/diplodoc-platform/cli/commit/c193a1df8452cb7638c8d0849510ab7b57c5b031))

## [4.57.3](https://github.com/diplodoc-platform/cli/compare/v4.57.2...v4.57.3) (2025-03-26)


### Dependency update

* Update @diplodoc/client to 3.3.1 ([#1078](https://github.com/diplodoc-platform/cli/issues/1078)) ([6f5862f](https://github.com/diplodoc-platform/cli/commit/6f5862f0378c89eec40797f7e754dff980697334))

## [4.57.2](https://github.com/diplodoc-platform/cli/compare/v4.57.1...v4.57.2) (2025-03-25)


### Dependency update

* Update @diplodoc/client to 3.3.0 ([2cf559b](https://github.com/diplodoc-platform/cli/commit/2cf559b8442a1cde5271c5b1dc85c0d897e29a55))
* Update @diplodoc/transform to 4.50.2 ([7b15df0](https://github.com/diplodoc-platform/cli/commit/7b15df0c86ac350d8f0429b305dd79ac659c40db))

## [4.57.1](https://github.com/diplodoc-platform/cli/compare/v4.57.0...v4.57.1) (2025-03-24)


### Bug Fixes

* Force write generated openapi files ([d60d064](https://github.com/diplodoc-platform/cli/commit/d60d064222ac542f1fad43854344a178750206e2))

## [4.57.0](https://github.com/diplodoc-platform/cli/compare/v4.56.0...v4.57.0) (2025-03-24)


### Features

* Add meta tag "generator" ([fede530](https://github.com/diplodoc-platform/cli/commit/fede530cd716321ec23bb0071f5f78f4e8651b39))
* Reimplement linter to be compatible with new arch ([dade3d2](https://github.com/diplodoc-platform/cli/commit/dade3d25d35cd1590c33cb6ecdf527375bf8a589))


### Bug Fixes

* Copy all related files in one place ([00bcf72](https://github.com/diplodoc-platform/cli/commit/00bcf72d0988cc40ff8e8a3bd6bc12f42f8ab434))
* Do not handle images inside commented blocks ([e5a0ff1](https://github.com/diplodoc-platform/cli/commit/e5a0ff171dff3e7065ba1e73673336c261c707e8))
* Do not use legacy meta plugin ([2d6761c](https://github.com/diplodoc-platform/cli/commit/2d6761cb42ff5a962a8206de4617a73b6239a5d7))
* Fix `Search provider for 'local' is not registered.` for md build ([d4ff161](https://github.com/diplodoc-platform/cli/commit/d4ff161926a30f2638e03023d53476cb656ecb78))
* Fix deps detection ([d24a6f5](https://github.com/diplodoc-platform/cli/commit/d24a6f5b25fb5e941409ae63ee8974a13bcdddb8))
* Fix external link processing ([ce7fcc4](https://github.com/diplodoc-platform/cli/commit/ce7fcc496afdb8990e54f5623a649c3f29222e4a))
* Fix uncaught exceptions ([08f93ba](https://github.com/diplodoc-platform/cli/commit/08f93ba17844e70c0cf224b57984e59faf73e3c4))
* Ignore incorrect assets ([757c5be](https://github.com/diplodoc-platform/cli/commit/757c5becc5556806f3c97fee173014d7f1641fc7))
* Normalize empty yaml files ([7f3e072](https://github.com/diplodoc-platform/cli/commit/7f3e0721f14c2012a9769701ae774159124c7bed))
* Safely parse urls in markdown ([05af25a](https://github.com/diplodoc-platform/cli/commit/05af25a3216a545e62388825402eccdb9a3257f7))
* Show warnings and errors in quiet mode ([31e0b3a](https://github.com/diplodoc-platform/cli/commit/31e0b3aede4ccfa1ef553c29866673ff6c8c6620))
* Simplify async code in loaders ([af203ca](https://github.com/diplodoc-platform/cli/commit/af203cae4c02e136a702b455d8dcb51eddd6cf97))


### Performance Improvements

* Reduce memory consumption for assets ([3de3961](https://github.com/diplodoc-platform/cli/commit/3de3961a657641e2a974a64318d96c94bb9ec242))


### Dependency update

* Update @diplodoc/translation to 1.7.5 ([60f18fd](https://github.com/diplodoc-platform/cli/commit/60f18fd200d06e8795fe0808bf3a1d7ce9b30bde))
* Update yfmlint ([993ac7f](https://github.com/diplodoc-platform/cli/commit/993ac7f910a5bca52b6725015423f2e15d5abc40))

## [4.56.0](https://github.com/diplodoc-platform/cli/compare/v4.55.1...v4.56.0) (2025-03-10)


### Features

* Drop old logger support ([9b5abed](https://github.com/diplodoc-platform/cli/commit/9b5abed7272d0851b0bf9de488805f31a72af200))
* Enable new Vcs feature ([c962314](https://github.com/diplodoc-platform/cli/commit/c962314d28713c290816a5e6d6343d39f0272eea))
* Expose public Extension API ([a004f7a](https://github.com/diplodoc-platform/cli/commit/a004f7aeadda4572e943fb45fdfd6e2b9b00b8b4))
* Implement custom-resources feature ([1ff4e9e](https://github.com/diplodoc-platform/cli/commit/1ff4e9e643280cdfca4d4eb42ae32962b7c5fc11))
* Integrate external liquid package ([8c5dd44](https://github.com/diplodoc-platform/cli/commit/8c5dd44c094ac5c7c8eac55177c26cf38b0eebba))
* Protect Run.write from concurrent write ([3b35b56](https://github.com/diplodoc-platform/cli/commit/3b35b564b80c54dfc8d7753e1c21ec94d26dc507))
* Remove `sourcePath` option from core.Run.load ([0fa4aac](https://github.com/diplodoc-platform/cli/commit/0fa4aace7fd2f9d774769272ca8e85d898a29c8c))
* Remove processAssets step ([37cb50d](https://github.com/diplodoc-platform/cli/commit/37cb50d4e8f6b79dda47d7289b32da090e887c14))
* Use new Markdown service in processPages ([270aaf0](https://github.com/diplodoc-platform/cli/commit/270aaf0ca666f38505109030725282381fa68449))
* Use new services in page processing ([3d827e3](https://github.com/diplodoc-platform/cli/commit/3d827e31025038236bf3ec48444772485753077c))
* Use reimplemented changelogs plugin ([eb3a382](https://github.com/diplodoc-platform/cli/commit/eb3a3826809c343d7469aa097bc82e121be79c07))


### Bug Fixes

* Allow incorrect include syntax ([05393bb](https://github.com/diplodoc-platform/cli/commit/05393bb5d35a017645613333c4647830cae52bca))
* Copy leading page assets ([1100bfe](https://github.com/diplodoc-platform/cli/commit/1100bfe91763517e976a4e71dc094d0c09929a70))
* Extend out of scope logging ([d80088d](https://github.com/diplodoc-platform/cli/commit/d80088d5dbf17a4bc0c9a8b805d6d7c43e277438))
* Fix assets resolution ([32296b2](https://github.com/diplodoc-platform/cli/commit/32296b2da99791c32a8d16c42ffadf4d0bd2922d))
* Fix extension resolving ([7ab0025](https://github.com/diplodoc-platform/cli/commit/7ab0025fc230447039576329e724ceb157d06f00))
* Fix hidden directory filtering ([1a60921](https://github.com/diplodoc-platform/cli/commit/1a609216a072491df3ed264e1d3bcbc484696501))
* Fix Latex and Mermaid processing ([edc671c](https://github.com/diplodoc-platform/cli/commit/edc671cc1b28f4585840e2545639db457ba058b9))
* Fix leading assets copy ([0d5ef8f](https://github.com/diplodoc-platform/cli/commit/0d5ef8f5f22e367ac575c10a8a0096cedc94884f))
* Fix legacy presets resolving ([9f647f3](https://github.com/diplodoc-platform/cli/commit/9f647f3cb9dd4a9daed02ab136f40f26b83b7fa6))
* Fix PC preprocessing langs ([0e03175](https://github.com/diplodoc-platform/cli/commit/0e03175aa33258ce4bc016a6247bddeccdee1fc3))
* Fix search provider varning ([83fbcb1](https://github.com/diplodoc-platform/cli/commit/83fbcb1afb9a3cf2004ffbd3a23d07d22728a46d))
* Fixes for smoke tests ([00d6b50](https://github.com/diplodoc-platform/cli/commit/00d6b50fc7af102e0478712036b6c23c19d8c7ef))
* Handle root presets.yaml ([b9dff73](https://github.com/diplodoc-platform/cli/commit/b9dff7396ae6f12b1f43180b06c6cb483f236f2c))
* Improve VarsService memory consumption ([99f83f6](https://github.com/diplodoc-platform/cli/commit/99f83f68ac2a4b4c2fb3688fc04f72b688b4833a))
* Trim legacy config ([0ba54a3](https://github.com/diplodoc-platform/cli/commit/0ba54a3015ac52cd83b1b41ffe512207417b9886))


### Performance Improvements

* Improve heading match performance ([2ec51b2](https://github.com/diplodoc-platform/cli/commit/2ec51b20cda3ba90b8ee33b84678d1efc2dabb84))


### Dependency update

* Update mermaid, latex, translation ([5cad013](https://github.com/diplodoc-platform/cli/commit/5cad013c79a81fa2adf09910ffbdba56713bda7c))

## [4.55.1](https://github.com/diplodoc-platform/cli/compare/v4.55.0...v4.55.1) (2025-03-06)


### Bug Fixes

* move lib-storage to dependencies ([#1049](https://github.com/diplodoc-platform/cli/issues/1049)) ([7453ac9](https://github.com/diplodoc-platform/cli/commit/7453ac9bddc5d29d4e32df93140e87cb0f0b9b8d))

## [4.55.0](https://github.com/diplodoc-platform/cli/compare/v4.54.6...v4.55.0) (2025-03-05)


### Features

* replace PutObjectCommand with lib-storage ([#1047](https://github.com/diplodoc-platform/cli/issues/1047)) ([ff0c898](https://github.com/diplodoc-platform/cli/commit/ff0c8982a73a74366b2f899bb13c93a1e4f7b362))

## [4.54.6](https://github.com/diplodoc-platform/cli/compare/v4.54.5...v4.54.6) (2025-03-03)


### Dependency update

* Update @diplodoc/translation to 1.7.3 ([5d2b15e](https://github.com/diplodoc-platform/cli/commit/5d2b15e692807e7202954ecf037f2765bedbe7a5))

## [4.54.5](https://github.com/diplodoc-platform/cli/compare/v4.54.4...v4.54.5) (2025-02-27)


### Dependency update

* Update @diplodoc/translation to 1.7.2 ([4d7ed5a](https://github.com/diplodoc-platform/cli/commit/4d7ed5ac293008feaf02270f4c01071fba3cbeec))

## [4.54.4](https://github.com/diplodoc-platform/cli/compare/v4.54.3...v4.54.4) (2025-02-25)


### Dependency update

* Update @diplodoc/client to 3.1.12 ([#1039](https://github.com/diplodoc-platform/cli/issues/1039)) ([a78dffa](https://github.com/diplodoc-platform/cli/commit/a78dffafbd9856465064568dbb91d98f6ce33406))

## [4.54.3](https://github.com/diplodoc-platform/cli/compare/v4.54.2...v4.54.3) (2025-02-20)


### Dependency update

* Update @diplodoc/translation to 1.7.1 ([#1036](https://github.com/diplodoc-platform/cli/issues/1036)) ([6eb2351](https://github.com/diplodoc-platform/cli/commit/6eb2351f1f0c68d26d526c9cad6b212e0d93cb19))

## [4.54.2](https://github.com/diplodoc-platform/cli/compare/v4.54.1...v4.54.2) (2025-02-18)


### Dependency update

* bump @diplodoc-platform/transform to 4.47.1 ([c8bdff5](https://github.com/diplodoc-platform/cli/commit/c8bdff52ff8d706c5aebe9d41d1a51fb8c652122))

## [4.54.1](https://github.com/diplodoc-platform/cli/compare/v4.54.0...v4.54.1) (2025-02-17)


### Bug Fixes

* Fix search configuration ([aa70ecc](https://github.com/diplodoc-platform/cli/commit/aa70ecc94fe5077abd4d7a315620ad4e28d3df17))

## [4.54.0](https://github.com/diplodoc-platform/cli/compare/v4.53.15...v4.54.0) (2025-02-14)


### Features

* Attach new search engines ([8f2a1a6](https://github.com/diplodoc-platform/cli/commit/8f2a1a695a1a0e047272d8c2983c1ea78911a65d))
* Implement new AlgoliaSearch extension ([13bf4f2](https://github.com/diplodoc-platform/cli/commit/13bf4f297588206e77ffde3b6b12f22d57f7cb0f))
* Implement new Leading service ([6e5971d](https://github.com/diplodoc-platform/cli/commit/6e5971d9042c47eff0673e412dd8466b2c259b52))
* Implement new Meta service ([0d6d425](https://github.com/diplodoc-platform/cli/commit/0d6d425f7f945dd990bb4ed6d34c900fdcd2024f))
* Implement new Search service ([b08ba35](https://github.com/diplodoc-platform/cli/commit/b08ba35029b2608855701f6ecd8604f23d13e4c9))
* Implement new VCS service and connector ([76b9d7c](https://github.com/diplodoc-platform/cli/commit/76b9d7c22b69aec3330c5f38c62eb6aca22f23e4))


### Bug Fixes

* Fix core based paths ([4e35b36](https://github.com/diplodoc-platform/cli/commit/4e35b36187b71078dc564f27b8d027707e98efb7))
* Move external assets copy to postinstall step ([30ea78b](https://github.com/diplodoc-platform/cli/commit/30ea78bf8a003b3dba046716d7553c92b4ad9223))


### Dependency update

* Update core deps ([a2a1628](https://github.com/diplodoc-platform/cli/commit/a2a16282714dfd4688232282a4ccc0707e476dfc))

## [4.53.15](https://github.com/diplodoc-platform/cli/compare/v4.53.14...v4.53.15) (2025-02-10)


### Bug Fixes

* Fix async race confition on md files write ([f0593c5](https://github.com/diplodoc-platform/cli/commit/f0593c5488b89b0976f7fa98c815d36fc710454f))

## [4.53.14](https://github.com/diplodoc-platform/cli/compare/v4.53.13...v4.53.14) (2025-02-10)


### Bug Fixes

* Fix assets processing for leading pages with PC ([43d68b4](https://github.com/diplodoc-platform/cli/commit/43d68b4eddf56732fc937b6b65e3505b05a7fb6d))

## [4.53.13](https://github.com/diplodoc-platform/cli/compare/v4.53.12...v4.53.13) (2025-02-10)


### Bug Fixes

* Revert md2md tokenStream feature ([425598b](https://github.com/diplodoc-platform/cli/commit/425598bb12d5de0da09ffcd3c4ff8cd7ce1fe387))

## [4.53.12](https://github.com/diplodoc-platform/cli/compare/v4.53.11...v4.53.12) (2025-02-10)


### Bug Fixes

* Fix presets resolving for root merged toc fragments ([5042076](https://github.com/diplodoc-platform/cli/commit/50420760862e40c949d2c2f3e7d6795505cc5af2))

## [4.53.11](https://github.com/diplodoc-platform/cli/compare/v4.53.10...v4.53.11) (2025-02-07)


### Bug Fixes

* Normalize case when toc items is an object instead of array ([33bb645](https://github.com/diplodoc-platform/cli/commit/33bb645735ac49aa12cc61162789d0cd9321c39c))

## [4.53.10](https://github.com/diplodoc-platform/cli/compare/v4.53.9...v4.53.10) (2025-02-06)


### Bug Fixes

* Temporary mute error behevior on missed assets ([86ddbc5](https://github.com/diplodoc-platform/cli/commit/86ddbc5bd0fd04e673febdbb60d4851317f3b82a))

## [4.53.9](https://github.com/diplodoc-platform/cli/compare/v4.53.8...v4.53.9) (2025-02-06)


### Bug Fixes

* Handle same level toc root include ([cf8c5da](https://github.com/diplodoc-platform/cli/commit/cf8c5da9c8148feaa707f7cac0bd6d452e584588))

## [4.53.8](https://github.com/diplodoc-platform/cli/compare/v4.53.7...v4.53.8) (2025-02-05)


### Dependency update

* Update @diplodoc/transform to 4.45.5 ([295e011](https://github.com/diplodoc-platform/cli/commit/295e011d1692bf4df49d0a8d2acdbf3f8a9c528b))

## [4.53.7](https://github.com/diplodoc-platform/cli/compare/v4.53.6...v4.53.7) (2025-02-04)


### Bug Fixes

* Temporary disable fixed strict mode ([119221b](https://github.com/diplodoc-platform/cli/commit/119221b17c25af92f9ecdda843a5a77f519b9725))
* Use args and default config of parent program ([731e99c](https://github.com/diplodoc-platform/cli/commit/731e99cacfb7bb16ca3ccb01a83cadd03ffe5dee))
* Use run.write on files.json to omit errors on empty projects ([0064b73](https://github.com/diplodoc-platform/cli/commit/0064b734270df997a4a20a68f071ba1807558b68))

## [4.53.6](https://github.com/diplodoc-platform/cli/compare/v4.53.5...v4.53.6) (2025-02-04)


### Dependency update

* bump transform to 4.45.3 ([6ecbea2](https://github.com/diplodoc-platform/cli/commit/6ecbea28b768d5059a37c73ebf70267794a527ac))

## [4.53.5](https://github.com/diplodoc-platform/cli/compare/v4.53.4...v4.53.5) (2025-02-03)


### Bug Fixes

* Fix duplicated path prefix for root merged toc includes ([9c92d13](https://github.com/diplodoc-platform/cli/commit/9c92d1307abe9159271f82d9b54c4ed36479baac))
* Handle empty href in toc items ([0e15f40](https://github.com/diplodoc-platform/cli/commit/0e15f4027a5db624c48f5d64858ea1e1acc2784e))

## [4.53.4](https://github.com/diplodoc-platform/cli/compare/v4.53.3...v4.53.4) (2025-02-03)


### Bug Fixes

* Fix relative path search for page constructor links ([2792940](https://github.com/diplodoc-platform/cli/commit/2792940521e8d1b65a5ac5d132da6549446b75cb))

## [4.53.3](https://github.com/diplodoc-platform/cli/compare/v4.53.2...v4.53.3) (2025-02-03)


### Bug Fixes

* Disable `copy` logging noise ([8849771](https://github.com/diplodoc-platform/cli/commit/8849771b012bee73b9586da9bbc657ca29cd53e1))
* Fix keepNotVar feature for md2md generator ([71a056f](https://github.com/diplodoc-platform/cli/commit/71a056f167785e27a56f8a37a1d63a230ccd6f61))

## [4.53.2](https://github.com/diplodoc-platform/cli/compare/v4.53.1...v4.53.2) (2025-01-30)


### Dependency update

* Update @diplodoc/transform to 4.44.1 ([7e5509e](https://github.com/diplodoc-platform/cli/commit/7e5509ebc114f096dd261f18cca50412d881b79e))

## [4.53.1](https://github.com/diplodoc-platform/cli/compare/v4.53.0...v4.53.1) (2025-01-30)


### Bug Fixes

* Hide hidden items in final html toc ([9f77b00](https://github.com/diplodoc-platform/cli/commit/9f77b0091087e6baec98bb0cc2baeafe6b0a612e))

## [4.53.0](https://github.com/diplodoc-platform/cli/compare/v4.52.1...v4.53.0) (2025-01-30)


### Features

* add --schema param to translate extract command ([437c9c9](https://github.com/diplodoc-platform/cli/commit/437c9c9c87fdac97b2b56b1ccb184778cb10f3bc))


### Bug Fixes

* remove unpack from TocService.dir ([bf38ba9](https://github.com/diplodoc-platform/cli/commit/bf38ba92e6bcdbc7ba709d8cf4b52693103967bd))

## [4.52.1](https://github.com/diplodoc-platform/cli/compare/v4.52.0...v4.52.1) (2025-01-29)


### Bug Fixes

* Add hash to search index files ([df68dbb](https://github.com/diplodoc-platform/cli/commit/df68dbb563c19c008fd8c761006c2d200e02c0ff))
* Add hash to search index files for static build ([095d3c3](https://github.com/diplodoc-platform/cli/commit/095d3c3e30a3ca85af51df7a4abf117e3bd6c6d4))
* Fix NavPanel highlite for static content generation ([b470932](https://github.com/diplodoc-platform/cli/commit/b4709322d40ea07b12abaa44e9824d158e284f66))


### Dependency update

* bump transform version ([0a862b6](https://github.com/diplodoc-platform/cli/commit/0a862b6446a9e5624625a83d8ac779c7ea240673))
* Update @diplodoc/transform to 4.43.0 ([#986](https://github.com/diplodoc-platform/cli/issues/986)) ([d531449](https://github.com/diplodoc-platform/cli/commit/d5314497e398d57c39dcb83ca3393d4a8c95a3fc))

## [4.52.0](https://github.com/diplodoc-platform/cli/compare/v4.51.1...v4.52.0) (2025-01-23)


### Features

* add an e2e test to verify img in deflist behavior ([da3076c](https://github.com/diplodoc-platform/cli/commit/da3076c98eb25d35202e326f25359ff69c482953))
* add pdf generator base option ([4364944](https://github.com/diplodoc-platform/cli/commit/436494450e1221380608374389c37c129bae43be))
* Implement base run ([a45f69e](https://github.com/diplodoc-platform/cli/commit/a45f69edb0590309e0e9ee7ec6cba3ab4620c3d2))
* Improve Program initialization flow ([9c62c99](https://github.com/diplodoc-platform/cli/commit/9c62c99bae6f9e2cdb5d0126cd3e824d44d1a4b5))
* make collect plugin functions aware of the token stream ([289b4f5](https://github.com/diplodoc-platform/cli/commit/289b4f53bf343a1ccb5ef5540c540bb3e6db43e4))
* Remove `--buildDisabled` flag ([a61ec20](https://github.com/diplodoc-platform/cli/commit/a61ec209c1c94ce9df4e5051e361cd782ee38d09))
* upgrade transform to 4.42.0 ([68ee535](https://github.com/diplodoc-platform/cli/commit/68ee535cd594094ff8b3ad82de6355ccdbcc53a7))


### Bug Fixes

* Drop legacy toc service ([7ef6c75](https://github.com/diplodoc-platform/cli/commit/7ef6c75eff5aaaf3fd233d28a9a75855a7758400))
* Fix includers toc path resolution ([83e1e56](https://github.com/diplodoc-platform/cli/commit/83e1e5615a9c938fd9196ab2daa04bda4a38929c))
* Isolate core code. Move new utils to core. ([486a4b4](https://github.com/diplodoc-platform/cli/commit/486a4b4700432596249b6c9c28d25b870f9a0fd4))
* Remove some usages of shelljs ([2ccaf36](https://github.com/diplodoc-platform/cli/commit/2ccaf3611931838776cbb01c9d9704535fc971ac))

## [4.51.1](https://github.com/diplodoc-platform/cli/compare/v4.51.0...v4.51.1) (2025-01-14)


### Bug Fixes

* Fix toc include link mode ([05b6913](https://github.com/diplodoc-platform/cli/commit/05b69130826ef58044864eca50d26c55f92d8522))

## [4.51.0](https://github.com/diplodoc-platform/cli/compare/v4.50.0...v4.51.0) (2025-01-10)


### Features

* Add `init` method to service API ([1d81ab7](https://github.com/diplodoc-platform/cli/commit/1d81ab797e80f5ec58ad7530c69010f510eeed57))
* Extend Build.Run fs API ([55de3a3](https://github.com/diplodoc-platform/cli/commit/55de3a33b01065787bc675979eec2dcb0e8b1385))
* Handle `ignoreStage` as array ([0fa5fd0](https://github.com/diplodoc-platform/cli/commit/0fa5fd0dd06f07546b203769feef80a30d29c7a9))
* Implement Toc service ([2e1c78b](https://github.com/diplodoc-platform/cli/commit/2e1c78bcd152c7af4a0cdb83efb2eaf88baf2966))


### Bug Fixes

* Bound class methods with decorator ([4260d31](https://github.com/diplodoc-platform/cli/commit/4260d31a0758343d477476726b433928936e3997))
* Generate toc item ids on build ([45cab0a](https://github.com/diplodoc-platform/cli/commit/45cab0a0e0560d55b4569ea5076e83e4bf64d810))
* Handle hooks errors ([64359f8](https://github.com/diplodoc-platform/cli/commit/64359f80172a2f0f7953d40bed157086df588ac6))
* Migrate to new frontmatter API ([d5b8fdb](https://github.com/diplodoc-platform/cli/commit/d5b8fdb491df3fe1c5814c57331d88b064c7a502))
* use `copyFile` with optional Copy-on-Write optimizations instead of `link` ([9889497](https://github.com/diplodoc-platform/cli/commit/9889497b4758679277773f5af2cab7ed37788f8f))


### Dependency update

* Update openapi extension ([2cf0ede](https://github.com/diplodoc-platform/cli/commit/2cf0ede6ee85351ede28a671d7650dba4565725e))
* Update transform, vitest ([fa30d1b](https://github.com/diplodoc-platform/cli/commit/fa30d1b86e2bee5bc59a7cdd4ceed7d3982da0a7))

## [4.50.0](https://github.com/diplodoc-platform/cli/compare/v4.49.1...v4.50.0) (2024-12-05)


### Features

* Add build run fs utils ([ecff64a](https://github.com/diplodoc-platform/cli/commit/ecff64ac2f9eb8ec9828072cdeb459d5ba0a5363))


### Bug Fixes

* Update glob ([4df705c](https://github.com/diplodoc-platform/cli/commit/4df705c76c02cdf4dac038a30a171c696435c787))

## [4.49.1](https://github.com/diplodoc-platform/cli/compare/v4.49.0...v4.49.1) (2024-12-03)


### Bug Fixes

* Change page title resolving strategy ([669748a](https://github.com/diplodoc-platform/cli/commit/669748aff5e0e3e892b03fd6f1ce5bb034ad2d2a)), closes [#924](https://github.com/diplodoc-platform/cli/issues/924)
* Fix translation compose step ([d61c2b9](https://github.com/diplodoc-platform/cli/commit/d61c2b9a79ef8f0b24ad2dd33b6a5a963d574c35))
* Install highlight for prod package build ([0feb5ff](https://github.com/diplodoc-platform/cli/commit/0feb5ffd45c7c1989c16f58987b5a43fa9bf5993))
* Support legasy camelCase args ([5886fe5](https://github.com/diplodoc-platform/cli/commit/5886fe5007ac6d8fcc3e1c811662162bcb7ad819))


### Dependency update

* Update translation ([ca34116](https://github.com/diplodoc-platform/cli/commit/ca34116480f1e370d59c013d12eda9cbf49a0e51))

## [4.49.0](https://github.com/diplodoc-platform/cli/compare/v4.48.1...v4.49.0) (2024-11-27)


### Features

* Implement new build configuration systemcon ([baf8f6b](https://github.com/diplodoc-platform/cli/commit/baf8f6b24c8e15500d41f373c6653e4772fad2fc))


### Bug Fixes

* Attach new build system to main program ([55aaf13](https://github.com/diplodoc-platform/cli/commit/55aaf13bcae2381a82038aa8feb8253595742707))
* Enable new unit tests ([94773d9](https://github.com/diplodoc-platform/cli/commit/94773d9c5ac8e51bb20a5dc4ea24624c11711a7e))
* Fix context config prototype to ballow serialization ([195d30a](https://github.com/diplodoc-platform/cli/commit/195d30a54f11e6a0e831025d51e51aa4fb67358b))
* Fix global log processing to handle errors ([77a12a3](https://github.com/diplodoc-platform/cli/commit/77a12a39e0d7c4be8195354beef013e2b8ade121))
* Fix leading page urls for static build ([31b564e](https://github.com/diplodoc-platform/cli/commit/31b564e327ac4953436f62015d7613192996fad9))
* Fix post build logs processing ([2178c11](https://github.com/diplodoc-platform/cli/commit/2178c11ca9d46f01e34a60ad4ebe7b2da727c63c))
* Fix some lint and typecheck errors ([cff3f6c](https://github.com/diplodoc-platform/cli/commit/cff3f6c338f113171e4430eb419d4151a7eecd73))

## [4.48.1](https://github.com/diplodoc-platform/cli/compare/v4.48.0...v4.48.1) (2024-11-21)


### Dependency update

* Update @diplodoc/openapi-extension to 2.6.0 ([b8388c1](https://github.com/diplodoc-platform/cli/commit/b8388c1f050868c78a87eeacab0fff9a91d43ffa))

## [4.48.0](https://github.com/diplodoc-platform/cli/compare/v4.47.0...v4.48.0) (2024-11-19)


### Features

* **BREAKING** Drop internal build publish functionality ([fa93f88](https://github.com/diplodoc-platform/cli/commit/fa93f88691905293163fd3e209de6fb42560493c))


### Bug Fixes

* Fix search results urls ([fe036ea](https://github.com/diplodoc-platform/cli/commit/fe036eac29854cafc75228856c27810d0fabbea4))
* Fix some lint and typecheck errors ([e035838](https://github.com/diplodoc-platform/cli/commit/e0358388459d80259c8e7a2db18bb1bd8aaf8d5d))
* Fix translation tests ([e3f0174](https://github.com/diplodoc-platform/cli/commit/e3f017472813e94905eb1aa403f29434e71ec60b))
* Improve some types ([26d5849](https://github.com/diplodoc-platform/cli/commit/26d58498a55ea6e50a8e0fbbf47cb4b40030f9d6))
* Replace local trim with ts-dedent ([5f84624](https://github.com/diplodoc-platform/cli/commit/5f846240d5709c723d7069b3a479e2a7422d98aa))

## [4.47.0](https://github.com/diplodoc-platform/cli/compare/v4.46.0...v4.47.0) (2024-11-19)


### Features

* **cli:** add ignore files starts from underline ([#904](https://github.com/diplodoc-platform/cli/issues/904)) ([dc1d0fa](https://github.com/diplodoc-platform/cli/commit/dc1d0fa4aca61e4b288265236dfb6dcdd9e9f9df))


### Bug Fixes

* generic include should be inside root ([ccaa6f5](https://github.com/diplodoc-platform/cli/commit/ccaa6f591700140afcf225f5cb32d2506c71f3c8))

## [4.46.0](https://github.com/diplodoc-platform/cli/compare/v4.45.2...v4.46.0) (2024-11-19)


### Features

* add deprecated option in toc item ([ad77a43](https://github.com/diplodoc-platform/cli/commit/ad77a438dbd85fba8c2bdc76ae2cedc022cc6351))


### Bug Fixes

* check if output parameter is located inside root ([#896](https://github.com/diplodoc-platform/cli/issues/896)) ([69296e7](https://github.com/diplodoc-platform/cli/commit/69296e727af3a78f82e67b846142ee442f579499))

## [4.45.2](https://github.com/diplodoc-platform/cli/compare/v4.45.1...v4.45.2) (2024-11-18)


### Bug Fixes

* **deps:** update @diplodoc/tranform to 4.38.2 ([c39e7c6](https://github.com/diplodoc-platform/cli/commit/c39e7c6582fa5d754ebe71fb604ba89863af2f67))

## [4.45.1](https://github.com/diplodoc-platform/cli/compare/v4.45.0...v4.45.1) (2024-11-18)


### Bug Fixes

* update @diplodoc/transform@4.38.1 ([#892](https://github.com/diplodoc-platform/cli/issues/892)) ([5c9bed0](https://github.com/diplodoc-platform/cli/commit/5c9bed0bf6c2887bd23107fbb30282ae251febc6))

## [4.45.0](https://github.com/diplodoc-platform/cli/compare/v4.44.1...v4.45.0) (2024-11-15)


### Features

* build pc schema ([e21c638](https://github.com/diplodoc-platform/cli/commit/e21c6380762730594989c228d9aa947b62c2ed21))
* translate page-constructor pages ([f3ed0f6](https://github.com/diplodoc-platform/cli/commit/f3ed0f65f16a965e49ac8a2d6a7fa36ac99053fd))
* update @diplodoc/translation & run schema build on postinstall ([e73cf48](https://github.com/diplodoc-platform/cli/commit/e73cf48cc86ada3070f2da1a825b61a9bdc2e014))


### Bug Fixes

* update @diplodoc/transform@4.37.1 ([#888](https://github.com/diplodoc-platform/cli/issues/888)) ([91425ab](https://github.com/diplodoc-platform/cli/commit/91425abbaf670a8f43afaddf0d61ceedd672c20e))

## [4.44.1](https://github.com/diplodoc-platform/cli/compare/v4.44.0...v4.44.1) (2024-11-13)


### Bug Fixes

* deprecated with empty schemas ([a5b820c](https://github.com/diplodoc-platform/cli/commit/a5b820cdfb21ecd0507fe150471233b33ec3a0bb))
* Fix CSP tag generation ([8b64d8a](https://github.com/diplodoc-platform/cli/commit/8b64d8a7fefa47995b95cfd16bd952c3fd370c6c))
* Fix missed toc data for static-content ([b24876b](https://github.com/diplodoc-platform/cli/commit/b24876b1568e2f783828f104d4986c4d8979d1c1))
* pc types & @diplodoc/client update ([e8c8f55](https://github.com/diplodoc-platform/cli/commit/e8c8f554f319961d83e28aff5d2173baaa684f85))

## [4.44.0](https://github.com/diplodoc-platform/cli/compare/v4.43.1...v4.44.0) (2024-11-11)


### Features

* change custom csp in md2md mode ([7ef5a5f](https://github.com/diplodoc-platform/cli/commit/7ef5a5fde3e8db4cb374c61170d64e779b01fe9c))

## [4.43.1](https://github.com/diplodoc-platform/cli/compare/v4.43.0...v4.43.1) (2024-11-06)


### Bug Fixes

* Fix images path resolution one more time ([37a4c8e](https://github.com/diplodoc-platform/cli/commit/37a4c8e32afc2c29a4fd96b71b22cd7dd13bc0be))

## [4.43.0](https://github.com/diplodoc-platform/cli/compare/v4.42.5...v4.43.0) (2024-11-06)


### Features

* support csp in cli ([5f3b820](https://github.com/diplodoc-platform/cli/commit/5f3b820364afbeb1a2cf0622672130b44ade3fb1))

## [4.42.5](https://github.com/diplodoc-platform/cli/compare/v4.42.4...v4.42.5) (2024-11-06)


### Bug Fixes

* Fix images path resolution ([f214db1](https://github.com/diplodoc-platform/cli/commit/f214db16c6c6c56f41aab2033cfc150722eec486))

## [4.42.4](https://github.com/diplodoc-platform/cli/compare/v4.42.3...v4.42.4) (2024-11-06)


### Bug Fixes

* Update client ([363b02b](https://github.com/diplodoc-platform/cli/commit/363b02b2184babf9b6fc6531b3f80bd7e276e86e))

## [4.42.3](https://github.com/diplodoc-platform/cli/compare/v4.42.2...v4.42.3) (2024-11-05)


### Bug Fixes

* Fix dir creation on toc.js save ([c6fe709](https://github.com/diplodoc-platform/cli/commit/c6fe709d6112b4330783103c63bf86ad947a3129))
* Fix toc resolving for dir paths ([9099fb9](https://github.com/diplodoc-platform/cli/commit/9099fb9ec80cd3be54bc37d16df9ea136ec3c0a2))

## [4.42.2](https://github.com/diplodoc-platform/cli/compare/v4.42.1...v4.42.2) (2024-11-05)


### Bug Fixes

* Fix missed paths in toc ([739f9e3](https://github.com/diplodoc-platform/cli/commit/739f9e36b59700bc11da91be876413b0559674ee))

## [4.42.1](https://github.com/diplodoc-platform/cli/compare/v4.42.0...v4.42.1) (2024-11-05)


### Bug Fixes

* Fix extracted toc for single page mode ([5183022](https://github.com/diplodoc-platform/cli/commit/5183022797a6c8fd078ce97d961fb98d081bdab3))
* Fix page title computation ([f9135ce](https://github.com/diplodoc-platform/cli/commit/f9135ce61086b03bba9dcfd203c3b1234ae1a0cd))
* Fix tests ([224774b](https://github.com/diplodoc-platform/cli/commit/224774b9b8cdb29c906d157bf23e179a7404c61c))
* Fix tests ([58fe2a3](https://github.com/diplodoc-platform/cli/commit/58fe2a3b95f18a5702cf9ad991b6ec5baa4781ae))
* Umpdate mermaid extension ([7d97c32](https://github.com/diplodoc-platform/cli/commit/7d97c32594577a33b26f2f6db524e211e167bd9f))
* Update client ([f34fb16](https://github.com/diplodoc-platform/cli/commit/f34fb16deccde245c8d55953decf06f65efa0318))
* Update client ([ff73944](https://github.com/diplodoc-platform/cli/commit/ff7394443a64b23dad7d8539d6ec00cedae6ced7))
* Update search ([303b688](https://github.com/diplodoc-platform/cli/commit/303b68808309164b045215314d0f57cbd50b297a))

## [4.42.0](https://github.com/diplodoc-platform/cli/compare/v4.41.0...v4.42.0) (2024-10-29)


### Features

* Move toc to separated script for html build ([40e976a](https://github.com/diplodoc-platform/cli/commit/40e976ae680afa8bbb798d411690f08dfa5aa9e4))


### Bug Fixes

* Fix liquid processing for toc.yaml ([938a817](https://github.com/diplodoc-platform/cli/commit/938a8174c5496a82ba1fa6167dbfe4612af85f95))

## [4.41.0](https://github.com/diplodoc-platform/cli/compare/v4.40.0...v4.41.0) (2024-10-28)


### Features

* update deps ([#862](https://github.com/diplodoc-platform/cli/issues/862)) ([477c251](https://github.com/diplodoc-platform/cli/commit/477c251ec017f34d004266483dc801c0bc4d5bb5))

## [4.40.0](https://github.com/diplodoc-platform/cli/compare/v4.39.4...v4.40.0) (2024-10-24)


### Features

* passthrough options to transformMd2Md ([1b7422a](https://github.com/diplodoc-platform/cli/commit/1b7422a1f24cb0d4f3c6beeef2544384eab23b98))

## [4.39.4](https://github.com/diplodoc-platform/cli/compare/v4.39.3...v4.39.4) (2024-10-23)


### Bug Fixes

* Fix search assets path resolving ([0b22281](https://github.com/diplodoc-platform/cli/commit/0b222811dd1f8ed4ca9a0a44f78d852c571e828a))

## [4.39.3](https://github.com/diplodoc-platform/cli/compare/v4.39.2...v4.39.3) (2024-10-23)


### Bug Fixes

* linter ([f9b923f](https://github.com/diplodoc-platform/cli/commit/f9b923f8a76f0d9851d1e7a89df78526c4402fdd))
* Move search scripts to assets ([4bd36c0](https://github.com/diplodoc-platform/cli/commit/4bd36c0a5c9dad90d70607de2765dddc9154d167))

## [4.39.2](https://github.com/diplodoc-platform/cli/compare/v4.39.1...v4.39.2) (2024-10-21)


### Features

* Update OpenAPI extension version ([e3e12cd](https://github.com/diplodoc-platform/cli/commit/e3e12cdca7ddcd5bac5efa1cef9efa8a3c4d9221))
* Update transformer version ([93efc6e](https://github.com/diplodoc-platform/cli/commit/93efc6ea55fd00c36ceb9f81147fb87b8b01805e))

## [4.39.1](https://github.com/diplodoc-platform/cli/compare/v4.39.0...v4.39.1) (2024-10-20)


### Bug Fixes

* Fix assets bundling ([37c1f7c](https://github.com/diplodoc-platform/cli/commit/37c1f7c8c392fcb9d14553512adaf205aca382dc))

## [4.39.0](https://github.com/diplodoc-platform/cli/compare/v4.38.0...v4.39.0) (2024-10-18)


### Features

* Add language specific scoring ([ca4c349](https://github.com/diplodoc-platform/cli/commit/ca4c349c445f76b23930ebda7a0b3abbe20871b1))
* Implement local search adapter ([3766714](https://github.com/diplodoc-platform/cli/commit/376671495dd68dfa73650742ca30c3ebacd326bc))
* Update client to major 3 version ([be7ad13](https://github.com/diplodoc-platform/cli/commit/be7ad1387ebf3ea00c23111c072b74f64806dab4))


### Bug Fixes

* Do not enable search on search=false ([b647f0b](https://github.com/diplodoc-platform/cli/commit/b647f0b9ef0b25b2b5c070ebeba72941fc243672))
* Fix depth computation on windows ([d0c708d](https://github.com/diplodoc-platform/cli/commit/d0c708df494e87dbb9e9e1fc5b746117de9f4395))
* Fix search loading on file protocol ([6b8c2b5](https://github.com/diplodoc-platform/cli/commit/6b8c2b515257099a7fe2f6418442d4dd7f923aaf))
* Fix search loading on simple docs (without langs) ([4c11edc](https://github.com/diplodoc-platform/cli/commit/4c11edcfedfd3832766f5e1e66c5dccc568981aa))
* Fix typescript bundler mode ([c74fd8d](https://github.com/diplodoc-platform/cli/commit/c74fd8d258f0c883ccddf23880a5a2b2cae7336f))
* Move page generators to page folder ([6cae881](https://github.com/diplodoc-platform/cli/commit/6cae881fb723bf7057b074a03e9b2ad963d9b96b))
* Remove langs dependency from assets ([fd5294d](https://github.com/diplodoc-platform/cli/commit/fd5294d617956c2102ca0f1cd586f5ca3bf56483))
* Simplify search configuration ([8fb62ba](https://github.com/diplodoc-platform/cli/commit/8fb62bae5183d5b80db2915a03789b73ef195d5f))

## [4.38.0](https://github.com/diplodoc-platform/cli/compare/v4.37.0...v4.38.0) (2024-10-10)


### Features

* support deprecated in openapi ([7ae588d](https://github.com/diplodoc-platform/cli/commit/7ae588da487e3b02c47b2bc99fba6eee600522c1))

## [4.37.0](https://github.com/diplodoc-platform/cli/compare/v4.36.5...v4.37.0) (2024-10-01)


### Features

* bump transform to 4.32.2, use transform metadata utilities ([a21fc3e](https://github.com/diplodoc-platform/cli/commit/a21fc3ef34134753c3e32edbbbd2e6f3ade45bb4))

## [4.36.5](https://github.com/diplodoc-platform/cli/compare/v4.36.4...v4.36.5) (2024-09-26)


### Bug Fixes

* **deps:** bump openapi-extension to 2.3.4 ([59bc288](https://github.com/diplodoc-platform/cli/commit/59bc288fdc6ad4d52b26013ee213f8f1fbb0e2fc))

## [4.36.4](https://github.com/diplodoc-platform/cli/compare/v4.36.3...v4.36.4) (2024-09-20)


### Bug Fixes

* bump transform plugin ([906362c](https://github.com/diplodoc-platform/cli/commit/906362ccc33121a61b6c0e8cb65df385870dfaf8))
* update @diplodoc/client@2.8.2 ([#837](https://github.com/diplodoc-platform/cli/issues/837)) ([cd14826](https://github.com/diplodoc-platform/cli/commit/cd148269fde3adc23cb9158ab7af1408de724ed1))

## [4.36.3](https://github.com/diplodoc-platform/cli/compare/v4.36.2...v4.36.3) (2024-09-18)


### Bug Fixes

* re-enable `forceQuotes` while also fixing `systemVars` behaviour ([2c4a8b3](https://github.com/diplodoc-platform/cli/commit/2c4a8b30e3d0b79def437a373d56752e00669ed4))
* unconstrain line width when dumping metadata to yaml ([d936302](https://github.com/diplodoc-platform/cli/commit/d936302b49f3b3608b69899596571be8386eca01))

## [4.36.2](https://github.com/diplodoc-platform/cli/compare/v4.36.1...v4.36.2) (2024-09-17)


### Bug Fixes

* add useLegacyConditions option, disable forceQuotes in yaml ([#829](https://github.com/diplodoc-platform/cli/issues/829)) ([a0e77b4](https://github.com/diplodoc-platform/cli/commit/a0e77b4c04fad1dcdd1dd6eaa8a8c0fbb8a2d4a1))

## [4.36.1](https://github.com/diplodoc-platform/cli/compare/v4.36.0...v4.36.1) (2024-09-17)


### Bug Fixes

* bump openapi-extension ([#830](https://github.com/diplodoc-platform/cli/issues/830)) ([aac7b54](https://github.com/diplodoc-platform/cli/commit/aac7b54a752eea34c3f0aa697b752d52bce8afac))

## [4.36.0](https://github.com/diplodoc-platform/cli/compare/v4.35.3...v4.36.0) (2024-09-17)


### Features

* add included option ([#828](https://github.com/diplodoc-platform/cli/issues/828)) ([c00ee30](https://github.com/diplodoc-platform/cli/commit/c00ee30a56248bb00518dc7ecd8e99edd6dcfe58))
* bump transform version ([ca73c1c](https://github.com/diplodoc-platform/cli/commit/ca73c1c325267a6ff12fe0948789a71928e7f5d3))


### Bug Fixes

* upload logs ([9ad49e8](https://github.com/diplodoc-platform/cli/commit/9ad49e878b02cb742dccd8129ee19294d9e35253))

## [4.35.3](https://github.com/diplodoc-platform/cli/compare/v4.35.2...v4.35.3) (2024-09-02)


### Bug Fixes

* add metadata compatibility with empty string substitutions ([5d9de26](https://github.com/diplodoc-platform/cli/commit/5d9de26f0b15b0ce1f1e8535ea935d521a648217))
* tests ([6a14ebe](https://github.com/diplodoc-platform/cli/commit/6a14ebec1727afbaf915b5b9c18c7e39a060a2d0))

## [4.35.2](https://github.com/diplodoc-platform/cli/compare/v4.35.1...v4.35.2) (2024-09-02)


### Bug Fixes

* Update translation ([02c02f4](https://github.com/diplodoc-platform/cli/commit/02c02f47077a03956d3ea8d88ce9d7c95d003bdb))

## [4.35.1](https://github.com/diplodoc-platform/cli/compare/v4.35.0...v4.35.1) (2024-08-14)


### Bug Fixes

* Update translation ([3e289cc](https://github.com/diplodoc-platform/cli/commit/3e289cc578991f9df866980cfd99192dee10549b))

## [4.35.0](https://github.com/diplodoc-platform/cli/compare/v4.34.3...v4.35.0) (2024-07-31)


### Features

* add analytics config ([#812](https://github.com/diplodoc-platform/cli/issues/812)) ([17d874e](https://github.com/diplodoc-platform/cli/commit/17d874e7be519e289e3d7b791fd6cac4afe1105a))

## [4.34.3](https://github.com/diplodoc-platform/cli/compare/v4.34.2...v4.34.3) (2024-07-18)


### Bug Fixes

* retry parsing existing metadata with duplicate key compatibility ([d1eff78](https://github.com/diplodoc-platform/cli/commit/d1eff78c0210765933b76ee1cf173966bcdc658a))

## [4.34.2](https://github.com/diplodoc-platform/cli/compare/v4.34.1...v4.34.2) (2024-07-15)


### Bug Fixes

* preserve existing `vcsPath` when enriching a file with front matter ([58de41e](https://github.com/diplodoc-platform/cli/commit/58de41efb04834d06daec3fa517ab2f241608b87))

## [4.34.1](https://github.com/diplodoc-platform/cli/compare/v4.34.0...v4.34.1) (2024-07-15)


### Bug Fixes

* **deps:** Update translation dep ([ecaeabc](https://github.com/diplodoc-platform/cli/commit/ecaeabc31a48b16d38c3cd958feb2b5887f2222a))

## [4.34.0](https://github.com/diplodoc-platform/cli/compare/v4.33.1...v4.34.0) (2024-07-12)


### Features

* Use different escaping strategy for Liquid-style substitutions in YAML format front matter ([#804](https://github.com/diplodoc-platform/cli/issues/804)) ([1115459](https://github.com/diplodoc-platform/cli/commit/1115459b5a31522f222d71ec46a77bb182cda94d))

## [4.33.1](https://github.com/diplodoc-platform/cli/compare/v4.33.0...v4.33.1) (2024-07-11)


### Bug Fixes

* Revert "feat: implement an option to always provide `vcsPath` in metadata for md-&gt;md transformations (sans tests)" ([a3455a5](https://github.com/diplodoc-platform/cli/commit/a3455a53b4aefb7c06676078a572fbdc4e2db701))

## [4.33.0](https://github.com/diplodoc-platform/cli/compare/v4.32.3...v4.33.0) (2024-07-11)


### Features

* add label ([b0f9c29](https://github.com/diplodoc-platform/cli/commit/b0f9c291d1a6782cc0dbe05a56612ea1786c5bdc))
* implement an option to always provide `vcsPath` in metadata for md-&gt;md transformations (sans tests) ([ad1b879](https://github.com/diplodoc-platform/cli/commit/ad1b8798f67c803d67545152ba06f1981f1a5215))
* resolve `vcsPath` correctly when `sourcePath` was supplied beforehand, refactor metadata generation procedures ([568f43b](https://github.com/diplodoc-platform/cli/commit/568f43b10ac3c744ba4b0cdadf4f5041f1fb1dff))


### Bug Fixes

* **deps:** Update openapi ([8e1f74e](https://github.com/diplodoc-platform/cli/commit/8e1f74ef056428b60f137aee7358e524dc7fafff))

## [4.32.3](https://github.com/diplodoc-platform/cli/compare/v4.32.2...v4.32.3) (2024-07-09)


### Bug Fixes

* **deps:** Update translation package ([63ae711](https://github.com/diplodoc-platform/cli/commit/63ae711d14dfc2a513280849ac1c756e405ac480))

## [4.32.2](https://github.com/diplodoc-platform/cli/compare/v4.32.1...v4.32.2) (2024-06-24)


### Bug Fixes

* Add defaul output for translation compose command ([bdec089](https://github.com/diplodoc-platform/cli/commit/bdec0898f36d6d17ce30996fce7da01e9e91be11))
* Improve translation logging ([34f6bb7](https://github.com/diplodoc-platform/cli/commit/34f6bb7f308af169cef06e65de37e3405a2ca120))
* Log empty files on translation ([35cea29](https://github.com/diplodoc-platform/cli/commit/35cea29160b5af4f9c445b2cbf0db41d2288910f))
* Update translation dep ([b20ae0d](https://github.com/diplodoc-platform/cli/commit/b20ae0dcc39863e6e4194308709a2a93865820c2))
* Update translation dep ([5544251](https://github.com/diplodoc-platform/cli/commit/5544251c66b43c3f8880e7ecd34c0cf306f6c931))

## [4.32.1](https://github.com/diplodoc-platform/cli/compare/v4.32.0...v4.32.1) (2024-06-17)


### Bug Fixes

* **table:** update transform version to fix includes inside tables ([24ef64b](https://github.com/diplodoc-platform/cli/commit/24ef64be57b41f167d6de5baaaf812a09d34c2c0))

## [4.32.0](https://github.com/diplodoc-platform/cli/compare/v4.31.0...v4.32.0) (2024-06-14)


### Features

* update transform version ([#787](https://github.com/diplodoc-platform/cli/issues/787)) ([4df3cb8](https://github.com/diplodoc-platform/cli/commit/4df3cb82c0984178f48c6309e5567c4da1177df8))

## [4.31.0](https://github.com/diplodoc-platform/cli/compare/v4.30.0...v4.31.0) (2024-06-06)


### Features

* add version log ([3fefc16](https://github.com/diplodoc-platform/cli/commit/3fefc16c9bb275ed2819a2edd2f59d7313aa6007))

## [4.30.0](https://github.com/diplodoc-platform/cli/compare/v4.29.0...v4.30.0) (2024-06-05)


### Features

* liquid navigation field in toc.yaml ([75ab883](https://github.com/diplodoc-platform/cli/commit/75ab8838dab07cf3d008f1a9d2a300dd1258e76b))

## [4.29.0](https://github.com/diplodoc-platform/cli/compare/v4.28.2...v4.29.0) (2024-05-31)


### Features

* Add content filtering ([ce2d387](https://github.com/diplodoc-platform/cli/commit/ce2d38748db09e9996d06d2148357a91f4e304ab))

## [4.28.2](https://github.com/diplodoc-platform/cli/compare/v4.28.1...v4.28.2) (2024-05-29)


### Bug Fixes

* Update transform version ([89f034f](https://github.com/diplodoc-platform/cli/commit/89f034fc9e1dd4f6a89168971f392400b62a0787))

## [4.28.1](https://github.com/diplodoc-platform/cli/compare/v4.28.0...v4.28.1) (2024-05-28)


### Bug Fixes

* Update transform version ([0684f2f](https://github.com/diplodoc-platform/cli/commit/0684f2f4ec9a69d4caaa91af8d22150145857a94))

## [4.28.0](https://github.com/diplodoc-platform/cli/compare/v4.27.0...v4.28.0) (2024-05-20)


### Features

* **transform:** bump to version v4.17.0 ([4453e50](https://github.com/diplodoc-platform/cli/commit/4453e5011e4d87a931d1f5ff0f7b0c7bae431d3d))

## [4.27.0](https://github.com/diplodoc-platform/cli/compare/v4.26.0...v4.27.0) (2024-05-17)


### Features

* **openapi:** bump version to 2.2.0 ([0fe088b](https://github.com/diplodoc-platform/cli/commit/0fe088bd54d9d6d3c7fcf691a55fd6ea566894f3))

## [4.26.0](https://github.com/diplodoc-platform/cli/compare/v4.25.1...v4.26.0) (2024-05-17)


### Features

* new logic, changes stay ([176ba71](https://github.com/diplodoc-platform/cli/commit/176ba71a5346099bd0e2d387e66f43a7d432f839))


### Bug Fixes

* add support for sub toc files ([bfc23e3](https://github.com/diplodoc-platform/cli/commit/bfc23e3d58b3550201fd5686e0f0c22d3f66f538))

## [4.25.1](https://github.com/diplodoc-platform/cli/compare/v4.25.0...v4.25.1) (2024-05-15)


### Bug Fixes

* correct root files for generic includer graph ([a8c8d79](https://github.com/diplodoc-platform/cli/commit/a8c8d7965e862ee5715c7e3428255169e4b24f5a))

## [4.25.0](https://github.com/diplodoc-platform/cli/compare/v4.24.1...v4.25.0) (2024-05-08)


### Features

* add default public path ([1a252da](https://github.com/diplodoc-platform/cli/commit/1a252da0c672fe7d58cddefb91f735b6208e24a5))

## [4.24.1](https://github.com/diplodoc-platform/cli/compare/v4.24.0...v4.24.1) (2024-05-07)


### Bug Fixes

* disable new markdownlint rules ([87db6c5](https://github.com/diplodoc-platform/cli/commit/87db6c5eafa1c0f23d04d1d1e01fd44a08f5a3d8))

## [4.24.0](https://github.com/diplodoc-platform/cli/compare/v4.23.1...v4.24.0) (2024-05-03)


### Features

* add language default from langs & redirect path check to exist ([bc5d971](https://github.com/diplodoc-platform/cli/commit/bc5d9711b71c65aaf0233cc5f61b1a76b6ed5af8))
* add relative path resolution for links ([9939666](https://github.com/diplodoc-platform/cli/commit/993966612fc2ab1cfaf423270987d48cd1dbc53d))
* group changelogs by tocs ([de4d9bc](https://github.com/diplodoc-platform/cli/commit/de4d9bca920cf949111a94bca8e03146971eed81))
* update package.lok file ([c648c72](https://github.com/diplodoc-platform/cli/commit/c648c727d687160d49f51ce49709480226af0667))
* update transform version ([ef9e5d3](https://github.com/diplodoc-platform/cli/commit/ef9e5d38b6a3b9c31bf1405bd6e4985f957c0b6b))

## [4.23.1](https://github.com/diplodoc-platform/cli/compare/v4.23.0...v4.23.1) (2024-04-23)


### Bug Fixes

* Update client ([0d74025](https://github.com/diplodoc-platform/cli/commit/0d74025b18bb735aba1afdd87832855d1539b825))

## [4.23.0](https://github.com/diplodoc-platform/cli/compare/v4.22.1...v4.23.0) (2024-04-23)


### Features

* add lang base url for non-lang mode ([2612594](https://github.com/diplodoc-platform/cli/commit/26125947b82debe10262349d945298954ac447a6))
* add language control selector for static build ([77d9b34](https://github.com/diplodoc-platform/cli/commit/77d9b34c5c6abc03926f8661ac82575f9973a009))
* add static local serve mode for langs ([9f9e117](https://github.com/diplodoc-platform/cli/commit/9f9e1175283f619af725aacbf1b4dee189494592))
* implement base path ([dd0cdf2](https://github.com/diplodoc-platform/cli/commit/dd0cdf27cd1dcb66b629882bb8098c28560be6d1))
* use base uri path ([3e19c4a](https://github.com/diplodoc-platform/cli/commit/3e19c4a7af685788b3c411eaf1903d29d9b95bc0))


### Bug Fixes

* Fix base tag target ([4c6b6dc](https://github.com/diplodoc-platform/cli/commit/4c6b6dc6394d05ce7b53648ad2a9de05efa1b09d))
* remove meta fixRelativePath ([d7fbe36](https://github.com/diplodoc-platform/cli/commit/d7fbe36639fef32d09ee4096800e8e4568bba878))
* update test snapshots ([a22e516](https://github.com/diplodoc-platform/cli/commit/a22e5168a31109314a450fa210fc1d4aa3bdd439))
* upgrade getAssetsPublicPath ([9200f11](https://github.com/diplodoc-platform/cli/commit/9200f11c1df729339beb4ecf1f1d363a50eac6ea))

## [4.22.1](https://github.com/diplodoc-platform/cli/compare/v4.22.0...v4.22.1) (2024-04-22)


### Bug Fixes

* node 18.14 don't support module.require.main ([#744](https://github.com/diplodoc-platform/cli/issues/744)) ([85ba262](https://github.com/diplodoc-platform/cli/commit/85ba262897a7d79aa0efa4e160597fb6adb276eb))

## [4.22.0](https://github.com/diplodoc-platform/cli/compare/v4.21.0...v4.22.0) (2024-04-15)


### Features

* Rewrite publish and translate commands on extension api ([7a2e3fc](https://github.com/diplodoc-platform/cli/commit/7a2e3fc7bea20ade2d43b887b8b42fe79cd70974))
* transform yfm in pc ([#740](https://github.com/diplodoc-platform/cli/issues/740)) ([7fc7a01](https://github.com/diplodoc-platform/cli/commit/7fc7a010f9f2758a6492f884dbe85c53e98d9b43))

## [4.21.0](https://github.com/diplodoc-platform/cli/compare/v4.20.0...v4.21.0) (2024-04-10)


### Features

* generate html links for PC pages in md2html ([#734](https://github.com/diplodoc-platform/cli/issues/734)) ([91b2a37](https://github.com/diplodoc-platform/cli/commit/91b2a374bca216947b6dd28a96dd4d33f4452c00))
* update @diplodoc/client@2.5.0 ([#737](https://github.com/diplodoc-platform/cli/issues/737)) ([55a4c7c](https://github.com/diplodoc-platform/cli/commit/55a4c7ce8d950400eff037f01c2c7d1841a8c38b))

## [4.20.0](https://github.com/diplodoc-platform/cli/compare/v4.19.3...v4.20.0) (2024-04-09)


### Features

* add changelogs ([38733c8](https://github.com/diplodoc-platform/cli/commit/38733c87365693c5324aaec02527fccae29e9b06))
* bump transform version ([1c2b8f5](https://github.com/diplodoc-platform/cli/commit/1c2b8f51014802bd2d9224bfe4d32b7e23b35adb))

## [4.19.3](https://github.com/diplodoc-platform/cli/compare/v4.19.2...v4.19.3) (2024-04-02)


### Bug Fixes

* copy assets by root path ([#719](https://github.com/diplodoc-platform/cli/issues/719)) ([7104343](https://github.com/diplodoc-platform/cli/commit/710434395bb60dcd6d2b8fab563a1d2d859b68c2))

## [4.19.2](https://github.com/diplodoc-platform/cli/compare/v4.19.1...v4.19.2) (2024-04-02)


### Bug Fixes

* process only yaml files in toc ([#717](https://github.com/diplodoc-platform/cli/issues/717)) ([0869419](https://github.com/diplodoc-platform/cli/commit/08694197a60256f9b81087ace6f3e0a3d5f5d989))

## [4.19.1](https://github.com/diplodoc-platform/cli/compare/v4.19.0...v4.19.1) (2024-04-02)


### Bug Fixes

* Try to fix binary build ([abe6f60](https://github.com/diplodoc-platform/cli/commit/abe6f607f57a6520a06a70794b7c330903b69a12))

## [4.19.0](https://github.com/diplodoc-platform/cli/compare/v4.18.0...v4.19.0) (2024-04-01)


### Features

* add redirect url for non-lang mode ([8c40c77](https://github.com/diplodoc-platform/cli/commit/8c40c777626bf361bfbf5fa1332180ada64827ec))
* add redirect url for non-lang mode & update tests ([ee9b968](https://github.com/diplodoc-platform/cli/commit/ee9b968ba61fa61137f773c15884c277770947c5))
* add static redirect page ([f0a9a8d](https://github.com/diplodoc-platform/cli/commit/f0a9a8dd224dbece649a2fa11fbbbd24f5f885b2))
* copy yaml assets ([#707](https://github.com/diplodoc-platform/cli/issues/707)) ([0d3293c](https://github.com/diplodoc-platform/cli/commit/0d3293c5d3936fb7fdeb065a3becb6292542df73))
* update @diplodoc/client@2.4.0 ([#713](https://github.com/diplodoc-platform/cli/issues/713)) ([b69e50b](https://github.com/diplodoc-platform/cli/commit/b69e50b709c4e8fbf951c6783bb4273ee25b98e7))


### Bug Fixes

* lint ([286fb30](https://github.com/diplodoc-platform/cli/commit/286fb30ff1580fc541517398e7bf4076a71448c7))

## [4.18.0](https://github.com/diplodoc-platform/cli/compare/v4.17.1...v4.18.0) (2024-03-26)


### Features

* lint YAML files ([#699](https://github.com/diplodoc-platform/cli/issues/699)) ([5b28f97](https://github.com/diplodoc-platform/cli/commit/5b28f97abb2ac40d2fe7cb9e9acc8ec0a6d105c2))

## [4.17.1](https://github.com/diplodoc-platform/cli/compare/v4.17.0...v4.17.1) (2024-03-25)


### Bug Fixes

* **translation:** Fix schemas resolution ([6228d3b](https://github.com/diplodoc-platform/cli/commit/6228d3b27e5d652924a5921b37c700f02af419e7))

## [4.17.0](https://github.com/diplodoc-platform/cli/compare/v4.16.1...v4.17.0) (2024-03-25)


### Features

* toc label syntax ([45e118f](https://github.com/diplodoc-platform/cli/commit/45e118f28079913887710423da4195b21bcd47c5))


### Bug Fixes

* Add translate fields ([7b0b48d](https://github.com/diplodoc-platform/cli/commit/7b0b48dc6859ad7a6cbcaa247e8c5ce7a6dd0835))
* Fix translation schemas resolution ([c9c5436](https://github.com/diplodoc-platform/cli/commit/c9c54366412ed89f6c373dda6d0c3cbc807f16d1))

## [4.16.1](https://github.com/diplodoc-platform/cli/compare/v4.16.0...v4.16.1) (2024-03-22)


### Bug Fixes

* Add missed json schemas to npm package ([3db3863](https://github.com/diplodoc-platform/cli/commit/3db38632a3ffcf4d43854374487203088b729da5))

## [4.16.0](https://github.com/diplodoc-platform/cli/compare/v4.15.1...v4.16.0) (2024-03-21)


### Features

* **translation:** Add schemas for toc/leading/presets ([6a25caf](https://github.com/diplodoc-platform/cli/commit/6a25cafc0774cdae464dbcf21143bcb81dc8e9ec))

## [4.15.1](https://github.com/diplodoc-platform/cli/compare/v4.15.0...v4.15.1) (2024-03-11)


### Bug Fixes

* Update translation dep ([c41878d](https://github.com/diplodoc-platform/cli/commit/c41878d125681f3634a46098010b727394bec227))

## [4.15.0](https://github.com/diplodoc-platform/cli/compare/v4.14.0...v4.15.0) (2024-03-06)


### Features

* **openapi:** bump version ([e2c06e6](https://github.com/diplodoc-platform/cli/commit/e2c06e62b322eed487445c138ab0888d17248685))

## [4.14.0](https://github.com/diplodoc-platform/cli/compare/v4.13.8...v4.14.0) (2024-03-05)


### Features

* add test for rtl ([27acab1](https://github.com/diplodoc-platform/cli/commit/27acab13b89a1d250c9b5d0608350cc1da5d10ac))
* Rearrange dev and prod deps for optimal bimary (pkg) build ([015aec7](https://github.com/diplodoc-platform/cli/commit/015aec7fa782e19fd53191e36300a87675d0cb26))
* **rtl:** filter assets based on rtl langs ([e3e0537](https://github.com/diplodoc-platform/cli/commit/e3e0537603b75775858dc952caf4fee94043f4cc))
* **rtl:** html tag direction ([f4ee1b0](https://github.com/diplodoc-platform/cli/commit/f4ee1b0f3436b037ad60b4b6d344aa731a69f1ac))
* update deps % openapi ([cb4e7d3](https://github.com/diplodoc-platform/cli/commit/cb4e7d32db663e2f82276a4ddb9e5c3f108ed35c))


### Bug Fixes

* Fix translation error handleng ([48e9528](https://github.com/diplodoc-platform/cli/commit/48e9528f3118c7203e556b970ecbb923b96aacf9))
* Fix translation limits handling ([193dbe9](https://github.com/diplodoc-platform/cli/commit/193dbe917e4b469c6b88e0d764f709d693594a07))
* pass correct current lang ([6a7b357](https://github.com/diplodoc-platform/cli/commit/6a7b3577e2dd3cc89668e81b6a23c34fca951513))
* toc may not have lang ([ba8ecc7](https://github.com/diplodoc-platform/cli/commit/ba8ecc714d2d63dc0816feab9c556f13fc017022))
* Update client ([008ed60](https://github.com/diplodoc-platform/cli/commit/008ed6089163c8ee9c431e2dea0dc9b4cb602886))

## [4.13.8](https://github.com/diplodoc-platform/cli/compare/v4.13.7...v4.13.8) (2024-02-27)


### Bug Fixes

* Fix translation auth ([036cca8](https://github.com/diplodoc-platform/cli/commit/036cca80fd571fc6bfb0ffa06ec590880fc84b13))

## [4.13.7](https://github.com/diplodoc-platform/cli/compare/v4.13.6...v4.13.7) (2024-02-27)


### Bug Fixes

* Migrate from markdown-translation to translation ([be844ca](https://github.com/diplodoc-platform/cli/commit/be844ca9f67e1e072db74614a0f36efaf124af02))

## [4.13.6](https://github.com/diplodoc-platform/cli/compare/v4.13.5...v4.13.6) (2024-02-12)


### Bug Fixes

* bump latex extension ([bb6be65](https://github.com/diplodoc-platform/cli/commit/bb6be65ed02b96c37803e3d934bd3fb7af92632a))

## [4.13.5](https://github.com/diplodoc-platform/cli/compare/v4.13.4...v4.13.5) (2024-02-09)


### Bug Fixes

* rewriten xliff api ([cc00fb5](https://github.com/diplodoc-platform/cli/commit/cc00fb5f209c029b4df2fc88cdca4cd50659e538))
* Update deps (client, translation) ([0d6df6f](https://github.com/diplodoc-platform/cli/commit/0d6df6fb635008e2e6c71d0a2da58107bbc0a2c1))

## [4.13.4](https://github.com/diplodoc-platform/cli/compare/v4.13.3...v4.13.4) (2024-02-08)


### Bug Fixes

* Update client ([6ec8ad1](https://github.com/diplodoc-platform/cli/commit/6ec8ad1d065a42b57bf28fb2b71d80f424e4c267))

## [4.13.3](https://github.com/diplodoc-platform/cli/compare/v4.13.2...v4.13.3) (2024-02-07)


### Bug Fixes

* Update translation ([c659b63](https://github.com/diplodoc-platform/cli/commit/c659b6322a6f299afed921dda5c90293b3d8bbd8))

## [4.13.2](https://github.com/diplodoc-platform/cli/compare/v4.13.1...v4.13.2) (2024-02-06)


### Bug Fixes

* Fix notes interaction ([cbf354b](https://github.com/diplodoc-platform/cli/commit/cbf354b281b6bf846c0aa3a4206fd8323168f5e5))

## [4.13.1](https://github.com/diplodoc-platform/cli/compare/v4.13.0...v4.13.1) (2024-02-06)


### Bug Fixes

* null filter ([f78e64a](https://github.com/diplodoc-platform/cli/commit/f78e64ac205b1f5269badc21d257bec719036bfb))

## [4.13.0](https://github.com/diplodoc-platform/cli/compare/v4.12.1...v4.13.0) (2024-02-06)


### Features

* bump openapi version ([a361cfb](https://github.com/diplodoc-platform/cli/commit/a361cfb9f07c58278fe21342ed7f24472ccd9c6d))

## [4.12.1](https://github.com/diplodoc-platform/cli/compare/v4.12.0...v4.12.1) (2024-02-01)


### Bug Fixes

* fix plugins runtime in client ([dac2ab7](https://github.com/diplodoc-platform/cli/commit/dac2ab757e03b3fe37ac5f42e3a6f46a6a33d35e))

## [4.12.0](https://github.com/diplodoc-platform/cli/compare/v4.11.0...v4.12.0) (2024-01-30)


### Features

* **cmd:** add need-to-sanitize-html flag ([22957d8](https://github.com/diplodoc-platform/cli/commit/22957d8365f9ee8ab3442a6fdaa05a16d8f071cf))
* **cli:** support custom metadata in presets.yaml / inline ([7be29c1](https://github.com/diplodoc-platform/cli/commit/7be29c11be2a555aa68fc7d290a912a05cbcc4a0))

### Bug Fixes

* tests ([5073b66](https://github.com/diplodoc-platform/cli/commit/5073b662f4a8f74a22c1c1efce9f044eb96f6949))
* update openapi-extension ([455613e](https://github.com/diplodoc-platform/cli/commit/455613eaf89ca56904aaf93f84ea36cfbbacacc6))

## [4.11.0](https://github.com/diplodoc-platform/cli/compare/v4.10.1...v4.11.0) (2024-01-25)


### Features

* **cmd/xliff:** update markdown-translation ([d7b1777](https://github.com/diplodoc-platform/cli/commit/d7b177775840d69cb02e3859bfb82a57ffee72c2))

## [4.10.1](https://github.com/diplodoc-platform/cli/compare/v4.10.0...v4.10.1) (2024-01-23)


### Bug Fixes

* Remove dummy html line breaks cleanup ([0fb3ead](https://github.com/diplodoc-platform/cli/commit/0fb3ead2b50b8eb994a2b53e0794fb8edeb90656)), closes [#641](https://github.com/diplodoc-platform/cli/issues/641)

## [4.10.0](https://github.com/diplodoc-platform/cli/compare/v4.9.0...v4.10.0) (2024-01-19)


### Features

* update transform ([84ef5b3](https://github.com/diplodoc-platform/cli/commit/84ef5b3a9301aae2164328484ec09b1f708f4317))


### Bug Fixes

* ignore tmp folder in uploading ([#643](https://github.com/diplodoc-platform/cli/issues/643)) ([caca466](https://github.com/diplodoc-platform/cli/commit/caca4667a6bf041045c04d97236bbe942ab97eb2))

## [4.9.0](https://github.com/diplodoc-platform/cli/compare/v4.8.0...v4.9.0) (2024-01-09)


### Features

* Add updatedAt field in metadata ([#628](https://github.com/diplodoc-platform/cli/issues/628)) ([63f6f5e](https://github.com/diplodoc-platform/cli/commit/63f6f5e1300e4a233e1c547860252562b1fe9772))


### Bug Fixes

* Update latex extension ([0cd0a5d](https://github.com/diplodoc-platform/cli/commit/0cd0a5dded9b632be0b4a1c097ad0efaf8859d1c))

## [4.8.0](https://github.com/diplodoc-platform/cli/compare/v4.7.0...v4.8.0) (2023-12-28)


### Features

* Add Latex extension ([2426f5b](https://github.com/diplodoc-platform/cli/commit/2426f5b8978119ed3d617c33921dd0d83581fd6d))
* Update client to v2 ([0050e29](https://github.com/diplodoc-platform/cli/commit/0050e298562bd0f82429b8a27635f5b7d8cb6351))


### Bug Fixes

* Update transformer ([cb5f4c7](https://github.com/diplodoc-platform/cli/commit/cb5f4c769a447cfef35e0e96111401db36e79892))

## [4.7.0](https://github.com/diplodoc-platform/cli/compare/v4.6.5...v4.7.0) (2023-12-26)


### Features

* add block anchor plugin to transform ([26b5841](https://github.com/diplodoc-platform/cli/commit/26b584122894574a312ebe4631ac1dfe474285a0))


### Bug Fixes

* **cmd/xliff:** bump markdown-translation version ([2564a58](https://github.com/diplodoc-platform/cli/commit/2564a582e4d4bd2bbdc3bbf3fc9c463bc8448fd3))

## [4.6.5](https://github.com/diplodoc-platform/cli/compare/v4.6.4...v4.6.5) (2023-12-22)


### Bug Fixes

* Limit translated chunk size ([00d8852](https://github.com/diplodoc-platform/cli/commit/00d88528487f48663406f58964d3563ddfd4e1fe))
* Update core deps. Remove unused deps. ([f9cdb38](https://github.com/diplodoc-platform/cli/commit/f9cdb389cc8dbd984b4336b1fd058a8b39dd0bef))

## [4.6.4](https://github.com/diplodoc-platform/cli/compare/v4.6.3...v4.6.4) (2023-12-13)


### Bug Fixes

* **cmd/xliff:** update markdown-translation version ([8d19309](https://github.com/diplodoc-platform/cli/commit/8d19309586b3b3805846ff2e3671e4d0cef6dc3f))

## [4.6.3](https://github.com/diplodoc-platform/cli/compare/v4.6.2...v4.6.3) (2023-11-27)


### Bug Fixes

* **cmd/xliff:** translations indexing ([3f67e33](https://github.com/diplodoc-platform/cli/commit/3f67e330c9d088e72072998830de3799a68ece10))

## [4.6.2](https://github.com/diplodoc-platform/cli/compare/v4.6.1...v4.6.2) (2023-11-27)


### Bug Fixes

* **openapi:** bump extension version to v1.4.4 ([f110eb3](https://github.com/diplodoc-platform/cli/commit/f110eb3c41dd74b2f015b28952194ec9e8bfe80a))

## [4.6.1](https://github.com/diplodoc-platform/cli/compare/v4.6.0...v4.6.1) (2023-11-24)


### Bug Fixes

* bump @diplodoc/openapi-extension version to v1.4.3 ([3fa633f](https://github.com/diplodoc-platform/cli/commit/3fa633fe0db08f2df35088004747da099420619e))

## [4.6.0](https://github.com/diplodoc-platform/cli/compare/v4.5.1...v4.6.0) (2023-11-24)


### Features

* **cmd/xliff:** markdown-translation major update 1.0.0 ([ccc46dc](https://github.com/diplodoc-platform/cli/commit/ccc46dcedb97dc5c8df3f157c5844d9c360e9cd6))

## [4.5.1](https://github.com/diplodoc-platform/cli/compare/v4.5.0...v4.5.1) (2023-11-22)


### Bug Fixes

* **github:** fix UND_ERR_CONNECT_TIMEOUT error ([#606](https://github.com/diplodoc-platform/cli/issues/606)) ([d196861](https://github.com/diplodoc-platform/cli/commit/d1968614cdf9010da3de3ee10d080ea99c20003a))

## [4.5.0](https://github.com/diplodoc-platform/cli/compare/v4.4.0...v4.5.0) (2023-11-21)


### Features

* **cmd/xliff:** inline code, inline html ([d631f8d](https://github.com/diplodoc-platform/cli/commit/d631f8d126a2a485cb7700388ea6cfcb70434c8c))

## [4.4.0](https://github.com/diplodoc-platform/cli/compare/v4.3.2...v4.4.0) (2023-11-20)


### Features

* **cmd/xliff:** newline separated segments ([f437710](https://github.com/diplodoc-platform/cli/commit/f4377103f37ca148081fc599d0a5853a8c56c77f))

## [4.3.2](https://github.com/diplodoc-platform/cli/compare/v4.3.1...v4.3.2) (2023-11-17)


### Bug Fixes

* **cmd/xliff:** inline segmentation variables, liquid ([a6cc17f](https://github.com/diplodoc-platform/cli/commit/a6cc17f7fc82285f3fd6854159d42ee8bfe4c194))

## [4.3.1](https://github.com/diplodoc-platform/cli/compare/v4.3.0...v4.3.1) (2023-11-16)


### Bug Fixes

* **cmd/xliff:** inline segmentation variables, liquid ([90cecb2](https://github.com/diplodoc-platform/cli/commit/90cecb2cf3f2bd2747d8073dfb1b5698df6a592c))

## [4.3.0](https://github.com/diplodoc-platform/cli/compare/v4.2.2...v4.3.0) (2023-11-15)


### Features

* **cmd/xliff:** inline segmentation variables, liquid ([ccb96db](https://github.com/diplodoc-platform/cli/commit/ccb96dbc7237c6cfa24faf6c49c519046c19dcba))

## [4.2.2](https://github.com/diplodoc-platform/cli/compare/v4.2.1...v4.2.2) (2023-10-30)


### Bug Fixes

* **copyFile:** With network storage shell.cp faster than copyFileSync ([b6a1a6b](https://github.com/diplodoc-platform/cli/commit/b6a1a6babfcf12bd3a38535481873154d2c919fd))
* **infra:** engines, overrides, bump deps ([961452c](https://github.com/diplodoc-platform/cli/commit/961452cb8977cada6ecbb51c6349e34ce5cfdf87))

## [4.2.1](https://github.com/diplodoc-platform/cli/compare/v4.2.0...v4.2.1) (2023-10-26)


### Bug Fixes

* linting errors ([ec72aeb](https://github.com/diplodoc-platform/cli/commit/ec72aebf011b9e64f70621fee6b1d6067459d01a))

## [4.2.0](https://github.com/diplodoc-platform/cli/compare/v4.1.0...v4.2.0) (2023-10-24)


### Features

* add linter, move to diplodoc packages ([a92704a](https://github.com/diplodoc-platform/cli/commit/a92704a18d699084a6722011fdade0e300854765))
* cleanup packages ([5155a46](https://github.com/diplodoc-platform/cli/commit/5155a461cc62f1d57922caf9fa51cb764a9d1ebc))
* **cmd/xliff:** experimental-inline-segmentation-beta-2 ([729fc37](https://github.com/diplodoc-platform/cli/commit/729fc37a69a2de76eb4c22a7d16c75cb45ef9b2c))
* configs ([ecc3c57](https://github.com/diplodoc-platform/cli/commit/ecc3c57367768455bb16ecf3ed77dd37f0a19ec8))


### Bug Fixes

* **deps:** deprecate yfm2xliff ([0852d6e](https://github.com/diplodoc-platform/cli/commit/0852d6ea9424d7a84dbe1a9c58376ae9e4a20fd6))
* install babel core ([b6a785b](https://github.com/diplodoc-platform/cli/commit/b6a785b33edbfd33a24fc08de502d90908dcb01b))

## [4.1.0](https://github.com/diplodoc-platform/cli/compare/v4.0.0...v4.1.0) (2023-10-04)


### Features

* **cmd/xliff:** improved inline segmentation beta ([539136f](https://github.com/diplodoc-platform/cli/commit/539136f3d7ee0f032424f91f286aa749aab0aca5))
* migrate to diplodoc ([9b79b32](https://github.com/diplodoc-platform/cli/commit/9b79b32596461c4c39af6dfc1036b004a6c56ef0))

## [4.0.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.25.0...v4.0.0)(2023-09-27)


### Features

* [@diplodoc/transform@4 major update](https://github.com/yandex-cloud/yfm-transform/commit/92d350168d9c7d6707df0473b1b6e614fe19f702) 

## [3.25.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.24.0...v3.25.0) (2023-09-15)


### Features

* update transform ([#556](https://github.com/yandex-cloud/yfm-docs/issues/556)) ([7696adf](https://github.com/yandex-cloud/yfm-docs/commit/7696adf879cfb73f68bd9481cd9260fdb4802630))

## [3.24.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.23.0...v3.24.0) (2023-09-04)


### Features

* optimize author obtaining ([#534](https://github.com/yandex-cloud/yfm-docs/issues/534)) ([b44ec30](https://github.com/yandex-cloud/yfm-docs/commit/b44ec3089011145b3f168e6c80ffdc6f34a87031))

## [3.23.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.22.0...v3.23.0) (2023-08-28)


### Features

* bump openapi version ([8fbf6e5](https://github.com/yandex-cloud/yfm-docs/commit/8fbf6e54f645532bff0c989f9f1748816876916d))

## [3.22.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.21.0...v3.22.0) (2023-08-21)


### Features

* bump openapi version ([cca7fa8](https://github.com/yandex-cloud/yfm-docs/commit/cca7fa8dc5864cd379269b7b2b836bc91cc3649d))

## [3.21.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.20.3...v3.21.0) (2023-08-17)


### Features

* add meta description into leading pages ([b8c19cd](https://github.com/yandex-cloud/yfm-docs/commit/b8c19cde6d1b80a14a372520ff114b4874f79af8))

## [3.20.3](https://github.com/yandex-cloud/yfm-docs/compare/v3.20.2...v3.20.3) (2023-08-15)


### Bug Fixes

* **cmd/xliff:** async batching ([5fc6bd2](https://github.com/yandex-cloud/yfm-docs/commit/5fc6bd2b8171170ebd70e44dbf461af951571fcd))
* **cmd/xliff:** update markdown-translation ([90bbe12](https://github.com/yandex-cloud/yfm-docs/commit/90bbe120adfe1a8a32f9c29dbfcb7cdf40d1ed1f))

## [3.20.2](https://github.com/yandex-cloud/yfm-docs/compare/v3.20.1...v3.20.2) (2023-08-14)


### Bug Fixes

* publishing doesn't work ([#533](https://github.com/yandex-cloud/yfm-docs/issues/533)) ([3cf4bc1](https://github.com/yandex-cloud/yfm-docs/commit/3cf4bc1002f8ff016bf6aea849b5a4df389b6aab))
* restore old aws-sdk client ([4d4b195](https://github.com/yandex-cloud/yfm-docs/commit/4d4b1955222214db4b84aaba5108a7d7f8aa3634))

## [3.20.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.20.0...v3.20.1) (2023-08-07)


### Bug Fixes

* **contributors:** Fix contributors, authors is experiment ([#523](https://github.com/yandex-cloud/yfm-docs/issues/523)) ([7f2e395](https://github.com/yandex-cloud/yfm-docs/commit/7f2e39575a188b750ddb46e02cd74d8ddcb55c77))

## [3.20.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.19.0...v3.20.0) (2023-07-24)


### Features

* change a log level if request to github failed because commit not found ([3f3af78](https://github.com/yandex-cloud/yfm-docs/commit/3f3af789d9e4e16b2992b2990e35f04890c3f2fc))


### Bug Fixes

* do not use ignore option on files copy ([8d1ca53](https://github.com/yandex-cloud/yfm-docs/commit/8d1ca53d8c600ae8c9386f95d6e78058d95d1422))
* remove unused parameter and update changelog.md ([cd058d4](https://github.com/yandex-cloud/yfm-docs/commit/cd058d41aa31ea572a7feb7b680d2c4f75bf7588))

## [3.19.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.18.0...v3.19.0) (2023-07-19)


### Features

* **cli:** Add publish command ([4181880](https://github.com/yandex-cloud/yfm-docs/commit/4181880b37017e9023a0095ab46bf96e341399c8))
* ignore contributors if an email includes a string from the --ignore-author-patterns parameter ([02a8f51](https://github.com/yandex-cloud/yfm-docs/commit/02a8f51dd536244c5af3be186b82337326f2c6e4))


### Bug Fixes

* bump openapi version ([bbaea6b](https://github.com/yandex-cloud/yfm-docs/commit/bbaea6b5cfafea3349c3923a32b8c624aff58ec7))
* bump openapi version ([f1a1df2](https://github.com/yandex-cloud/yfm-docs/commit/f1a1df2e4f0d9dca85de664695b3bc43f3bddf6c))

## [3.18.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.17.2...v3.18.0) (2023-07-14)


### Features

* **cmd/xliff:** multiline tables and video support ([dfd45dd](https://github.com/yandex-cloud/yfm-docs/commit/dfd45dd07e6318393c4d69ef36bb58e066d20a4c))
* **config:** Add `.yfmignore` file. Ignore node_modules in build ([9d1babc](https://github.com/yandex-cloud/yfm-docs/commit/9d1babcaffa4e06906cecb851f9f4fa697a8c1c9))

## [3.17.2](https://github.com/yandex-cloud/yfm-docs/compare/v3.17.1...v3.17.2) (2023-07-11)


### Bug Fixes

* **openapi:** bump version ([cbe3c98](https://github.com/yandex-cloud/yfm-docs/commit/cbe3c986374b8a616f80629c1f4ee2d0ed882130))

## [3.17.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.17.0...v3.17.1) (2023-07-07)


### Bug Fixes

* revert chore(deps): bump @doc-tools/transform from 3.2.0 to 3.3.0" ([0bc336c](https://github.com/yandex-cloud/yfm-docs/commit/0bc336cc81618b669ddd32fe87720c7322c98bd4))

## [3.17.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.16.3...v3.17.0) (2023-07-07)


### Features

* **cmd/xliff:** @diplodoc/tabs support ([b829110](https://github.com/yandex-cloud/yfm-docs/commit/b829110660babcc8c43e4971b653d6b64c4e4b70))


### Bug Fixes

* **authors:** async files processing ([e058239](https://github.com/yandex-cloud/yfm-docs/commit/e0582392a39fd9d5618a749f5340d364d86ea57e))

## [3.16.3](https://github.com/yandex-cloud/yfm-docs/compare/v3.16.2...v3.16.3) (2023-07-06)


### Bug Fixes

* **meta:** Incorrect meta rendering ([5b32fa0](https://github.com/yandex-cloud/yfm-docs/commit/5b32fa00e025f83dca6f35b0b5076bdeb7696149))

## [3.16.2](https://github.com/yandex-cloud/yfm-docs/compare/v3.16.1...v3.16.2) (2023-07-03)


### Bug Fixes

* **cmd/xliff:** parsing xliff target translations ([fe6ef10](https://github.com/yandex-cloud/yfm-docs/commit/fe6ef10cc4051951c1f285cf615ed55dd4cf2253))

## [3.16.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.16.0...v3.16.1) (2023-06-30)


### Bug Fixes

* fix missing build dir, cli works from any folder now. ([8eb97c2](https://github.com/yandex-cloud/yfm-docs/commit/8eb97c2e09532a0d35ee7abb1648dbd8a5fedfdb))

## [3.16.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.15.0...v3.16.0) (2023-06-29)


### Features

* **changelog:** Add extract changelogs ([#348](https://github.com/yandex-cloud/yfm-docs/issues/348)) ([a8d096d](https://github.com/yandex-cloud/yfm-docs/commit/a8d096d6a9ff95dd88eb147df064e13b6494c8c3))
* new client integration ([c1fb398](https://github.com/yandex-cloud/yfm-docs/commit/c1fb3985c8bf023ebe3c87d9d2df678e53271443))


### Bug Fixes

* add bundle path ([5109c6d](https://github.com/yandex-cloud/yfm-docs/commit/5109c6d7553ff5854065f6f3a78cd6478d72e5fe))
* copy after build finished ([75d6c58](https://github.com/yandex-cloud/yfm-docs/commit/75d6c58a14bff592ac0372439d00bd00fcfaa7bb))
* restore bundle path ([ffd29ba](https://github.com/yandex-cloud/yfm-docs/commit/ffd29bac3575a0ee873bb9360c1de5e6f59dda96))

## [3.15.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.14.0...v3.15.0) (2023-06-27)


### Features

* bump openapi version ([9a6d334](https://github.com/yandex-cloud/yfm-docs/commit/9a6d33421c86977977f48b8f2392690ceb2c41f2))

## [3.14.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.13.1...v3.14.0) (2023-06-27)


### Features

* **cmd/xliff:** diplodoc includes, strikethrough ([56613a9](https://github.com/yandex-cloud/yfm-docs/commit/56613a94153b1bc77e3690c3f2dafc968b17af52))


### Bug Fixes

* Add missed styles in static render mode ([fd7d094](https://github.com/yandex-cloud/yfm-docs/commit/fd7d094f98fc2ce8f69222be388269d1d1366dae))
* Fix pkg assets list ([8759847](https://github.com/yandex-cloud/yfm-docs/commit/87598471ba0106fc1497c5401fe129d318ba062e))
* Resolve generic includer paths relative to toc.yaml ([bc97e6e](https://github.com/yandex-cloud/yfm-docs/commit/bc97e6ee89426a2a1d9f57f9cc87608e9e9fd81d))

## [3.13.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.13.0...v3.13.1) (2023-06-23)


### Bug Fixes

* Bump openapi version ([fff14de](https://github.com/yandex-cloud/yfm-docs/commit/fff14de67e45db1cc8b13134e6e801eae0a6e5e7))
1. Fixed missing refs, types of parameters now renders.
2. Remove repeated tables.

## [3.13.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.12.0...v3.13.0) (2023-06-22)


### Features

* **cmd/xliff:** @diplodoc/links ref links {#T} ([8bdbeb5](https://github.com/yandex-cloud/yfm-docs/commit/8bdbeb50968cb228c3ee938f335c0e03ce4b937e))

## [3.12.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.11.1...v3.12.0) (2023-06-21)


### Features

* **cmd/xliff:** @diplodoc/file support ([7821b3e](https://github.com/yandex-cloud/yfm-docs/commit/7821b3e565fad713d38b2b592242b28e076e7379))

## [3.11.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.11.0...v3.11.1) (2023-06-21)


### Bug Fixes

* @doc-tools/transform up to 3.1.2 ([39e5273](https://github.com/yandex-cloud/yfm-docs/commit/39e52732f8ec4df107abc2ef7591cb2069373531))
* pass conditionsInCode to liquid when building with --output-format md ([e0ecd77](https://github.com/yandex-cloud/yfm-docs/commit/e0ecd7707edbdb4b183c92a7cd28a04ce0abba7d))

## [3.11.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.10.0...v3.11.0) (2023-06-21)


### Features

* **cmd/xliff:** @diplodoc/imsize support ([85a3dd6](https://github.com/yandex-cloud/yfm-docs/commit/85a3dd6b32e29986a8b72bb82003e4ff9f9a930a))

## [3.10.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.9.0...v3.10.0) (2023-06-20)


### Features

* **cmd/xliff:** @diplodoc/monospace support ([aa50f30](https://github.com/yandex-cloud/yfm-docs/commit/aa50f3059311632b204630cd2b37046141d510d2))

## [3.9.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.8.1...v3.9.0) (2023-06-19)


### Features

* **cmd/xliff:** @diplodoc/anchors syntax support ([ab1ecc1](https://github.com/yandex-cloud/yfm-docs/commit/ab1ecc1e9e54ba240a93cd3a4ed71fe10c1003e6))

## [3.8.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.8.0...v3.8.1) (2023-06-15)


### Bug Fixes

* update plugin ([f70ff35](https://github.com/yandex-cloud/yfm-docs/commit/f70ff3530d28ebf27498ef5c033d18eb2c213e53))

## [3.8.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.7.1...v3.8.0) (2023-06-14)


### Features

* **cmd/xliff:** @diplodoc/checkbox syntax support ([45a728f](https://github.com/yandex-cloud/yfm-docs/commit/45a728fc04575ca9ddbd1e85d085715c596a4073))

## [3.7.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.7.0...v3.7.1) (2023-06-13)


### Bug Fixes

* update openapi plugin ([5e88205](https://github.com/yandex-cloud/yfm-docs/commit/5e882054a05fac6fb82d569ad8d3edb5072c63d2))

## [3.7.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.6.0...v3.7.0) (2023-06-09)


### Features

* **cmd/xliff:** @diplodoc/sup syntax support ([58e4d67](https://github.com/yandex-cloud/yfm-docs/commit/58e4d6708656cc988cb326a84973657c2213a923))

## [3.6.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.5.1...v3.6.0) (2023-06-08)


### Features

* **authors:** collect authors from github ([3decd33](https://github.com/yandex-cloud/yfm-docs/commit/3decd3337b8223e3171e2687f09ea87b81718834))

## [3.5.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.5.0...v3.5.1) (2023-06-08)


### Bug Fixes

* Resolve diplodoc/client bundle ([9974113](https://github.com/yandex-cloud/yfm-docs/commit/99741136291837107ed6c20ef8e746a91642205c))

## [3.5.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.4.0...v3.5.0) (2023-06-08)


### Features

* Add static markup mode ([b3524c7](https://github.com/yandex-cloud/yfm-docs/commit/b3524c7b811f9dc7a3e1f66c49723cb116ffb0df))

## [3.4.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.3.0...v3.4.0) (2023-06-07)


### Features

* **cmd/xliff:** dipldodoc cuts, gfm tables ([00e6ec6](https://github.com/yandex-cloud/yfm-docs/commit/00e6ec6a9c031045f97de4aa33ac755d5322cbfa))

## [3.3.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.2.0...v3.3.0) (2023-06-06)


### Features

* remove openapi ([cac389f](https://github.com/yandex-cloud/yfm-docs/commit/cac389f55300f81376759ece0ca5911ac4874680))

## [3.2.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.1.2...v3.2.0) (2023-05-29)


### Features

* **cmd/xliff:** notes plugin support ([b339e90](https://github.com/yandex-cloud/yfm-docs/commit/b339e90c7280e73af165b55bd72dec3b1f551c5c))

## [3.1.2](https://github.com/yandex-cloud/yfm-docs/compare/v3.1.1...v3.1.2) (2023-05-23)


### Bug Fixes

* binary packaging ([36316dd](https://github.com/yandex-cloud/yfm-docs/commit/36316dd808026c9c5a9f0a1ff17406db17db0db2))

## [3.1.1](https://github.com/yandex-cloud/yfm-docs/compare/v3.1.0...v3.1.1) (2023-05-23)


### Bug Fixes

* **contributors:** skip nested file not found exception ([#346](https://github.com/yandex-cloud/yfm-docs/issues/346)) ([9abbdd7](https://github.com/yandex-cloud/yfm-docs/commit/9abbdd70e90a2574e9e699845847da8d85187393))
* fonts ([302ccf4](https://github.com/yandex-cloud/yfm-docs/commit/302ccf40cf6bdc5048db7724b773b3e68344bd29))

## [3.1.0](https://github.com/yandex-cloud/yfm-docs/compare/v3.0.0...v3.1.0) (2023-05-18)


### Features

* **cmd/xliff:** compose xliff and skeleton into markdown ([f9a4115](https://github.com/yandex-cloud/yfm-docs/commit/f9a4115f36da97f5f07cba8164749417c86a9738))
* **cmd/xliff:** extract xliff and skeleton ([603d990](https://github.com/yandex-cloud/yfm-docs/commit/603d99075fd1e70c0ae649ea523843d9fa61921b))

## [3.0.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.11.0...v3.0.0) (2023-05-12)


### ⚠ BREAKING CHANGES

* migrate to transform v3

### Bug Fixes

* **includers/unarchive:** throw away return value ([f1fa3ad](https://github.com/yandex-cloud/yfm-docs/commit/f1fa3ad3a11df657a30a7b9ec7aa4ae02f21c3a4))
* migrate to transform v3 ([0003242](https://github.com/yandex-cloud/yfm-docs/commit/0003242946ef0f7d0f21c52657032d8bc2329b1a))

## [2.11.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.10.2...v2.11.0) (2023-04-25)


### Features

* support hidden paths ([d037b1f](https://github.com/yandex-cloud/yfm-docs/commit/d037b1fe003618200116d3d99d71d107f75cb68f))

## [2.10.2](https://github.com/yandex-cloud/yfm-docs/compare/v2.10.1...v2.10.2) (2023-04-20)


### Bug Fixes

* Fix require of custom plugins ([d6d4af3](https://github.com/yandex-cloud/yfm-docs/commit/d6d4af33c12a2ef81f187c7aebdf9b55c4e26f87))

## [2.10.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.10.0...v2.10.1) (2023-04-20)


### Bug Fixes

* **infra/build:** add shebang to the bundled cli ([30212b9](https://github.com/yandex-cloud/yfm-docs/commit/30212b9d527f43454d79f4503391756cfa924a63))

## [2.10.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.9.0...v2.10.0) (2023-04-19)


### Features

* Add mermaid extension ([67efe6b](https://github.com/yandex-cloud/yfm-docs/commit/67efe6bff513277cb00decb0c36c2a7e66a0e65b))
* Build builder with esbuild ([3c51c1f](https://github.com/yandex-cloud/yfm-docs/commit/3c51c1f95e720c02dcc35a458774405b1a359534))


### Bug Fixes

* **resolvers/md2html:** default meta for yaml ([21b2809](https://github.com/yandex-cloud/yfm-docs/commit/21b28094ddaa1186be46942ff077abae422392a5))

## [2.9.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.8.2...v2.9.0) (2023-04-18)


### Features

* add oneof support ([370ab6b](https://github.com/yandex-cloud/yfm-docs/commit/370ab6bdd4568873046dc1cfd47f2e61a68a8910))


### Bug Fixes

* pr fix ([5d8c4d4](https://github.com/yandex-cloud/yfm-docs/commit/5d8c4d48191005820a8fc4454d386013c84b2352))
* refactor description ([656a182](https://github.com/yandex-cloud/yfm-docs/commit/656a182f0aa714e5fe2a34338e7c5dd151606bce))
* support single oneOf element ([c0c8759](https://github.com/yandex-cloud/yfm-docs/commit/c0c875927a2fcc2f55e3f7c1c2383b9c9a8da6e6))

## [2.8.2](https://github.com/yandex-cloud/yfm-docs/compare/v2.8.1...v2.8.2) (2023-04-14)


### Bug Fixes

* update @doc-tools/components & @gravity-ui/uikit ([4c70cc3](https://github.com/yandex-cloud/yfm-docs/commit/4c70cc3560b7132d0df5c5163407808eae497528))

## [2.8.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.8.0...v2.8.1) (2023-04-12)


### Bug Fixes

* **authors:** Revert "feat(authors): scrape authors from github" ([7c807ce](https://github.com/yandex-cloud/yfm-docs/commit/7c807ce21e8ea98107f2ff6bdc2cc698b2fa986b))

## [2.8.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.7.2...v2.8.0) (2023-04-10)


### Features

* **openapi:** Add leading page disposition configuration ([a3477b4](https://github.com/yandex-cloud/yfm-docs/commit/a3477b4c8e8741104a6ef869fd08fe836a05dd7b))
* **openapi:** Add noindex feature ([4b8fb6b](https://github.com/yandex-cloud/yfm-docs/commit/4b8fb6b9bfce82aaeae74bbd2219a4c5b703ecd8))
* **openapi:** Add toc filtering feature ([4af7a80](https://github.com/yandex-cloud/yfm-docs/commit/4af7a80e26e8d8f61c56e77d57b516965eeaff82))

## [2.7.2](https://github.com/yandex-cloud/yfm-docs/compare/v2.7.1...v2.7.2) (2023-04-03)


### Bug Fixes

* **includers/openapi:** type inferring ([40bb74f](https://github.com/yandex-cloud/yfm-docs/commit/40bb74f679c78fe5e7df5ec85d4d6c7a1b0ec8b0))

## [2.7.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.7.0...v2.7.1) (2023-03-31)


### Bug Fixes

* **includers/openapi:** bubble up erroneous values ([bd8f0b4](https://github.com/yandex-cloud/yfm-docs/commit/bd8f0b4cdd61f3e53b00a1d96d9b83862cdabb03))

## [2.7.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.6.0...v2.7.0) (2023-03-28)


### Features

* **authors:** scrape authors from github ([e5c9ddf](https://github.com/yandex-cloud/yfm-docs/commit/e5c9ddf166103174b4d4fd51a4ed218a86ec15cd))

## [2.6.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.5.0...v2.6.0) (2023-03-14)


### Features

* **includers/openapi:** parameter to set sandbox tab name ([d844e97](https://github.com/yandex-cloud/yfm-docs/commit/d844e97fe062a62e28d95143e8eeec3b4ee9a92f))


### Bug Fixes

* **includers/openapi:** add default type "object" ([3972fa0](https://github.com/yandex-cloud/yfm-docs/commit/3972fa056db1b85849f83579ea03336c571b12c9))

## [2.5.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.4.1...v2.5.0) (2023-03-13)


### Features

* **includers/openapi:** add ClipboardButton response body ([2607d94](https://github.com/yandex-cloud/yfm-docs/commit/2607d94fd689537675a16f2488ff24a15d791189))
* **includers/openapi:** add view for primitive body ([#304](https://github.com/yandex-cloud/yfm-docs/issues/304)) ([f7102f0](https://github.com/yandex-cloud/yfm-docs/commit/f7102f0e48d07f01c348695ccada8f8d4498a648))


### Bug Fixes

* **includers/openapi:** add allOf property ([647120e](https://github.com/yandex-cloud/yfm-docs/commit/647120e59b5c22612884f3f5e2c4f069b9567ad4))
* **includers/openapi:** add data-attribute in link ([5933c79](https://github.com/yandex-cloud/yfm-docs/commit/5933c79edbf919bb9f6719f81e5da52c9a8b6053))
* **includers/openapi:** add default type for enum ([ad4ddae](https://github.com/yandex-cloud/yfm-docs/commit/ad4ddae0bb309a969fa22946da6241bfd90e3662))
* **includers/openapi:** add possible reasons ([060497a](https://github.com/yandex-cloud/yfm-docs/commit/060497a7244e581be31275333faa2587fc11b1c7))
* **includers/openapi:** download link ([2820e86](https://github.com/yandex-cloud/yfm-docs/commit/2820e865ed9da0a819d327b051203d05832fdb01))
* **includers/openapi:** replace strong to red * ([43a1a5b](https://github.com/yandex-cloud/yfm-docs/commit/43a1a5bc785b8f40da2cad6abdff1aac7db4cc19))

## [2.4.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.4.0...v2.4.1) (2023-02-13)


### Bug Fixes

* bump yfm-transform version ([9d10863](https://github.com/yandex-cloud/yfm-docs/commit/9d108636a46ff17290cfaf300683ccd2075c2371))
* **includers/openapi:** add unwrapping items ([f2222b8](https://github.com/yandex-cloud/yfm-docs/commit/f2222b809c7273a8bd763bb6566dec2b33d19ba4))
* **openapi:** Cannot read property 'additionalProperties' of undefined ([c0bd6c6](https://github.com/yandex-cloud/yfm-docs/commit/c0bd6c64fd72002059cacdf3f3b2e0c03e052090))

## [2.4.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.7...v2.4.0) (2023-02-08)


### Features

* **includers/openapi:** sandbox plugin ([455272a](https://github.com/yandex-cloud/yfm-docs/commit/455272ad5d47f3eb2741919f1eae3bfedc27a1df))
* **includers/openapi:** sandbox plugin ([455272a](https://github.com/yandex-cloud/yfm-docs/commit/455272ad5d47f3eb2741919f1eae3bfedc27a1df))


### Bug Fixes

* **includers/openapi:** some enums are not printed in separate tables ([4e0a89f](https://github.com/yandex-cloud/yfm-docs/commit/4e0a89f6a292e693241577576d0d8ad2880c515b))

## [2.3.7](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.6...v2.3.7) (2023-02-05)


### Bug Fixes

* **includers/openapi:** enpoint method in capslock ([a6fc2ca](https://github.com/yandex-cloud/yfm-docs/commit/a6fc2ca0cef6fe70d9c700a206778cda9d95f258))
* **includers/openapi:** inline enums in array ([e30c266](https://github.com/yandex-cloud/yfm-docs/commit/e30c2663b1cf2e855539989fdb36eb57edc4123c))
* **includers/openapi:** response status text ([3aa0093](https://github.com/yandex-cloud/yfm-docs/commit/3aa0093f2f65a9b2d34b2bedb2da8095d9ed778e))
* **includers/openapi:** table columns names in bold ([67e5a08](https://github.com/yandex-cloud/yfm-docs/commit/67e5a08e3b33389f41709564007cdfdbec2a75a0))

## [2.3.6](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.5...v2.3.6) (2023-02-01)


### Bug Fixes

* **cmd/yfm2xliff:** fence block comments parsing ([c8edd69](https://github.com/yandex-cloud/yfm-docs/commit/c8edd6902dfe6746f93f9b4c5cc3d2341c580106))
* update hightlight.js version ([26cb199](https://github.com/yandex-cloud/yfm-docs/commit/26cb199e8ad5b7f1181c07133e9acacf4a5fc10f))

## [2.3.5](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.4...v2.3.5) (2023-01-30)


### Bug Fixes

* **includers/openapi:** default value in query ([cdc00a3](https://github.com/yandex-cloud/yfm-docs/commit/cdc00a3cf95c72540bbd53f4796af563ea0286f2))
* **includers/openapi:** excess properties in allOf ([ca120ee](https://github.com/yandex-cloud/yfm-docs/commit/ca120ee74dfcadc307c95137054b96e2dc7b0263))
* **includers/openapi:** table for enums ([ca36fef](https://github.com/yandex-cloud/yfm-docs/commit/ca36fef23237cd077489f7404d62e5289e9de044))

## [2.3.4](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.3...v2.3.4) (2023-01-29)


### Bug Fixes

* **cmd/yfm2xliff:** update to newer lib version ([daecff8](https://github.com/yandex-cloud/yfm-docs/commit/daecff8b42a2cff7fc414638ab78fda3a3d1db23))

## [2.3.3](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.2...v2.3.3) (2023-01-26)


### Bug Fixes

* **includers/openapi:** ref with custom description fix (2nd try) ([39923fb](https://github.com/yandex-cloud/yfm-docs/commit/39923fba47b2ab74953e6104d6f3108b26d1432a))

## [2.3.2](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.1...v2.3.2) (2023-01-23)


### Bug Fixes

* **includers/openapi:** move disable lint directive ([d77b9e1](https://github.com/yandex-cloud/yfm-docs/commit/d77b9e18aea3669322df99ef2214109a6c00c1f2))

## [2.3.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.3.0...v2.3.1) (2023-01-21)


### Bug Fixes

* **includers/openapi:** appropriate leading page title ([f112c1b](https://github.com/yandex-cloud/yfm-docs/commit/f112c1bfb06d61fca6bb391478c0bc685dcdd002))
* **includers/openapi:** display req/res schema type ([111dc02](https://github.com/yandex-cloud/yfm-docs/commit/111dc02a24bcaf0ad0aa590d79a1d78422d2df9b))

## [2.3.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.2.0...v2.3.0) (2023-01-19)


### Features

* **includer/openapi:** full spec render mode parameter ([4d9c9a4](https://github.com/yandex-cloud/yfm-docs/commit/4d9c9a46dc7637500e3bc4c990f53f683125b926))


### Bug Fixes

* **includers/openapi:** delete Description title ([bae04e9](https://github.com/yandex-cloud/yfm-docs/commit/bae04e9567dfedad519902e8fc43bc196eb37f2f))

## [2.2.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.1.3...v2.2.0) (2023-01-18)


### Features

* **includers/openapi:** parse server description ([d594de6](https://github.com/yandex-cloud/yfm-docs/commit/d594de60889f4f1eb88c5a948006a4cd88f62eee))
* **includers/openapi:** render server desription ([de6eab2](https://github.com/yandex-cloud/yfm-docs/commit/de6eab2acfe39cb6a367a6456e25f9c1c3f4392e))


### Bug Fixes

* **includers/openapi:** disable markdownlint ([a4fc501](https://github.com/yandex-cloud/yfm-docs/commit/a4fc5015029e21ec0fd8571b1d0dad97e23506ca))

## [2.1.3](https://github.com/yandex-cloud/yfm-docs/compare/v2.1.2...v2.1.3) (2023-01-17)


### chore

* release 2.1.3 ([9fd384c](https://github.com/yandex-cloud/yfm-docs/commit/9fd384c50284c186f863b10cfc9fce17db8c0095))

## [2.1.2](https://github.com/yandex-cloud/yfm-docs/compare/v2.1.1...v2.1.2) (2023-01-17)


### Bug Fixes

* **includers/openapi:** no nulls in samples ([c2cb36e](https://github.com/yandex-cloud/yfm-docs/commit/c2cb36e1b004a81bed4c58a1420a1964941f550d))

## [2.1.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.1.0...v2.1.1) (2023-01-16)


### Bug Fixes

* **includers/openapi:** no default values in description ([d821d80](https://github.com/yandex-cloud/yfm-docs/commit/d821d80f0abcc6e48d6d6401d1de18fb2fed78c0))
* **includers/openapi:** ref with custom description fix ([d77592d](https://github.com/yandex-cloud/yfm-docs/commit/d77592db956a2ec9d20bb668a2747442b2be4fcf))
* **includers/openapi:** undefined[] fix ([a055a3d](https://github.com/yandex-cloud/yfm-docs/commit/a055a3d0bff36ceb1466aab750cdee76bca8f8e2))

## [2.1.0](https://github.com/yandex-cloud/yfm-docs/compare/v2.0.1...v2.1.0) (2023-01-10)


### Features

* **includers/openapi:** request and response body params ([66372e9](https://github.com/yandex-cloud/yfm-docs/commit/66372e9e7e328e5694392bba192d5f1e73361c87))

## [2.0.1](https://github.com/yandex-cloud/yfm-docs/compare/v2.0.0...v2.0.1) (2023-01-09)


### Bug Fixes

* **interceptors:** intercept links without extension ([7f866c4](https://github.com/yandex-cloud/yfm-docs/commit/7f866c4087ee05af5be6b700b2485510eec423e6))

## [2.0.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.31.4...v2.0.0) (2022-12-29)


### ⚠ BREAKING CHANGES

* **services/includers:** includers now have new toc interface

### Features

* **includers/generic:** include markdown content ([4d4514c](https://github.com/yandex-cloud/yfm-docs/commit/4d4514cd40d40e087a0340591afbce94e0bdae17))
* **includers/openapi:** rewrite ([509dbf9](https://github.com/yandex-cloud/yfm-docs/commit/509dbf990e246034657dea0936a85a2f30dcc189))
* **includers/sourcedoc:** rewrite ([b03fbee](https://github.com/yandex-cloud/yfm-docs/commit/b03fbeeae02fe50dda5eef07bf00c3a5105ddb39))
* **includers/unarchive:** unarchive input ([4801dc5](https://github.com/yandex-cloud/yfm-docs/commit/4801dc53ba0c56e781c525eb81644ce115796cf1))
* **services/includers:** new architecture ([06d9b0c](https://github.com/yandex-cloud/yfm-docs/commit/06d9b0cb438b2f5abd87bcd333d4d1e0f30d0298))
* **services/includers:** pass includer its index ([5bb3ce7](https://github.com/yandex-cloud/yfm-docs/commit/5bb3ce73d7ca5b8d7729d8362c944fc04dd6b805))
* **utils/logger:** add warning message ([8071d26](https://github.com/yandex-cloud/yfm-docs/commit/8071d26ed627c2be12b5a6d2d0422c106e571c79))


### Bug Fixes

* **includers/generic:** resolve generated input ([376068b](https://github.com/yandex-cloud/yfm-docs/commit/376068bf1feabd374c21d9dee3cc64089884bda0))
* **includers/openapi:** resolve generated input ([65f0297](https://github.com/yandex-cloud/yfm-docs/commit/65f0297830a414ff6061feab8c5b9cca1318a1c1))
* **includers/sourcedocs:** paths resolution ([cca8ceb](https://github.com/yandex-cloud/yfm-docs/commit/cca8ceb739f17f7720ffc5b58abbc57dfb1028dc))
* **utils/logger:** write warnings to the final log ([5fd7876](https://github.com/yandex-cloud/yfm-docs/commit/5fd7876e64b5ce419b81af45b40f01cba87a0001))

## [1.31.4](https://github.com/yandex-cloud/yfm-docs/compare/v1.31.3...v1.31.4) (2022-12-21)


### Bug Fixes

* **includers/openapi:** openapi generator skips path without tags ([c533921](https://github.com/yandex-cloud/yfm-docs/commit/c53392171534d7089a00605664815baf2243bcdb))
* parse JSON schema ([edf0e74](https://github.com/yandex-cloud/yfm-docs/commit/edf0e7423ce0115ba964f2de5af86abe2b78ea0a))

## [1.31.3](https://github.com/yandex-cloud/yfm-docs/compare/v1.31.2...v1.31.3) (2022-11-24)


### Bug Fixes

* **cmd/translate:** handle single line files ([7ab6cb1](https://github.com/yandex-cloud/yfm-docs/commit/7ab6cb15f57f36275ae9b235e02274afd342f071))

## [1.31.2](https://github.com/yandex-cloud/yfm-docs/compare/v1.31.1...v1.31.2) (2022-11-17)


### Bug Fixes

* **openapi:** generate docs without tags section ([5f5f1b5](https://github.com/yandex-cloud/yfm-docs/commit/5f5f1b5fe75ecf48cba63a145a90bd8933aa7fdf))

## [1.31.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.31.0...v1.31.1) (2022-11-10)


### chore

* release 1.31.1 ([37ed298](https://github.com/yandex-cloud/yfm-docs/commit/37ed2981ca3719d3c4be430365114190571f8db9))

## [1.31.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.30.2...v1.31.0) (2022-11-09)


### Features

* add term plugin ([#182](https://github.com/yandex-cloud/yfm-docs/issues/182)) ([8608b58](https://github.com/yandex-cloud/yfm-docs/commit/8608b58df5acfc0f30619716d7d2176eedfedb89))

## [1.30.2](https://github.com/yandex-cloud/yfm-docs/compare/v1.30.1...v1.30.2) (2022-11-03)


### Bug Fixes

* **services/tocs:** includes with when ([f939ec4](https://github.com/yandex-cloud/yfm-docs/commit/f939ec42fd4855a79559f18410f308dcdacefb0a))
* **services/utils:** handle null items filtering ([e5d14b5](https://github.com/yandex-cloud/yfm-docs/commit/e5d14b5b7fac64ccbc618dd6c1eef5ea2a4429fd))

## [1.30.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.30.0...v1.30.1) (2022-10-31)


### Bug Fixes

* Revert "fix(services/tocs): fix `when` processing order" ([54134ab](https://github.com/yandex-cloud/yfm-docs/commit/54134abae0a1ca0883662da71233e30ffba54c18))

## [1.30.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.29.1...v1.30.0) (2022-10-31)


### Features

* **cmd/translate:** translate documentation ([0b5c6b4](https://github.com/yandex-cloud/yfm-docs/commit/0b5c6b492234c081566934e1c2fa36ec92b08715))


### Bug Fixes

* **services/tocs:** fix `when` processing order ([19ff064](https://github.com/yandex-cloud/yfm-docs/commit/19ff0642e43abb1001300f2c24d19928130ce852))

## [1.29.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.29.0...v1.29.1) (2022-10-28)


### Bug Fixes

* exclude external dependencies from build ([df415bc](https://github.com/yandex-cloud/yfm-docs/commit/df415bc61809e1ffd4933c1676139e4442c32865))

## [1.29.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.28.0...v1.29.0) (2022-10-27)


### Features

* limit async operations to avoid heap out of memory ([e3ca5b6](https://github.com/yandex-cloud/yfm-docs/commit/e3ca5b65087584268e83c37e3b969dde4de2ae47))

## [1.28.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.27.1...v1.28.0) (2022-10-27)


### Features

* allow load custom resources ([#184](https://github.com/yandex-cloud/yfm-docs/issues/184)) ([80c6624](https://github.com/yandex-cloud/yfm-docs/commit/80c66240409fefe3354b19a06ebffdc134abd358))

## [1.27.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.27.0...v1.27.1) (2022-10-26)


### Bug Fixes

* **cmd/xliff/compose:** error reporting ([338423a](https://github.com/yandex-cloud/yfm-docs/commit/338423a92e7b96458c19f897faf07316e86e5608))
* **cmd/xliff/extract:** error reporting ([57c2d93](https://github.com/yandex-cloud/yfm-docs/commit/57c2d93303bca2b67c64be84f3a660943ff338ef))

## [1.27.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.26.1...v1.27.0) (2022-09-23)


### Features

* **cmd/xliff/compose:** compose xlf and skl into documentation ([2681cbb](https://github.com/yandex-cloud/yfm-docs/commit/2681cbb437328e180e80f1c2186e881685647c56))
* **cmd/xliff/extract:** xliff extraction from documentation ([f4f4aaa](https://github.com/yandex-cloud/yfm-docs/commit/f4f4aaadb55169b7a9f79a4e3dfa5f32b0f16d7e))


### Bug Fixes

* linting errors ([e1a66a3](https://github.com/yandex-cloud/yfm-docs/commit/e1a66a3fa518ebace40c97ae61287bb13991a58f))

## [1.26.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.26.0...v1.26.1) (2022-09-20)


### Bug Fixes

* **services/tocs:** fix format title ([#183](https://github.com/yandex-cloud/yfm-docs/issues/183)) ([9d2ab53](https://github.com/yandex-cloud/yfm-docs/commit/9d2ab5336ec64442fd43a1440d6f715e256c7021))

## [1.25.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.25.0...v1.25.1) (2022-09-06)


### Bug Fixes

* **services/tocs:** apply includers recursively ([b3fdc38](https://github.com/yandex-cloud/yfm-docs/commit/b3fdc384ba4bee7440369d902721646623f28d41))
* **services/tocs:** apply includers toc paths ([c5630e5](https://github.com/yandex-cloud/yfm-docs/commit/c5630e5d4d79409e5ab88bdbba45a95d4d620eda))


### chore

* release 1.25.0 ([cb6a333](https://github.com/yandex-cloud/yfm-docs/commit/cb6a33335ec3cbe61be099abdc758e2256ecfbe8))
* release 1.25.1 ([3c3c097](https://github.com/yandex-cloud/yfm-docs/commit/3c3c097bd15e081ae1b39f86aaf4ce5970282a38))

## [1.25.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.24.1...v1.25.0) (2022-09-06)


### chore

* release 1.25.0 ([cb6a333](https://github.com/yandex-cloud/yfm-docs/commit/cb6a33335ec3cbe61be099abdc758e2256ecfbe8))

## [1.24.1](https://github.com/yandex-cloud/yfm-docs/compare/v1.24.0...v1.24.1) (2022-09-06)


### Bug Fixes

* **services/tocs:** apply includers recursively ([b3fdc38](https://github.com/yandex-cloud/yfm-docs/commit/b3fdc384ba4bee7440369d902721646623f28d41))
* **services/tocs:** apply includers toc paths ([c5630e5](https://github.com/yandex-cloud/yfm-docs/commit/c5630e5d4d79409e5ab88bdbba45a95d4d620eda))

## [1.24.0](https://github.com/yandex-cloud/yfm-docs/compare/v1.23.2...v1.24.0) (2022-09-01)


### Features

* **includers/openapi:** toc, content, leading pages ([f3bb43b](https://github.com/yandex-cloud/yfm-docs/commit/f3bb43b2a6b57eca09dc9f189721c22ca7932a2d))
* **services/includers:** generatePath ([8e63577](https://github.com/yandex-cloud/yfm-docs/commit/8e63577826b089b7f543c88b032e68fc1f508c4c))

## [1.23.2](https://github.com/yandex-cloud/yfm-docs/compare/v1.23.1...v1.23.2) (2022-08-26)


### Bug Fixes

* Fix linters warnings ([441fe8c](https://github.com/yandex-cloud/yfm-docs/commit/441fe8ce3f963eb9422606520b97ef316a810ee8))
* Fix tests ([b5b1909](https://github.com/yandex-cloud/yfm-docs/commit/b5b19094c64b346fab140e1c0238d1b0ea263f17))
