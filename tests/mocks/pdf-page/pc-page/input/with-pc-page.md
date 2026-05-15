# Page constructor

Page constructor (далее – PC) — это библиотека семейства [Gravity UI](https://gravity-ui.com/) для рендеринга веб-страниц на основе данных представленных в YAML формате.
При создании страниц используется компонентный подход: страница строится с использованием набора готовых блоков, которые можно размещать в любом порядке. Каждый блок имеет определенный тип и набор параметров входных данных.
Формат входных данных и список доступных блоков можно посмотреть в [документации библиотеки](https://preview.gravity-ui.com/page-constructor/?path=/docs/documentation-blocks--docs). В сторибуке PC есть [удобная песочница](https://preview.gravity-ui.com/page-constructor/?path=/story/editor-main--default), в которой сначала можно опробовать все блоки и собрать страницу, а уже потом скопировать готовый конфиг к себе в документацию.

Примеры оформление страниц с помощью PC [\[1\]](./index.yaml) [\[2\]](./index2.yaml) [\[3\]](./index2.yaml)

## Способы использования

Page constructor можно использовать двумя способами:

1. **Отдельные YAML-файлы** — создание полноценных страниц с помощью YAML-конфигурации.
2. **Встраивание блоков** — добавление отдельных блоков Page constructor прямо в markdown-документацию.

## Добавление Page constructor страниц { #page }

Стандартная структура конфигурации PC страницы хранится в `.yaml` формате и имеет вид:

```yaml
blocks:
  - type: 'header-block'
    width: 's'
    offset: 'default'
    title: 'Diplodoc'
    resetPaddings: true
    verticalOffset: 'l'
    description: 'Платформа для создания технической документации в концепции Docs as Сode с открытым исходным кодом. Простое и удобное решение для развёртывания документации больших и маленьких команд.'
    background:
      image:
        mobile: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-cover-mini.png'
        desktop: '_assets/test-move.png'
      color: '#C6FE4D'
      fullWidth: false
    buttons:
      - text: 'Начать'
        theme: 'dark'
        size: 'promo'
        url: '/quickstart'
      - text: 'GitHub'
        theme: 'outlined'
        size: 'promo'
        url: 'https://github.com/diplodoc-platform'
```

Описание полей для каждого блока можно посмотреть в [документации](https://preview.gravity-ui.com/page-constructor/?path=/docs/documentation-blocks--docs).

## Добавление блоков Page constructor в Markdown { #block }

Вы можете встраивать отдельные блоки Page constructor непосредственно в markdown-документацию. Это позволяет комбинировать обычный markdown-контент с интерактивными блоками Page constructor на одной странице.

### Синтаксис

Для добавления блока Page constructor в markdown используйте директиву `page-constructor`:

```yaml
::: page-constructor
blocks:
  - type: 'header-block'
    title: 'Заголовок'
    description: 'Описание'
:::
```

Важно: свойство `blocks:` обязательно. Внутри директивы используется тот же YAML-формат, что и при создании отдельных YAML-файлов. В текстовых полях (заголовках, описаниях, текстах) поддерживается базовый YFM-синтаксис.

### Примеры использования

Вы можете использовать Page constructor для добавления одного блока или нескольких блоков одновременно.

{% cut "Разметка блока" %}

```yaml
::: page-constructor
blocks:
  - type: 'filter-block'
    centered: true
    title:
      text: 'Нам доверяют'
    tags:
      - id: 'one'
        label: 'DoubleСloud'
      - id: 'two'
        label: 'Yandex Support'
      - id: 'three'
        label: 'Yandex Cloud'
      - id: 'four'
        label: 'YDB'
      - id: 'five'
        label: 'CatBoost'
    colSizes:
      all: 12
      xl: 12
      md: 12
      sm: 12
    indent:
      top: s
    items:
      - tags:
          - 'one'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/diplodoc-tab-1.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://double.cloud/docs/en/'
                theme: 'normal'
                arrow: true
                color: #54BA7E

      - tags:
          - 'two'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-trust-support.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://yandex.ru/support2/audience/ru/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'three'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-yandex-cloud.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://cloud.yandex.ru/docs/compute/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'four'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-ydb.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://ydb.tech/en/docs/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'five'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-yandex-cat.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://catboost.ai/en/docs/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
  - type: 'card-layout-block'
    title: 'Как это работает?'
    colSizes:
      all: 12
      md: 4
      sm: 6
    indent:
      top: sm
    children:
      - type: 'layout-item'
        content:
          title: 'Архитектура'
          text: 'Платформа Diplodoc имеет клиент-серверную архитектуру: серверная часть состоит из компонентов на Node.js, которые генерируют и отображают документационные проекты. Такая архитектура обеспечивает надёжность и горизонтальное масштабирование в случае необходимости.  '
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-01.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
      - type: 'layout-item'
        content:
          title: 'Интеграция с GitHub'
          text: 'Платформа Diplodoc имеет сквозную интеграцию с GitHub для обеспечения простого и стабильного механизма сборки и развёртывания документационных проектов. GitHub используется как хранилище исходного кода для документов и исполнения пайплайна проекта.'
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-02.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
      - type: 'layout-item'
        content:
          title: 'Развёртывание'
          text: 'Компании – пользователи сервиса Diplodoc используют встроенные механизмы выкладки документационного проекта с последующей их индексацией и отслеживанием версий. Документы могут обновляться как в автоматическом, так и в полуавтоматическом режиме с привлечением администратора со стороны пользователя.'
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-03.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
:::
```

{% endcut %}

Результат отображения:

::: page-constructor
blocks:
  - type: 'filter-block'
    centered: true
    title:
      text: 'Нам доверяют'
    tags:
      - id: 'one'
        label: 'DoubleСloud'
      - id: 'two'
        label: 'Yandex Support'
      - id: 'three'
        label: 'Yandex Cloud'
      - id: 'four'
        label: 'YDB'
      - id: 'five'
        label: 'CatBoost'
    colSizes:
      all: 12
      xl: 12
      md: 12
      sm: 12
    indent:
      top: s
      bottom: m
    items:
      - tags:
          - 'one'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/diplodoc-tab-1.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://double.cloud/docs/en/'
                theme: 'normal'
                arrow: true
                color: #54BA7E

      - tags:
          - 'two'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-trust-support.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://yandex.ru/support2/audience/ru/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'three'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-yandex-cloud.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://cloud.yandex.ru/docs/compute/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'four'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-ydb.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://ydb.tech/en/docs/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
      - tags:
          - 'five'
        card:
          type: 'layout-item'
          media:
            image: 'https://storage.yandexcloud.net/cloud-www-assets/pages/index-diplodoc/ddos-index-trust-yandex-cat.png'
            disableCompress: true
          border: true
          content:
            links:
              - text: 'Посмотреть документацию'
                url: 'https://catboost.ai/en/docs/'
                theme: 'normal'
                arrow: true
                color: #54BA7E
  - type: 'card-layout-block'
    title: 'Как это работает?'
    colSizes:
      all: 12
      md: 4
      sm: 6
    indent:
      top: s
      bottom: xl
    children:
      - type: 'layout-item'
        content:
          title: 'Архитектура'
          text: 'Платформа Diplodoc имеет клиент-серверную архитектуру: серверная часть состоит из компонентов на Node.js, которые генерируют и отображают документационные проекты. Такая архитектура обеспечивает надёжность и горизонтальное масштабирование в случае необходимости.  '
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-01.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
      - type: 'layout-item'
        content:
          title: 'Интеграция с GitHub'
          text: 'Платформа Diplodoc имеет сквозную интеграцию с GitHub для обеспечения простого и стабильного механизма сборки и развёртывания документационных проектов. GitHub используется как хранилище исходного кода для документов и исполнения пайплайна проекта.'
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-02.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
      - type: 'layout-item'
        content:
          title: 'Развёртывание'
          text: 'Компании – пользователи сервиса Diplodoc используют встроенные механизмы выкладки документационного проекта с последующей их индексацией и отслеживанием версий. Документы могут обновляться как в автоматическом, так и в полуавтоматическом режиме с привлечением администратора со стороны пользователя.'
        media:
          image: 'https://storage.yandexcloud.net/diplodoc-www-assets/pages/index-diplodoc/ddos-index-item-01-03.png'
          disableCompress: true
        fullScreen: true
        border: true
        disableCompress: true
:::
