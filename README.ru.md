**русский** | [english](https://github.com/yandex-cloud/yfm-docs/blob/master/README.md)
- - -

[![NPM version](https://img.shields.io/npm/v/@doc-tools/docs.svg?style=flat)](https://www.npmjs.org/package/@doc-tools/docs)

# yfm-docs

Yfm-docs позволяет собрать полноценный документационный проект: с навигацией, внутренними переходами и полной поддержкой
[Yandex Flavored Markdown (YFM)](https://ydocs.tech).

![Пример отображения страницы документации](docsAssets/overview.jpg)

[Документация по использованию](https://ydocs.tech/ru/tools/docs/)

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

### Установка

```bash
cd yfm-docs
npm ci && npm run build
```

### Использование
```bash
npm run start -- -i ./input-folder -o ./ouput-folder -v "{\"name\":\"Alice\"}"
```

## License

MIT
