# Popups (tooltips)

The syntax for definitions is as follows:

```
Использование [термина](*ключ_термина) в тексте.

[*ключ_термина]: Определение термина или сокращения.
Определение термина может включать в себя _базовую_ разметку.
```

Terms should be defined **at the very end of the page**. There must be an empty line between them.

```
[*ключ_термина_1]: Определение термина 1.

[*ключ_термина_2]: Определение термина 2.
```

**Result**

Using a [term](*term) in the text.

{% note info %}

Currently, using popups in code blocks is only possible if the code block does not have a language specified.

{% endnote %}

![Example of how a popup is displayed](../_images/terms_sample.png)

### Reuse {#reusing}

Place the contents of the popups in a separate file under a fourth-level heading. Format the heading as an [anchor](base.md#anchor).

Include the popup text by applying `include`. [Learn more about using `include`](../syntax/includes.md).

{% cut "Example file" %}

```markdown
#### {#popup-1}

Таблица

#|
|| **Заголовок таблицы** | > ||
|| Текст | Текст ||
|| Текст | Текст ||
|#


#### {#popup-2}


{% cut "Кат со списком внутри" %}

1. Пункт списка
1. Пункт списка
1. Пункт списка

{% endcut %}
```

{% endcut %}


{% cut "Example of [reuse](../syntax/includes.md)" %}

```
[*popup-1]: {% include notitle [popup_1](../_includes/popups_examples.md#popup-1) %}

[*popup-2]: {% include notitle [popup_2](../_includes/popups_examples.md#popup-2) %}
```

{% endcut %}


**Result**

[First definition](*popup-1) in the text. [Second definition](*popup-2) in the text

[*term]: Definition of a term or abbreviation.
A _term_ definition can **include** [basic markup](base.md):
* lists;
* links;
* images, etc.

[*popup-1]: {% include notitle [popup-1](../_includes/popups_examples.md#popup-1) %}

[*popup-2]: {% include notitle [popup-2](../_includes/popups_examples.md#popup-2) %}
