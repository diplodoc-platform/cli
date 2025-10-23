# Page 1

This is page 1 at level 1.

## Include from level1

{% include [level1-include](includes/level1-include.md) %}

## Include from root

{% include [root-include](../includes/root-include.md) %}

## Include from level2

{% include [level2-include](level2/includes/level2-include.md) %}

## Links to different levels

[Link to index](../index.md)

[Link to level2](level2/page2.md)

## Nested include

{% include [nested-include](../includes/nested-include.md) %}

## Include with anchor

{% include [fragment](../includes/fragments.md#subsection21) %}