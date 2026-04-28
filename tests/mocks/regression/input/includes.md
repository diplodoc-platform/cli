Text

{% include [user](includes/user.md) %}

{% include [test](includes/test.md) %}

{% include [test](includes/fragments.md#f1) %}

{% include [test](includes/fragments.md#p1) %}

<!--{% include [For includes/deep.md](includes/deep.md) %}-->
{% include [For includes/deep.md](includes/deep.md) %}

^[?](*term)^

[[?](*term)](http://ya.ru)

[Term 1](*term1) [Term 2](*term2)

Link after include
[{#T}](./1.md#subtitle)

Autotitle include
<!-- [{#T}](includes/fragments.md#f3) -->

Link after include

[*term]: Test terms
[*term1]: {% include [test](includes/fragments.md#f3) %}
[*term2]: {% include [test](includes/fragments.md#f3) %}
