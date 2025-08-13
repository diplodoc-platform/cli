Text

{% include [user](includes/user.md) %}

{% include [test](includes/test.md) %}

Link after include
[{#T}](./1.md)

<!--{% include [For includes/deep.md](includes/deep.md) %}-->
{% include [For includes/deep.md](includes/deep.md) %}

Include with big indent

{% include [For includes/deep.md](includes/deepWithIndent.md) %}

Include as codeblock

    {% include [As code block](included-item.md) %}

```
  {% include [As fence code block](included-item.md) %}
```

:   Include as deflist
    {% include [As deflist](included-item.md) %}

Link after include
[{#T}](./1.md#subtitle)

[*popup-1]: {% include notitle [popup_1](included-item.md) %}
