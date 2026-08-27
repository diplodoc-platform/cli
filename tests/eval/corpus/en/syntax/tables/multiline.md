# Multiline tables

Tables that support not only simple content inside cells, such as [inline formatting](../base.md#line), [links](../links.md), etc., but also complex content, for example, [lists](../lists.md), [code blocks](../code.md), and even other tables.

Multiline tables support [cell merging](#span).

## Syntax {#syntax}

* the table starts with `#|` and ends with `|#`;
* rows start and end with `||`;
* cells are separated by the `|` character.

{% note tip "Table headers" %}

Multiline tables do not contain headers, but they can be created by applying formatting to the content of the cells in the first row. For example, by making them bold.

You can also use the table attribute `header-rows` for semantic markup of header rows. For more details, see the section [Header rows](#header-rows).

{% endnote %}

```markdown
#|
|| **Заголовок1** | **Заголовок2** ||
|| Текст | Текст ||
|#
```

**Result:**

#|
|| **Header1** | **Header2** ||
|| Text | Text ||
|#

## Multiline text {#multirow}

You can place any multiline text in a table cell. For example, lists. 

```markdown
#|
||Текст
на двух строчках
|
- Текст 1
- Текст 2
- Текст 3
- Текст 4||
|#
```

**Result:**

#|
||Text
on two lines
|
- Text 1
- Text 2
- Text 3
- Text 4||
|#

Or even another table:

```markdown
#|
|| 1
|

Текст выше вложенной таблицы

#|
|| 5
| 6||
|| 7
| 8||
|#

Текст под вложенной таблицей||
|| 3
| 4||
|#
```

**Result**

#|
|| 1
|

Text above the nested table

#|
|| 5
| 6||
|| 7
| 8||
|#

Text below the nested table||
|| 3
| 4||
|#

## Table attributes {#attributes}

You can set attributes for a table at three levels: for the entire table, for an individual row, and for an individual cell.

| Level  | Syntax       | Where it is located                                                                |
| -------- | --------------- | -------------------------------------------------------------------------------- |
| Table  | `\|:{ ... }`    | On a separate line between `#\|` and the first row `\|\|`                          |
| Line   | `\|\|:{ ... }`  | On the same line as `\|\|`, immediately after it                                  |
| Cell   | `::{ ... }`     | At the beginning of the cell content, immediately after `\|` (or after `\|\|:{ ... }` for the first cell of a row) |

Attributes for the entire table are set on a separate line between `#|` and the first row `||`:

```markdown
#|
|:{header-rows="1"}
|| **Заголовок1** | **Заголовок2** ||
|| Текст | Текст ||
|#
```

Row attributes are set immediately after the opening `||`:

```markdown
#|
||:{class="header"} **Заголовок1** | **Заголовок2** ||
|| Текст | Текст ||
|#
```

Cell attributes are set at the beginning of its content. For the first cell of a row, immediately after `||` (or after the row attributes, if any), and for the rest, immediately after `|`:

```markdown
#|
||::{align="center"} **Заголовок1** | **Заголовок2** ||
|| Текст |::{align="top-right"} Текст ||
|#
```

{% note tip "Formatting rules" %}

- Each attribute block must be on the same line as its delimiter: a line break between `||` / `|` and the attribute block disables their recognition, and the text becomes part of the cell content.
- Spaces are not allowed between `||` and `:{` (row attributes).
- Spaces are not allowed between `|` and `::{` (cell attributes, except for the first cell of a row).
- After `||:{...}` before `::{...}` of the first cell on the same line, spaces and tabs are allowed.
- A line with table attributes (`|:{ ... }`) can occur multiple times between `#|` and the first line `||`; when keys match, later values override earlier ones.

{% endnote %}

## Header rows {#header-rows}

To mark the first N rows of a table as header rows, use the table attribute `header-rows="N"`. Header rows are rendered as `<th scope="col">` instead of `<td>`.

The value of `N` must be a positive integer.

```markdown
#|
|:{header-rows="1"}
|| Заголовок1 | Заголовок2 | Заголовок3 ||
|| Текст | Текст | Текст ||
|| Текст | Текст | Текст ||
|#
```

**Result**

#|
|:{header-rows="1"}
|| Header1 | Header2 | Header3 ||
|| Text | Text | Text ||
|| Text | Text | Text ||
|#

## Custom cell sizes {#size}

Cell sizes can be controlled using attributes.    

{% list tabs %}

- Cell width

  To set a custom cell width, use the syntax `{style="width: 400px"}` inside the cell. 

  ```markdown
  #|
  || **Заголовок1** {style="width: 400px"} | **Заголовок2** ||
  || Текст | Текст ||
  |#
  ```

  **Result**

  #|
  || **Header1** {style="width: 400px"} | **Header2** ||
  || Text | Text ||
  |#

- Cell height

  To set a custom cell height, use the syntax `{style="height:100px"}` inside the cell.

  ```markdown
  #|
  || **Заголовок1** {style="height:100px"} | **Заголовок2** ||
  || Текст | Текст ||
  |#
  ```

  **Result**

  #|
  || **Header1** {style="height:100px"} | **Header2** ||
  || Text | Text ||
  |#

{% endlist %}


## Merging cells {#span}

Cells can be merged vertically using a cell with the "^" character:

```markdown
#|
|| Заголовок1         | Заголовок2   ||
|| Текст на два ряда  | Другой текст ||
|| ^                  | Еще текст    ||
|#
```

**Result**

#|
|| Header1         | Header2   ||
|| Text spanning two rows  | Another text ||
|| ^                  | More text    ||
|#


Horizontal merging is supported via the ">" character:

```markdown
#|
|| Заголовок1            | Заголовок2   ||
|| Текст на две колонки  | >            ||
|| Другой текст          | Еще текст    ||
|#
```

**Result**

#|
|| Header1            | Header2   ||
|| Text spanning two columns  | >            ||
|| Another text          | More text    ||
|#

Cell merge characters can be used together:

```markdown
#|
|| Заголовок1                       | Заголовок2   | Заголовок3 || 
|| Текст на две колонки и два ряда  | >            | Текст      ||
|| ^                                | >            | Еще текст  ||
|#
```

**Result**

#|
|| Header1                       | Header2   | Header3 ||
|| Text spanning two columns and two rows  | >            | Text      ||
|| ^                                | >            | More text  ||
|#

### Escaping cell merge characters

To get a cell with one of the merge characters, you can use escaping with "\",
i.e. "\^" and "\>". 

```markdown
#|
|| Заголовок1                       | Заголовок2 | Заголовок3 || 
|| Текст на одну ячейку             | \>         | Текст      ||
|| \^                               | \>         | Еще текст  ||
|#
```

**Result**

#|
|| Header1                       | Header2 | Header3 ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|#

## Text alignment in cells {#cell-align}

To control the alignment of cell content, use the cell attribute `align`:

```markdown
#|
|| Заголовок1                              | Заголовок2 | Заголовок3 ||
||::{align="center"} Текст на две колонки и два ряда | >          | Текст      ||
|| ^                                       | >          | Еще текст  ||
|#
```

**Result**

#|
|| Header1                              | Header2 | Header3 ||
||::{align="center"} Text spanning two columns and two rows | >          | Text      ||
|| ^                                       | >          | More text  ||
|#

The following values are available:

- `top-left`
- `top-center`
- `top-right`
- `center`
- `bottom-left`
- `bottom-center`
- `bottom-right`

### Deprecated syntax {#cell-align-legacy}

{% note warning %}

Previously, the class syntax `{.cell-align-*}` was used for alignment inside the cell content. It still works for backward compatibility, but is considered deprecated — use the attribute `::{align="..."}` instead.

{% endnote %}

```markdown
#|
|| Заголовок1                                           | Заголовок2 | Заголовок3 ||
|| Текст на две колонки и два ряда {.cell-align-center} | >          | Текст      ||
|| ^                                                    | >          | Еще текст  ||
|#
```

Deprecated values:

- `cell-align-top-left`
- `cell-align-top-center`
- `cell-align-top-right`
- `cell-align-center`
- `cell-align-bottom-left`
- `cell-align-bottom-center`
- `cell-align-bottom-right`

## Opening in a modal window{#wide-content}

Wide tables are convenient to open in a modal window. In multiline tables, this is implemented using the attribute `{wide-content}`. The attribute is added immediately after the characters closing the table `|#`.

```markdown
#|
|| **Заголовок1** | **Заголовок2** ||
|| Текст | Текст ||
|| Текст | Текст ||
|| Текст | Текст ||
|# {wide-content}
```
**Result**

#|
|| **Header1** | **Header2** ||
|| Text | Text ||
|| Text | Text ||
|| Text | Text ||
|# {wide-content}

## Limiting table height{#sticky-header}

For simple and multiline tables, you can limit the height by adding the attribute `{sticky-header}`. If the table exceeds the screen size of the user's device, its header becomes fixed, the height is limited to the screen height, and the table content starts scrolling.

```markdown
#|
|| Заголовок1                       | Заголовок2 | Заголовок3 ||
|| Текст на одну ячейку             | \>         | Текст      ||
|| \^                               | \>         | Еще текст  ||
|| Текст на одну ячейку             | \>         | Текст      ||
...
|| \^                               | \>         | Еще текст  ||
|| Текст на одну ячейку             | \>         | Текст      ||
|| \^                               | \>         | **Еще текст**  ||
|#

{sticky-header}
```

#|
|| Header1                       | Header2 | Header3 ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | More text  ||
|| Text in one cell             | \>         | Text      ||
|| \^                               | \>         | **More text**  ||
|#

{sticky-header}
