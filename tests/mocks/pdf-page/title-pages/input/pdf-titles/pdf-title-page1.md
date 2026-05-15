### Pdf title page 1

Should be able to use variables {{test}}

Should be able to use link to other pages [test](../page1.md)

Should be able to use inlcudes 

{% include [test-include](../__includes/include1.md) %}

Should be able to resolve liquid syntax

{% if test == "pdf" %} should be visible {% endif %}