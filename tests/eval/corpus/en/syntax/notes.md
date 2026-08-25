# Notes

A note is a highlighted block with important information.

Depending on the content, notes with different headings and formatting are used:
* ["Note"](#info) — additional information.
* ["Tip"](#tip) — a recommendation.
* ["Important"](#warning) — a caution.
* ["Alert"](#alert) — a restriction.
* A note with a custom heading.

Notes can include any YFM markup, but it is not recommended to overload them with elements. Choose simple formatting and do not use notes too often, as this will distract the user from the main content.

{% include [blank-lines](../_includes/blank-lines-note.md) %}

## Note {#info}

```markdown
{% note info %}

Это примечание.

{% endnote %}
```

**Result:**

{% note info %}

This is a note.

{% endnote %}

## Tip {#tip}
  
```markdown
{% note tip %}

Это совет.

{% endnote %}
```

**Result:**

{% note tip %}

This is a tip.

{% endnote %}

## Important {#warning}

```markdown
{% note warning %}

Это важная информация.

{% endnote %}
```

**Result:**

{% note warning %}

This is important information.

{% endnote %}
  
## Alert {#alert}

```markdown
{% note alert %}

Это предупреждение.

{% endnote %}
```

**Result:**

{% note alert %}

This is a warning.

{% endnote %}

## Custom heading {#title}

```markdown
{% note info "Свой заголовок" %}

Это заметка со своим заголовком.

{% endnote %}
```

**Result:**

{% note info "Custom heading" %}

This is a note with a custom heading.

{% endnote %}

```markdown
{% note info "" %}

Это заметка без заголовка.

{% endnote %}
```

**Result:**

{% note info "" %}

This is a note without a heading.

{% endnote %}
