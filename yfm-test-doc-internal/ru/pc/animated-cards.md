# Animated Cards (тест анимации)

Страница с `animated: true` — карточки должны появляться с анимацией при скролле.

::: page-constructor
blocks:
  - type: card-layout-block
    title:
      text: "Анимированные карточки"
    children:
      - title:
          text: Анимированная карточка
          textSize: s
        text: "Блок с animated: true — должен рендериться корректно и текст не должен исчезать."
        url: ../index.md
        links:
          - text: На главную
            url: ../index.md
            theme: normal
            arrow: true
        image: https://yastatic.net/s3/doc-binary/freeze/mjdqx2mTbiXcooZlEsOSuI77YaQ.svg
        margins: s
        border: none
        type: image-card

      - title:
          text: Ещё одна карточка
          textSize: s
        text: "Вторая анимированная карточка с другой иконкой."
        url: diplodoc.yaml
        links:
          - text: Diplodoc
            url: diplodoc.yaml
            theme: normal
            arrow: true
        image: https://yastatic.net/s3/doc-binary/freeze/axvIv-nUmcVRlDt554Zf2UzX6Zo.svg
        margins: s
        border: none
        type: image-card
animated: true
:::
