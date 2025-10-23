# Test Includes

This is a test page for various include scenarios.

## Include from root level

{% include [root-include](includes/root-include.md) %}

## Include from level1

{% include [level1-include](level1/includes/level1-include.md) %}

## Include from level2

{% include [level2-include](level1/level2/includes/level2-include.md) %}

## Include with missing file

<!-- {% include [missing](includes/missing.md) %} -->

## Include file that is in toc

[Link to toc-include](toc-include.md)

{% include [toc-include](toc-include.md) %}

## Links to different levels

[Link to level1](level1/page1.md)

[Link to level2](level1/level2/page2.md)

## Include with anchor

{% include [fragment](includes/fragments.md#section1) %}

## Include with multiple anchors

{% include [fragment](includes/fragments.md#section2) %}

## Include with paragraph anchor

{% include [fragment](includes/fragments.md#p1) %}

## Nested includes

{% include [nested](includes/nested-include.md) %}

## Deep nested includes

{% include [deep](includes/deep-include.md) %}

## Commented includes

<!-- {% include [commented](includes/commented-include.md) %} -->

## Include with variable substitution

{% include [user](includes/user.md) %}
## Include without title

{% include [no-title-include](includes/no-title-include.md) %}