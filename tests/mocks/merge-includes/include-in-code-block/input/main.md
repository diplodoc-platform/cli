# Main

Real include below — should be inlined:

{% include [glossary](_includes/glossary.md) %}

Steps:

1. Open the resource file.
1. Insert the include directive into the file:

    ```plaintext
    {% include notitle [glossary](_includes/glossary.md) %}
    [*glossary]: Magic line
    ```

1. Use the keys from glossary.

End of page.
