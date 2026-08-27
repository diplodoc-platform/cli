# Code fragments

A code fragment can be added to the text or placed in a separate block.

## In text {#inline}

To add a code fragment to the text, use the ` character.

```markdown
`Фрагмент кода` в тексте.
```

**Result:**

`Code fragment` in text.

{% include [not_var](../_includes/not_var-info.md) %}

The prefix `not_var` works **only** for code fragments consisting of characters `.-|(),_`, `a-z`, `A-Z`, `0-9` and spaces.

{% note tip "Tip" %}

It is recommended to use no more than 100 characters, as text in such a fragment is not wrapped. For a larger number of characters, format the code as a separate block.

{% endnote %}

## As a separate block {#block}

To format a code fragment as a separate block, separate it from the rest of the text on both sides with ``` characters.

For syntax highlighting, specify the language in which the code is written in the opening line. For example:

````markdown
```sql
  price= '2000'
  size= '24'  
  color= 'primary'
  variant= 'detailed' 
```
````

{% cut "List of supported languages" %}

- apache;
- bash;
- coffeescript;
- cpp;
- cs;
- css;
- diff;
- go;
- http;
- ini;
- java;
- javascript;
- json;
- kotlin;
- less;
- lua;
- makefile;
- xml;
- markdown;
- nginx;
- objectivec;
- perl;
- php;
- plaintext;
- properties;
- python;
- ruby;
- rust;
- scss;
- shell;
- sql;
- swift;
- typescript;
- **yaml**.

{% endcut %}

You can find the full list of available languages in [GitHub](https://github.com/highlightjs/highlight.js/tree/master/src/languages).

### Displaying line numbers {#line-numbers}

If you need to enable line numbers in a code block, use the keyword `showLineNumbers`.

Usage example:

````markdown
```sql showLineNumbers
  price = '2000'
  size = '24'  
  color = 'primary'
  variant = 'detailed' 
```
````

**Result:**

```sql showLineNumbers
  price = '2000'
  size = '24'
  color = 'primary'
  variant = 'detailed'
```

### Line wrapping by default {#softwrap}

To enable soft wrap by default in a code block, use the keyword `wrap`.

Usage example:

````markdown
``` wrap
Очень длинная строка в блоке кода, которая точно не поместится в длину, если её искусственно не свернуть
```
````

**Result:**

``` wrap
Очень длинная строка в блоке кода, которая точно не поместится в длину, если её искусственно не свернуть
```

### Command line prefix {#prompt}

Use the parameter `prompt="<value>"` to exclude the command line prefix (`$`, `#`, `>>>`, `mysql>`, etc.) from selection and copying via the widget.

**Usage example:**

````markdown
```bash prompt="$"
$ npm install
$ npm run build
```
````

**Result:**

```bash prompt="$"
$ npm install
$ npm run build
```

{% note tip "Tip" %}

This feature is especially useful for **snippets**. If a code block contains only commands, without their output, the user can copy the entire content with one button and paste it into the terminal — without selecting lines individually.

{% endnote %}