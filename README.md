# yfm-docs
Создавай документацию с помощью yfm-docs в Markdown и HTML форматах.

- Находит файлы навигации `toc.yaml` и файлы `presets.yaml`, содержащии список markdown переменных.
- Обрабатывает `.md`, `.yaml` файлы.
- В зависимости от `output-format` создает выходные файлы, используя пресеты и переданные через CLI переменные.

## Установка
```bash
npm i yfm-docs -g
```

## Использование
```bash
yfm-docs -i ./input-folder -o ./ouput-folder -v "{\"name\":\"Alice\"}"
```

## Пример использования
Необходимо указать путь до директории с YFM файлами, например:
```
input-folder
|-- .yfm (Файл конфигурации YFM)
|-- toc.yaml (Файл навигации)
|-- presets.yaml (Набор переменных пресетов)
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

Пример `.yfm`
```
allowHTML: true
strict: true
varsPreset: "default"
ignore:
    "**/includes/*.md"
```

Пример `toc.yaml`

```
title: "Документация"
href: index.yaml
items:
  - name: "Начало работы"
    href: quickstart.md
  - name: "Пошаговые инструкции"
    items:
      - name: "Частые вопросы"
        href: pages/faq.md
      - name: "Руководство для начинающих"
        href: pages/how-to.md
```

Пример `presets.yaml`

```
default:
    name: Alice
    place: Wonderland
```

Переменные, объявленные в `presets.yaml` будут использованы в шаблонах:
```
Dear, {{ name }}
Welcome to {{ place }}
```

На выходе получим сгенерированную документацию в формате HTML при `--output-format=html`, которую можно разместить на хостинге, в GitHub Pages или в S3:
```
input-folder
|-- index.yaml (Разводящая страница документации)
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

Или Markdown документацию при `--output-format=md` и, например, использовать в качестве Wiki:

```
input-folder
|-- index.md (Разводящая страница документации)
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

## Список возможных параметров
```bash
--version        Текущая версия
--config, -c     Путь до файла конфигурации YFM
--input, -i      Путь до директории с YFM файлами
--output, -o     Путь к директории для выходных данных
--varsPreset,    Набор пресетов <default|external|internal>
--output-format  Выходной формат <html|md>
--vars, -v       Список переменных markdown шаблона
--strict, -s     Запуск в строгом режиме
```
Подробнее `yfm-docs --help`

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

Mozilla Public License
Version 2.0
