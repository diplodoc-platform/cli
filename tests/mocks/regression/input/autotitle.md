# Autotitles

Empty title
[](./1.md)

Empty subtitle
[](./1.md#subtitle)

Special title
[{#T}](./1.md)

Special subtitle
[{#T}](./1.md#subtitle)

Empty local title
[](#header)

Special local title
[{#T}](#header)

Circular title
[{#T}](./autotitle.md#header)

Autotitle from include
<!-- [{#T}](includes/fragments.md#f3) -->

Include with autotitle
<!-- {% include [test](includes/fragments.md#f4) %} -->

link with [some local term1](*term1-1)

{% list tabs %}

- Название таба 1

  Текст таба 1.

  * Можно использовать списки.
  * И **другую** разметку.

- Название таба 2

  Текст таба 2.

{% endlist %}

All fragments

{% include [test](includes/fragments.md) %}


## Header {#header}

Content2

{% include [test](includes/styles.md) %}

[*term1-1]: {% include [test](includes/fragments.md#f3) %}