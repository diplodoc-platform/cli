**русский** | [english](https://github.com/diplodoc-platform/cli/blob/master/README.md)

---

[![NPM version](https://img.shields.io/npm/v/@diplodoc/cli.svg?style=flat)](https://www.npmjs.org/package/@diplodoc/cli)

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
