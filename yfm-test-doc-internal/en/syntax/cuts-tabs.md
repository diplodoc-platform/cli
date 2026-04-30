# Cuts and tabs

With YFM extensions, you can use interactive markup elements: cuts and tabs.

{% note info %}

The content of cuts and tabs can include any YFM markup.

{% endnote %}

## Cuts {#cuts}

Use cuts to hide content. For example, additional information or long blocks of code.

```markdown
{% cut "Cut header" %}

Content displayed when clicked.

{% endcut %}
```

**Result**

{% cut "Cut header" %}

Content displayed when clicked.

{% endcut %}

## Tabs {#tabs}

Use tabs for mutually exclusive sections. For example, to separate instructions for different operating systems.

To display tabs correctly, separate them with empty lines:

* `{% list tabs %}` and `{% endlist %}`.
* The text of one tab and the name of the next tab.

```markdown
{% list tabs %}

- The name of tab1

  The text of tab1.

  * You can use lists.
  * And **other** markup.

- The name of tab2

  The text of tab2.

{% endlist %}
```

**Result**

{% list tabs %}

- Name of tab1

  The text of tab1.
  * You can use lists.
  * And **other** markup.

- Name of tab2

  The text of tab2.

{% endlist %}

{% endcut %}

