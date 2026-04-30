---
neuroExpert:
  disabled: true

yafeedback:
  disabled: true
---

aboba 123
45678
9101112

{% include [Описание](./_includes/test.md) %}

1. a
2. b

{% list tabs %}

- c1
  1. x
  2. y


- c2
  1. d
  2. e

{% endlist %}

some text

1. a
   1. b
   1. c
1. d

{% cut "cut1" %}

1. a
2. b

{% endcut %}

{% cut "cut2" %}

1. c
2. d

{% endcut %}
