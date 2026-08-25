# Simple tables

Tables with syntax similar to tables in GitHub Flavored Markdown. This format is suitable for tables with single-line content in cells.

In simple table cells, you can use [inline formatting](../base.md#line), [links](../links.md), [inline code fragments](../code.md#inline), [images](../media.md#images).

{% note tip %}

For quick table creation, you can use online generators. For example, [Tables Generator](https://www.tablesgenerator.com/markdown_tables).

{% endnote %}

## Syntax

A table consists of:
* a header row;
* a separator row;
* data rows.

The header row is separated from the table cells by three or more `-` characters. Columns are separated by `|` characters.

```markdown
| Заголовок1  | Заголовок2  |
| ----------- | ----------- |
| Текст       | Текст       |
| Текст       | Текст       |
```

**Result:**

| Header1  | Header2  |
| ----------- | ----------- |
| Text       | Text       |
| Text       | Text       |



## Text alignment

Use the `:` character in the separator row to align text in columns to the left, right, or center.

```markdown
| По левому краю  | По центру        | По правому краю |
| :---            |      :----:      |            ---: |
| Текст           | Текст            | Текст           |
| Текст           | Текст            | Текст           |
```

**Result:**

| Left-aligned  |     Centered    | Right-aligned |
| :---            |      :----:      |            ---: |
| Text           | Text            | Text           |
| Text           | Text            | Text           |



## Opening wide tables in a modal window

Wide tables are convenient to open in a modal window. In simple tables, this is implemented using the `{wide-content title="table title"}` attribute. The attribute must be added after the table, leaving one empty line between them.

```markdown
| Заголовок1  | Заголовок2  |
| ----------- | ----------- |
| Текст       | Текст       |
| Текст       | Текст       |

{wide-content title="Название таблицы"}
```

**Result**

| Header1  | Header2  |
| ----------- | ----------- |
| Text       | Text       |
| Text       | Text       |

{wide-content title="Table title"}

## Adding a "sticky header" to a table

You can add a "sticky header" to tables. To do this, add the `{sticky-header}` attribute after the table.

```markdown
| Заголовок1 | Заголовок2 |
| ---------- | ---------- |
| Текст      | Текст      |
| Текст      | Текст      |
| Текст      | Текст      |
...
| Текст      | Текст      |
| Текст      | Текст      |
| Текст      | Текст      |
| Текст      | Текст      |
| Текст      | Текст      |

{sticky-header}
```

**Result**

| Header1 | Header2 |
| ---------- | ---------- |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |
| Text      | Text      |

{sticky-header}
