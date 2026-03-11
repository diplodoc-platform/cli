# Document with inline includes

Standalone include (should be inlined):

{% include [note](_includes/snippet.md#note) %}

Inline in text (should fallback): See {% include [note](_includes/snippet.md#note) %} for details.

Standalone table include (should be inlined):

{% include [table](_includes/snippet.md#table) %}
