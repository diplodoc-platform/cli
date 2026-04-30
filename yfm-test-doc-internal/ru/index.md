## Обращение к нескольким таблицам в одном запросе {#concat} {#each} {#range} {#like} {#filter} {#regexp}

::: page-constructor
blocks:
  - type: 'card-layout-block'
    colSizes:
      all: 12
      lg: 4
      md: 6
      sm: 12
      xl: 4
    indent:
      bottom: 'xs'
      top: 's'
    title: Документация ML Platform
    description: |

      {% note info %}

      Документация находится в разработке. Пока в ней мало разделов, но постепенно они будут пополняться.

      {% endnote %}

      &nbsp;

      Это документация про машинное обучение (ML) внутри Яндекса. Здесь описано, какие есть инструменты и как их использовать на разных этапах ML-разработки &mdash; от подготовки данных до инференса. Документация поможет ML-специалистам быстрее погрузиться в контекст и эффективно решать задачи.
    children:
      - type: 'basic-card'
        title: 'Начало работы'
        text: |
          Ознакомьтесь с инструментами платформы на примере MNIST
        border: 'shadow'
        controlPosition: 'content'
        url: 'https://docs.yandex-team.ru/quick_start/index.md'
        icon: '_images/icons/layout-header-cells.svg'

      - type: 'basic-card'
        title: 'Распределённое обучение'
        text: |
          - [Про чтение и запись в YT](distributed_training/yt_read_write_description)
        border: 'shadow'
        controlPosition: 'content'
        icon: '_images/icons/chart-area-stacked.svg'

      - type: 'basic-card'
        title: 'Запуск экспериментов в Underdeep ↗︎'
        text: |
          - [Быстрый старт в Python](https://docs.yandex-team.ru/underdeep/experiments/quickstart) &mdash; как создать первый эксперимент с помощью Python API
          - [Быстрый старт в Nirvana](https://docs.yandex-team.ru/underdeep/experiments/nirvana-quickstart) &mdash; как создать первый эксперимент из Nirvana
          - [Про доступы и роли](https://docs.yandex-team.ru/underdeep/experiments/roles)
        border: 'shadow'
        url: 'https://docs.yandex-team.ru/quick_start/index.md'
        controlPosition: 'content'
        icon: './_images/icons/thunderbolt-fill.svg'

      - type: 'basic-card'
        title: 'GPU ресурсы'
        text: |
          - [Где живут GPU](gpu_resources/gpu_homeplanet.md) &mdash; в каких кластерах YT доступны GPU карты
          - [Эффективное использование GPU](gpu_resources/effective_usage/index.md) &mdash; как оптимизировать ресурсы
        border: 'shadow'
        urlTitle: ''
        controlPosition: 'content'
        url: 'https://docs.yandex-team.ru/quick_start/index.md'
        target: ''
        animated: false
        icon: '_images/icons/arrows-3-rotate-left.svg'

      - type: 'basic-card'
        title: 'Кубики Nirvana'
        text: |
          - [PyDL](tools/pydl) &mdash; кубик для запуска распределённого обучения в YT
        border: 'shadow'
        controlPosition: 'content'
        icon: '_images/icons/rocket.svg'

      - type: content-layout-block
        size: s
        textContent:
          text: "\_"
:::

В стандартном SQL для выполнения запроса по нескольким таблицам используется [UNION ALL](#unionall), который объединяет результаты двух и более `SELECT`. Это не совсем удобно для сценария использования, в котором требуется выполнить один и тот же запрос по нескольким таблицам (например, содержащим данные на разные даты). В YQL, чтобы было удобнее, в `SELECT` после `FROM` можно указывать не только одну таблицу или подзапрос, но и вызывать встроенные функции, позволяющие объединять данные нескольких таблиц...
 
Тест123 поиска123

[Heading](lorem/#anchor-above)

[Block anchor](lorem/#my-anchor)

{% cut "cut1" %}

test cut w/out code

{% endcut %}

{% cut "cut2" %}

```
test cut w/ code
```

{% endcut %}

## Скобки

Test "еуые" еуые  «test»

$\displaystyle\frac{\sum\limits_{i=1}^{N}w_{i}\log\left(\displaystyle\frac{e^{a_{it_{i}}}}{ \sum\limits_{j=0}^{M - 1}e^{a_{ij}}} \right)}{\sum\limits_{i=1}^{N}w_{i}} { ,}$

## \\neq

$\displaystyle\frac{\frac{1}{M}\sum\limits_{i = 1}^N w_i \sum\limits_{j = 0}^{M - 1} [j = t_i] \log(p_{ij}) + [j \neq t_i] \log(1 - p_{ij})}{\sum\limits_{i = 1}^N w_i} { ,}$

[//]: # ([image1]: ../_images/mountain.jpg "Mountain")
![](_images/icons/layout-header-cells.svg)
![](_images/icons/chart-area-stacked.svg)
![](_images/icons/thunderbolt-fill.svg)
![](_images/icons/arrows-3-rotate-left.svg)
![](_images/icons/rocket.svg)


LOREM IPSUM DOLOR

