::: page-constructor
blocks:
  - type: header-block
    title: When 2
    description: 'Тестовый заголовок для проверки when 2'
    when: var1 == 'aboba'
:::


# Page 2

{% cut "Заголовок ката" %}

::: page-constructor
blocks:
  - type: header-block
    title: 'Cut block title'
    description: 'Cut block description'
    when: false
:::

{% endcut %}

{{ nav_text }}
