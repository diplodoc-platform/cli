# Lists

The following types of lists are distinguished:
* numbered — for describing a sequence of actions;
* bulleted — for listing equivalent items whose order is not important;
* definition list — for creating glossaries.

Lists of each type may include any markup elements and nested items.

## Numbered list {#numbered}

To format a numbered list, use digits with the symbol `.`  or `)`. Numbering is performed dynamically during assembly, so the order of digits is not important.

```markdown
1. Первый пункт.
1. Второй пункт.
1. Третий пункт.
```

**Result:**

1. First item.
1. Second item.
1. Third item.


## Bulleted list {#marked}

To format a bulleted list, use the symbols `*`, `-` or `+`.


```markdown
* Пункт списка.
* Пункт списка.
* Пункт списка.
```

**Result:**

* List item.
* List item.
* List item.

## Definition list {#terms}

To format a definition list, use the symbol `:`.

```markdown
Термин 1

:   Определение 1

Термин 2

:   Определение 2
```

**Result:**

Term 1

:   Definition 1

Term 2

:   Definition 2




## Nested lists {#sublist}

To create a nested list, add an indent (from two to five spaces) before the items of the child list. The recommended indent size is four spaces.

```markdown
1. Первый пункт.
    1. Вложенный пункт.
    1. Вложенный пункт.
1. Второй пункт.
```

**Result:**

1. First item.
    1. Nested item.
    1. Nested item.
1. Second item.

```markdown
* Пункт списка.
    * Вложенный пункт.
    * Вложенный пункт.
* Пункт списка.
```

**Result:**

* List item.
    * Nested item.
    * Nested item.
* List item.

```
Термин 1

:   Определение 1
    
    Термин 1.1

    :   Определение 1.1

Термин 2

:   Определение 2
```

**Result:**

Term 1

:   Definition 1
    
    Term 1.1

    :   Definition 1.1

Term 2

:   Definition 2
