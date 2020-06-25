# yfm-docs

Yfm-docs позволяет собрать полноценный документационный проект: с навигацией, внутренними переходами и полной поддержкой
[Yandex Flavored Markdown (YFM)](https://www.npmjs.com/package/@doc-tools/transform). Например, как [документация Яндекс.Облака](https://cloud.yandex.ru/docs).

![Пример отображения страницы документации](docsAssets/overview.jpg)

## Установка
```shell script
npm i @doc-tools/docs -g
```

## Использование
```shell script
yfm -i ./input-folder -o ./ouput-folder -v "{\"name\":\"Alice\"}"
```

## Список возможных параметров

- `--input, -i`

    Путь до директории проекта (обязательный параметр).

- `--output, -o`

    Путь к директории для выходных данных (обязательный параметр).

- `--allowHTML`

    Разрешить использование HTML в md файлах.

- `--varsPreset`

    Название используемого [пресета](./DOCS.md#presets).

- `--vars, -v`

    Значения [YFM переменных](https://github.com/yandex-cloud/yfm-transform/blob/master/DOCS.md#vars)

- `--strict, -s`

    Запуск в строгом режиме.

    Предупреждения YFM трактуются как ошибки. По-умолчанию, выключено.

- `--quiet, -q`

    Запуск в тихом режиме.

    Не выводить логи в stdout. По-умолчанию, выключено.

- `--config, -c`

    Путь до [файла конфигурации YFM](./DOCS.md#config).

- `--output-format`

    Формат генерации: html или md. По-умолчанию, html.

- `--apply-presets`

    Подставлять ли [пресеты](./DOCS.md#presets) при конвертации md2md.

- `--version`

    Текущая версия.

- `--help`

    Список команд.

Подробнее `yfm-docs --help`

[Более подробное описание структуры проекта](./DOCS.md)

## Результат сборки

Собранный проект представляет собой набор статических HTML, которые можно просмотреть локально, разместить на хостинге,
в GitHub Pages или в [S3](https://cloud.yandex.ru/services/storage):
```
input-folder
|-- index.html (Разводящая страница документации)
|-- quickstart.html  (Файлы документации и изображения)
|-- pages
    |-- faq.html
    |-- how-to.html
|-- assets
    |-- image1.png
    |-- image2.png
|-- includes
    |-- faq_shared_block.html
```

### Сборка в YFM

Так же можно собрать проект в YFM с помощью ключа `--output-format=md`.

В этом случае
- будут подставлены [вставки в файлах оглавлений](./DOCS.md#tocIncludes);
- вычислены условия в контенте и в файлах оглавлений;
- подставлены переменные, если указан параметр `apply-presets`;
- скопированы все файлы, которые указаны в файлах оглавления, и используемые в них картинки и [файлы вставок](https://github.com/yandex-cloud/yfm-transform/blob/master/DOCS.md#includes).

Подробнее про переменные и условия в [документации YFM](https://github.com/yandex-cloud/yfm-transform/blob/master/DOCS.md#vars).

```
input-folder
|-- index.yaml (Разводящая страница документации)
|-- quickstart.md (Файлы документации и изображения)
|-- pages
    |-- faq.md
    |-- how-to.md
|-- assets
    |-- image1.png
    |-- image2.png
|-- includes
    |-- faq_shared_block.md
```

## Исходники
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
