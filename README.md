**english** | [русский](https://github.com/yandex-cloud/yfm-docs/blob/master/README.ru.md)
- - -

[![NPM version](https://img.shields.io/npm/v/@doc-tools/docs.svg?style=flat)](https://www.npmjs.org/package/@doc-tools/docs)

# yfm-docs

Yfm-docs lets you build a full-fledged documentation project: with navigation, internal transitions, and full
[Yandex Flavored Markdown (YFM)](https://ydocs.tech) support.

![Example of displaying a documentation page](docsAssets/overview.jpg)

## Documentation

[ydocs.tech](https://ydocs.tech/en/tools/docs/)

## Usage

```bash
npm i @doc-tools/docs -g
```

```bash
npm run start -- -i ./input-folder -o ./ouput-folder -v "{\"name\":\"Alice\"}"
```

## Source files

### Preparation

You need to add `.env` file into repo root with data below:

```bash
GITHUB_OWNER=
GITHUB_REPO= # docs
GITHUB_TOKEN= # personal access token
GITHUB_BASE_URL= # for ex: https://api.github.com
VCS_CONNECTOR_TYPE= # github
```

or you can update .yfm file into docs repo

```bash
connector:
    type:
    github:
        endpoint:
        token:
        owner:
        repo:
```

### Build from source

```bash
cd yfm-docs
npm ci && npm run build
```

### Run TS directly for debug in IDE

```bash
npm run start-ts
```


## License

MIT
