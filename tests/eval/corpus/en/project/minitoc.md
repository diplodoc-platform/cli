# Table of contents on the documentation page

The table of contents is a special menu that contains headings for convenient navigation through an article.

{% note warning %}

The table of contents includes headings up to the third level. Headings of the fourth level and above are not included in the table of contents.

{% endnote %}

The location of the table of contents depends on the type of device on which the documentation is opened.

{% list tabs accordion %}

- Devices with large screens

  If the documentation is opened on devices with large screens, such as a computer or laptop, the table of contents will be located on the right side of the documentation.

  ![](../_images/minitoc_desktop.jpg)

- Mobile devices

  If the documentation is opened on mobile devices, the table of contents will be hidden to save screen space.
  
  To show the table of contents, click the icon ![](../_images/minitoc_icon.jpg).

  ![](../_images/minitoc_mobile.jpg)

{% endlist %}

## Features of working with headings

### First-level heading

In YFM, a first-level heading is the page title, therefore:

- Such a heading is not included in the table of contents.
- An anchor cannot be attached to such a heading.

### The table of contents is not displayed on the page

The table of contents will not be displayed on the page if:

- one of the heading levels is skipped;

  ```markdown
  # Заголовок 1
  ### Заголовок 2
  #### Заголовок 3
  ```

- headings are not arranged in ascending order of levels;

  ```markdown
  # Заголовок 1
  ### Заголовок 2
  ## Заголовок 3
  ```