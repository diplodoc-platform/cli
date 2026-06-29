[english](https://github.com/diplodoc-platform/cli/blob/master/README.md) | **русский**

---

[![NPM version](https://img.shields.io/npm/v/@diplodoc/cli.svg?style=flat)](https://www.npmjs.org/package/@diplodoc/cli)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=coverage)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=diplodoc-platform_cli&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=diplodoc-platform_cli)

# yfm-docs

Yfm-docs позволяет собрать полноценный документационный проект: с навигацией, внутренними переходами и полной поддержкой
[Yandex Flavored Markdown (YFM)](https://diplodoc.com/docs/ru/index-yfm).

![Пример отображения страницы документации](.github/assets/overview.jpg)

## Документация

[ydocs.tech](https://diplodoc.com/docs/ru/tools/docs)

## Требования

Node 22+

## Использование

```bash
npm i @diplodoc/cli -g
```

```bash
npm run start -- -i ./input-folder -o ./ouput-folder -v "{\"name\":\"Alice\"}"
```

## `yfm init`

Инициализация нового проекта документации Diplodoc.

### Использование

```bash
yfm init [options]
```

Запуск без флагов в терминале запускает интерактивный визард. Передайте `--skip-interactive` чтобы использовать флаги и дефолтные значения.

### Опции

| Опция                     | По умолчанию        | Описание                                      |
| ------------------------- | ------------------- | --------------------------------------------- |
| `-o, --output <path>`     | `.`                 | Директория для создания проекта               |
| `--name <string>`         | basename директории | Название проекта                              |
| `--langs <string>`        | `en`                | Языки через запятую, например `en,ru`         |
| `--default-lang <string>` | первый из `--langs` | Язык по умолчанию                             |
| `--template <string>`     | `minimal`           | `minimal` или `full`                          |
| `--header`                | `true`              | Навигационная шапка в `toc.yaml`              |
| `--force`                 | `false`             | Перезаписать существующую директорию          |
| `--dry-run`               | `false`             | Показать что будет создано, без записи файлов |
| `--skip-interactive`      | `false`             | Пропустить визард                             |

### Создаваемые файлы

**`minimal`**

```
<output>/
├── .yfm
├── toc.yaml
└── index.md
```

**`full`** — дополнительно создаёт `presets.yaml`, `pc.yaml` и расширенный `.yfm` с конфигурацией pdf, search, vcs, authors.

Для многоязычных проектов (`--langs en,ru`) контент размещается в поддиректориях по языку:

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

Обрабатывает **один** Markdown-файл и выводит результат в stdout (или пишет в файл).
В отличие от `yfm build`, не обходит весь проект и не собирает целую страницу —
для `html` отдаётся только **контентный фрагмент** (без toc, шапки и обвязки страницы).

### Использование

```bash
# self-contained markdown в stdout
yfm content -i ./page.md -f md

# html-фрагмент в файл
yfm content -i ./page.md -f html -o ./page.html
```

Результат в stdout обрамляется маркерами-разделителями, чтобы его можно было отделить от
сопутствующего диагностического вывода:

```
<<<<<< YFM CONTENT START >>>>>>
...контент...
<<<<<< YFM CONTENT END >>>>>>
```

Предупреждения и ошибки идут в stderr; при любой ошибке сборки процесс завершается с ненулевым кодом.
При использовании `-o` в файл пишется «сырой» контент (без маркеров).

Флаг `--raw` выводит в stdout **только** контент — без маркеров-разделителей и без баннеров
фреймворка (строка версии, таймер сборки, баннер завершения). Удобно, когда результат нужно
направить напрямую в другой инструмент или файл:

```bash
yfm content -i ./page.md -f md --raw > page.md
```

Вместе с `-o` флаг `--raw` ничего не меняет (в файл всегда пишется «сырой» контент).

### Корень проекта

Пресеты (`presets.yaml`), инклуды и переменные резолвятся относительно корня проекта:

- по умолчанию корень — **текущая рабочая директория**;
- передайте `-c, --config <path>` с путём к `.yfm` — его директория станет корнем.

### Опции

| Опция                                    | По умолчанию | Описание                                                   |
| ---------------------------------------- | ------------ | ---------------------------------------------------------- |
| `-i, --input <file>`                     | —            | Путь к Markdown-файлу (обязателен)                         |
| `-o, --output <file>`                    | stdout       | Записать результат в файл вместо stdout                    |
| `-f, --output-format <md\|html>`         | `html`       | Формат вывода                                              |
| `-w, --watch`                            | `false`      | Пересборка при изменении файла, его инклудов и пресетов    |
| `--raw`                                  | `false`      | Выводить в stdout только контент (без маркеров и баннеров) |
| `-c, --config <path>`                    | `.yfm`       | Конфиг; его директория становится корнем проекта           |
| `--vars-preset <name>`                   | `default`    | Применяемый пресет переменных                              |
| `-v, --vars <json>`                      | —            | Переменные (JSON), переопределяющие пресеты                |
| `--allow-html` / `--no-allow-html`       | `true`       | Разрешить сырой HTML в Markdown                            |
| `--sanitize-html` / `--no-sanitize-html` | `true`       | Санитизировать результирующий HTML                         |
| `--id-generator <strategy>`              | `random`     | Стратегия id элементов: `random`, `deterministic` и т.д.   |
| `-s, --strict`                           | `false`      | Ненулевой код выхода при наличии предупреждений            |

## Исходники

### Подготовка

Необходимо добавить `.env` файл в рут репозитория с данными ниже:

```bash
GITHUB_OWNER=
GITHUB_REPO= # docs
GITHUB_TOKEN= # personal access token
GITHUB_BASE_URL= # for ex: https://api.github.com
VCS_CONNECTOR_TYPE= # github
```

или обновить .yfm файл в docs репозитории:

```bash
connector:
    type:
    github:
        endpoint:
        token:
        owner:
        repo:
```

### Сборка из исходников

```bash
cd cli
npm ci && npm run build
```

## License

MIT
