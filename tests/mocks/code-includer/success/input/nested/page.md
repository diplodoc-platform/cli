# Code directive

- Included into a list:

  {% code "./examples/local.ts" lang="typescript" lines="[BEGIN local]-[END local]" %}

Included from the input root by legacy markers:

{% code "/examples/root.ts" lines="[BEGIN example]-[END example]" %}

Indentation is preserved:

{% code "./examples/indented.txt" lang="text" keep-indents %}

Named regions with nested markers in both formats:

{% code "./examples/regions.ts#outer" lang="typescript" %}

{% code "./examples/regions.ts#inner-v2" lang="typescript" %}

A fenced example is not executed:

````markdown
{% code "./missing-example.ts" %}
````
