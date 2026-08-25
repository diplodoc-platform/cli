# Links

The standard markup for a link looks like this:

```markdown
[текст_ссылки](ссылка 'текст_подсказки')
```

- `link_text` — explicit specification of the link text.
- `link` — URL or file path.
- `"tooltip_text"` — a tooltip that will be displayed when hovering over the link text. Optional parameter.

Depending on the type of link, simplifications and other formatting options are allowed.

## Opening in a new tab {#target}

By default, all relative links open in the current browser tab, and all absolute links open in a new tab. You can override this behavior using the `target` attribute.

Examples:

- `[text](link){target=_blank}` — will open in a new tab,
- `[text](link){target=_self}` — will open in the current tab.

## Link to an md file {#autotitle}

You can create a link to an md file without explicitly specifying the link text. To do this, add the character combination `{#T}` in place of the text, and it will be substituted automatically from the heading of the specified file.

```markdown
[{#T}](./index.md)
```

**Result**

[{#T}](./index.md)

## Link to a section in an md file {#auto-section-title}

You can link to:

- a section on the current page;

  `[text](#anchor)`

  **Result**

  [{#T}](#formatting)

- a section on another page.

  `[text](base.md#headers)`

  **Result**

  [{#T}](base.md#headers)

## Restriction of relative paths in HTML {#constraints}

In HTML links, use absolute paths from the documentation root.

Example:

```html
<a href="/root_folder/path_to_file">Ссылка</a>
```

## URL or email address {#url-email}

To convert a URL or email address into a link, add angle brackets `<>` on both sides.

```markdown
<https://yandex.com/>

<alice.the.girl@yandex.com>
```

**Result**

<https://yandex.com/>

<alice.the.girl@yandex.com>

## Reference-style markup for links {#reference-style}

Use reference-style links to make the source text of the document easier to read. Links of this type consist of two parts connected by labels:

- a brief description of the link in the text.

  `[link_text][link_label]`

- a long URL placed in a special location at the end of a paragraph or document.

  `[link_label]: URL`

```markdown
My favorite search engine is [Yandex][1].

[1]: https://yandex.com/ 'The best search engine'
```

**Result**

My favorite search engine is [Yandex][1].

[1]: https://yandex.com/ 'The best search engine'

## Link text formatting {#formatting}

You can apply [inline formatting](./base.md#line) to the link text.

```markdown
I love the **[Yandex Cloud](https://cloud.yandex.com)**.
This is the _[YFM Guide](https://yadocs.tech)_.
See the section on [`code`](#code).
Super [^men^](<https://en.wikipedia.org/wiki/Major_Grom_(2017_film)>).
```

**Result**

I love the **[Yandex Cloud](https://cloud.yandex.com)**.
This is the _[YFM Guide](https://yadocs.tech)_.
See the section on [`code`](#code).
Super [^men^](<https://en.wikipedia.org/wiki/Major_Grom_(2017_film)>).

## Links for downloading files {#files}

To provide files for download, upload them to an external storage.

Then use a link to the external source as a link to the file. You can use a special link with a file icon. After clicking such a link, the browser will start downloading the specified file to the device.

```markdown
{% file src="data:text/plain;base64,Cg==" name="empty.txt" %}
```
