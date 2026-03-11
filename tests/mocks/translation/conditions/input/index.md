[existing file](./exists.md)
<!-- [missed file](./missed.md) -->
{% if prod == true %}Test text{% endif %}

{% if inner == true %}inner test text{% endif %}

{% if prod == true %}Test text{% if inner == true %}inner test text{% endif %}{% endif %}

{% if prod == true %}

    {% if list contains "item" %}

    #### List

    {% if item == true %}1. Item {% endif %}

    Some text

    {% endif %}

{% endif %}

#### Standalone contains condition

{% if list contains "item" %}

    #### List

{% endif %}

#### Inline contains condition

{% if  prod == true %}

    #### List {% if list contains "item" %} sub text {% endif %}

{% endif %}
