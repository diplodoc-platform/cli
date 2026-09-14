# Code directive

- Included into a list:

  {% code "./examples/local.ts" lang="typescript" lines="2-3" %}

Included from the input root by legacy markers:

{% code "/examples/root.ts" lines="[BEGIN example]-[END example]" %}

Indentation is preserved:

{% code "./examples/indented.txt" lang="text" keep-indents %}

A fenced example is not executed:

````markdown
{% code "./missing-example.ts" %}
````

A jsonpath directive is left for a downstream plugin:

{% code "./data.json" lang="json" jsonpath="$.value" %}
