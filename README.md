**english** | [русский](https://github.com/diplodoc-platform/cli/blob/master/README.ru.md)

---

[![NPM version](https://img.shields.io/npm/v/@diplodoc/cli.svg?style=flat)](https://www.npmjs.org/package/@diplodoc/cli)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=coverage)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)

# yfm-docs

Yfm-docs lets you build a full-fledged documentation project: with navigation, internal transitions, and full
[Yandex Flavored Markdown (YFM)](https://diplodoc.com/docs/en/index-yfm) support.

![Example of displaying a documentation page](.github/assets/overview.jpg)

## Documentation

[ydocs.tech](https://diplodoc.com/docs/en/tools/docs)

## Requirements

Node 22+

## Usage

```bash
npm i @diplodoc/cli -g
```

```bash
npm run start -- -i ./input-folder -o ./output-folder -v "{\"name\":\"Alice\"}"
```

## `yfm init`

Initialize a new Diplodoc documentation project.

### Usage

```bash
yfm init [options]
```

Running without flags in a terminal starts an interactive wizard. Pass `--skip-interactive` to use flags and defaults only.

### Options

| Option                    | Default            | Description                                       |
| ------------------------- | ------------------ | ------------------------------------------------- |
| `-o, --output <path>`     | `.`                | Directory to create the project in                |
| `--name <string>`         | directory basename | Project name                                      |
| `--langs <string>`        | `en`               | Comma-separated list of languages, e.g. `en,ru`   |
| `--default-lang <string>` | first of `--langs` | Default language                                  |
| `--template <string>`     | `minimal`          | `minimal` or `full`                               |
| `--header`                | `true`             | Add navigation header with controls to `toc.yaml` |
| `--force`                 | `false`            | Overwrite existing output directory               |
| `--dry-run`               | `false`            | Preview files without writing                     |
| `--skip-interactive`      | `false`            | Skip wizard                                       |

### Created files

**`minimal`**

```
<output>/
├── .yfm
├── toc.yaml
└── index.md
```

**`full`** — adds `presets.yaml`, `pc.yaml` and extended `.yfm` with pdf, search, vcs, authors config.

For multilingual projects (`--langs en,ru`) content is placed in per-language subdirectories:

```
<output>/
├── .yfm
├── presets.yaml
├── en/
│   ├── toc.yaml
│   └── index.md
└── ru/
    ├── toc.yaml
    └── index.md
```

## `yfm content`

Process a **single** Markdown file and print the result to stdout (or write it to a file).
Unlike `yfm build`, it does not traverse the whole project and does not produce a full page —
for `html` it emits only the **content fragment** (no toc, header or page chrome).

### Usage

```bash
# self-contained markdown to stdout
yfm content -i ./page.md -f md

# html content fragment into a file
yfm content -i ./page.md -f html -o ./page.html
```

The result printed to stdout is wrapped in delimiter markers so it can be extracted from the
surrounding diagnostic output:

```
<<<<<< YFM CONTENT START >>>>>>
...content...
<<<<<< YFM CONTENT END >>>>>>
```

Warnings and errors go to stderr; on any build error the process exits with a non-zero code.
When `-o` is used, the raw content is written to the file (without the markers).

### Project root

Presets (`presets.yaml`), includes and variables are resolved relative to a project root:

- by default the root is the **current working directory**;
- pass `-c, --config <path>` to point at a `.yfm` — its directory becomes the root.

### Options

| Option                                   | Default   | Description                                              |
| ---------------------------------------- | --------- | -------------------------------------------------------- |
| `-i, --input <file>`                     | —         | Path to the Markdown file to process (required)          |
| `-o, --output <file>`                    | stdout    | Write the result to a file instead of stdout             |
| `-f, --output-format <md\|html>`         | `html`    | Output format                                            |
| `-w, --watch`                            | `false`   | Re-render on changes to the file, its includes & presets |
| `-c, --config <path>`                    | `.yfm`    | Config file; its directory becomes the project root      |
| `--vars-preset <name>`                   | `default` | Variables preset to apply                                |
| `-v, --vars <json>`                      | —         | Inline variables (JSON) overriding presets               |
| `--allow-html` / `--no-allow-html`       | `true`    | Allow raw HTML in Markdown                               |
| `--sanitize-html` / `--no-sanitize-html` | `true`    | Sanitize the produced HTML                               |
| `--id-generator <strategy>`              | `random`  | Element id strategy: `random`, `deterministic`, etc.     |
| `-s, --strict`                           | `false`   | Exit with a non-zero code on warnings                    |

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
cd cli
npm ci && npm run build
```

## License

MIT
