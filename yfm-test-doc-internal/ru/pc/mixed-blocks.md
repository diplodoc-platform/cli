# Смешанные блоки PC

Страница с разными типами блоков page-constructor для комплексного тестирования.

::: page-constructor
blocks:
  - type: card-layout-block
    title:
      text: "Image Cards + Background Cards"
    children:
      - title:
          text: Image Card с links
          textSize: s
        text: "Карточка с картинкой, URL и ссылками внутри."
        url: ../index.md
        links:
          - text: Перейти
            url: ../index.md
            theme: normal
            arrow: true
        image: https://yastatic.net/s3/doc-binary/freeze/mjdqx2mTbiXcooZlEsOSuI77YaQ.svg
        margins: s
        border: none
        type: image-card

      - type: background-card
        title: Background Card
        text: "Карточка с фоном для сравнения — она не должна иметь проблем с вложенными ссылками."
        background:
          src: https://yastatic.net/s3/doc-binary/freeze/YW7T6zIwYCAqeVPKIU-VuQQAPrs.svg
          disableCompress: true
        paddingBottom: m
        buttons:
          - text: Кнопка
            theme: outlined
            url: ../index.md
        border: none

  - type: card-layout-block
    title:
      text: "Layout Items"
    colSizes:
      all: 12
      md: 4
      sm: 6
    children:
      - type: layout-item
        content:
          title: Layout Item 1
          text: "Текст первого layout-item блока."
        media:
          image: https://yastatic.net/s3/doc-binary/freeze/dVlBUBZUj_IBkll5KRyJULly148.svg
        border: true

      - type: layout-item
        content:
          title: Layout Item 2
          text: "Текст второго layout-item блока."
        media:
          image: https://yastatic.net/s3/doc-binary/freeze/NfO_DyOi0PDF4RNI6qG_LT2NwQw.svg
        border: true

      - type: layout-item
        content:
          title: Layout Item 3
          text: "Текст третьего layout-item блока."
        media:
          image: https://yastatic.net/s3/doc-binary/freeze/2GpFrlIhIuQkFQ2cMlvVbE7-7OE.svg
        border: true
animated: false
:::
