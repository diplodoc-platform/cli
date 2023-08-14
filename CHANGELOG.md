# Changelog

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
