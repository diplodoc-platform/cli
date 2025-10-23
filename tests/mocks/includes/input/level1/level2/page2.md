# Page 2

This is page 2 at level 2.

## Include from level2

{% include [level2-include](includes/level2-include.md) %}

## Include from level1

{% include [level1-include](../includes/level1-include.md) %}

## Include from root

{% include [root-include](../../includes/root-include.md) %}

## Links to different levels

[Link to index](../../index.md)

[Link to page1](../page1.md)

## Nested include

{% include [nested-include](../../includes/nested-include.md) %}

## Include with anchor

{% include [fragment](../../includes/fragments.md#section3) %}