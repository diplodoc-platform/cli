# Variables and templating

## Variables

You can declare a variable in one of the following ways:

- pass it in the settings when [building documentation](../tools/docs/index.md#use);
- describe it in the [variable presets file](../project/presets.md).

Below are the options for using variables in a document.

## Substitutions {#subtitudes}

To substitute a variable value into text, enclose its name on both sides with double curly braces.

```
Какой-то текст {{ имя_переменной }} продолжение текста.
```

{% include [not_var](../_includes/not_var-info.md) %}

```
Какой-то текст not_var{{ тоже_текст }} продолжение текста.
```

## Conditional operators {#conditions}

{% note warning %}

To use conditional operators, set the `conditionsInCode` parameter to `true` in the [.yfm configuration file](../settings.md).

{% endnote %}

You can use the conditional operators `if`, `else`, and `elsif` to include specific text fragments in a document depending on variable values. For example, to build two versions of a document for different operating systems.

```markdown translate=no
{% if  OS == 'iOS' %}

Скачайте приложение в [App Store](https://www.apple.com/ios/app-store/).

{% else %}

Скачайте приложение в [Google Play](https://play.google.com).

{% endif %}
```

Conditional operators can be applied not only to text blocks but also to text fragments within lines.

```markdown
Какой-то текст {% if  OS == 'iOS' %} Apple {% else %} Android {% endif %} продолжение текста.
```

### Supported constructs

Comparison operators: `== , != , > , < , >= , <=`

Logical operators: `and , or`

The `contains` operator:

- for string A, checks that it contains substring B
  ```
  {% if Object.title contains 'API' %}
  ```
- for array A, checks that it contains element B
  ```
  {% if keywords contains 'Extension' %}
  ```

## Loops {#cycles}

Use loops to output repeated content for each element of an array. Inside a loop, refer to an element as a regular variable using the syntax for [substitution](#subtitudes).

```
{% for имя_переменной in имя_массива %}

Какой-то текст {{ имя_переменной }} продолжение текста.

{% endfor %}
```

{% cut "Examples of using loops" %}

Suppose the [variable presets file](../project/presets.md) defines an array `users`:

```yaml
default:
  users:
    - Alice
    - Mark
```

Then using loops will produce the following results:

```markdown translate=no
Prefix {% for user in users %} not_var{{user}} {% endfor %} Postfix
```

Prefix Alice Mark Postfix

```markdown translate=no
Prefix

{% for user in users %}

not_var{{user}}

{% endfor %}

Postfix
```

Prefix
Alice
Mark
Postfix

{% endcut %}

## Filters {#filters}

To apply a filter, add the operator `|` and the filter name to the variable. The operator is separated by spaces on both sides.

| Filter       | Description                                                         |
| ------------ | ------------------------------------------------------------------- |
| `capitalize` | Converts the first letter found in the variable value to uppercase. |
| `length`     | Calculates the length of the variable value.                        |

{% cut "Examples of using filters" %}

Suppose the [variable presets file](../project/presets.md) defines:

```yaml translate=no
default:
  user:
    name: alice
  users:
    - Alice
    - Mark
```

Then using filters will produce the following results:

```markdown translate=no
Hello not_var{{ user.name | capitalize }}!
```

Hello Alice!

```markdown translate=no
not_var{{ users | length }}

not_var{{ user.name | length }} | length
```

2

5

{% endcut %}

## Functions {#functions}

To call a function, add the character `.` to the variable, specify its name, and pass the required parameters in parentheses `()`.

The function `slice(beginIndex, endIndex)` returns the specified part of the original array as a new array object.
Parameters:

- `beginIndex` — the index of the element from which the extraction starts (numbering starts at 0).
- `endIndex`— the index of the element at which the extraction ends (numbering starts at 0).
  If the parameter is not specified, all elements from the starting position to the end of the array are selected.

{% cut "Examples of using functions" %}

Let the following be set in the [variable presets file](../project/presets.md):

```yaml
default:
  user:
    name: Masha
```

Then using the functions will lead to the following results:

```markdown
Hello Pnot_var{{ user.name.slice(1) }}!

Hello Pnot_var{{ user.name.slice(1, 2) }}vel!
```

Hello Pasha!

Hello Pavel!

{% endcut %}
