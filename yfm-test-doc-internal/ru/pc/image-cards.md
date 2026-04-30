# Image Cards (тест вложенных ссылок)

Эта страница воспроизводит баг с вложенными `<a>` тегами в `ImageCard`.
Если текст карточек исчезает после загрузки картинок — баг не исправлен.

::: page-constructor
blocks:
  - type: card-layout-block
    title:
      text: "Карточки с url + links + image"
    children:
      - title:
          text: Начало работы
          textSize: s
        text: "Этот текст должен быть виден даже после загрузки картинки. Если текст исчезает — баг не исправлен."
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

      - title:
          text: Документация
          textSize: s
        text: "Второй card с картинкой — текст тоже должен оставаться видимым."
        url: diplodoc.yaml
        links:
          - text: Подробнее
            url: diplodoc.yaml
            theme: normal
            arrow: true
        image: https://yastatic.net/s3/doc-binary/freeze/axvIv-nUmcVRlDt554Zf2UzX6Zo.svg
        margins: s
        border: none
        type: image-card

      - title:
          text: Card без URL
          textSize: s
        text: "Карточка без ссылки — просто отображение. Не должна быть кликабельной."
        image: https://yastatic.net/s3/doc-binary/freeze/7VgOiqWdOqMEPIckegrWXJ8m8D0.svg
        margins: s
        border: shadow
        type: image-card
animated: false
:::
