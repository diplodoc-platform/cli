# Media

## Images {#images}

{% note warning %}

Images should be stored in a directory whose name starts with `_`. Otherwise, they will be deleted when making a build.

{% endnote %}

The standard markup for inserting an image is:

```
![alt-text](_images/image.png "hint_text" =100x100)
```

  * `alt-text`: Alternative image text.
  * `_images/image.png`: The URL or path to the image file.
  * `"hint_text"`: A hint that will be displayed when you hover over the image. Optional.
  * `=100x100`: The image size. Optional.

    {% note tip %}

    If you want to keep the aspect ratio of your image, only specify its width: `100x`.

    {% endnote %}

### Images as links {#image-link}

```markdown
[![An old rock in the desert](../../_images/mountain.jpg "Mountain" =100x200)](https://yandex.com/images/search?text=mountain)
[![An old rock in the desert](../_images/1.svg "svg inline false" =100x200){inline=false}](https://yandex.com/images/search?text=mountain)
[![An old rock in the desert](../_images/1.svg "svg inline true" =100x200){inline=true}](https://yandex.com/images/search?text=mountain)
```

**Result**

[![An old rock in the desert](../../_images/mountain.jpg "Mountain" =100x200)](https://yandex.com/images/search?text=mountain)
[![An old rock in the desert](../_images/1.svg "svg inline false" =100x200){inline=false}](https://yandex.com/images/search?text=mountain)
[![An old rock in the desert](../_images/1.svg "svg inline true" =100x200){inline=true}](https://yandex.com/images/search?text=mountain)

### Reference-style markup for images {#reference-style}

```markdown
![An old rock in the desert][image1]

[image1]: ../../_images/mountain.jpg "Mountain"
```

**Result**

![An old rock in the desert][image1]

[image1]: ../../_images/mountain.jpg "Mountain"
## Videos {#video}

To add videos to a page, use markup:

```markdown
@[video_hosting_site_name](video_id_or_link_to_video)
```

To review the style options and list of available video hosting services, see the [markdown-it-video](https://www.npmjs.com/package/markdown-it-video) plugin page.

