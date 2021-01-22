**english** | [русский](https://github.com/yandex-cloud/yfm-docs/blob/master/DOCS.ru.md)
- - -

# YFM project structure

## Table of contents

- [Sample project structure](#example)
- [Table of contents](#toc)
    - [Inserting tables of contents](#tocIncludes)
- [Leading page](#page)
- [Declaring variables](#presets)
    - [Conditions for displaying sections](#conditionalOperatorWhen)
- [Configuration file](#config)

## Sample project structure <a name="example"></a>

For the most complete example of a YFM project, see the [Yandex.Cloud documentation](https://github.com/yandex-cloud/docs) source.

```
input-folder
|-- .yfm (YFM configuration file)
|-- toc.yaml (Navigation file)
|-- presets.yaml (A set of presets with variables)
|-- index.yaml (Documentation leading page)
|-- quickstart.md (Document files and images)
|-- pages
    |-- faq.md
    |-- how-to.md
|-- assets
    |-- image1.png
    |-- image2.png
|-- includes
    |-- faq_shared_block.md
```

## Table of contents <a name="toc"></a>

The document structure is described in a file named `toc.yaml`:

* Only the files listed in toc.yaml are processed when building the documentation.
* A document's table of contents is generated based on the toc.yaml file.

The `toc.yaml` file structure is a follows:

```yaml
- title: Document name
  href: index.yaml
- name: Section name
  href: path/to/file.md
  items:
    - name: Section group name
      items:
        - name: Section name
          href: path/to/file.md
        - name: Nested block name
          items:
            - name: Name of a section in the nested block
              href: path/to/some/file.md
    - name: Name of another section
      href: path/to/another/file.md
    - name: Conditionally included section
      href: path/to/conditional/file.md
      when: version == 12
    - name: Name of an imported block
      include:
        path: another/toc.yaml
```

* `title`: Document name. The name is displayed in the document's table of contents above the list of all sections.
* `name`: Block or section name.
* `href`: Relative path to the file with YFM content.
* `items`: Grouping element for individual sections. Grouped sections are displayed in a single block in the document's table of contents.
* `when`: [Conditional operator](#conditionalOperatorWhen). Lets you include separate sections or blocks in the document, depending on the values of variables.
* `include`: This element lets you [insert another table of contents](#tocIncludes) (a different `toc.yaml` file) as a subsection. It should contain the `path` child element named.
* `path`: Path to the table of contents to insert.

### Inserting tables of contents <a name="tocIncludes"></a>

You can include the table of contents of another document (a different `toc.yaml` file) as a subsection in your document. This way you can independently maintain separate sections and then build a document from large blocks. This can be useful, for example, if you support two versions of a document: a simplified help for users and a more complete administrator's guide.

## Leading page <a name="page"></a>

To quickly navigate a section, it's often more convenient to display a set of links to the main sections on the first screen rather than an overview text. With Yfm-docs, you can make them not just links, but easy-to-click tiles.

![Sample leading page](./docsAssets/leading.jpg)

The `index.yaml` file structure is a follows:

```yaml
# Header and description
title: "Billing in the cloud"
description: "Billing is a Yandex.Cloud service that lets you get information about the amount of resources used, monitor your costs, and pay for resources. In Yandex.Cloud, you only pay for resources consumed and the time they're in use.
# Meta information such as title, description, keywords, and so on (title tabs and different SEO tags)
meta:
  title: "Billing in the cloud"
  noIndex: true
# Block with links
links:
- title: "Getting started"
  description: "How to create your first VM"
  href: "#"
  when: version == 12
- title: "Basic operations"
  description: "Step-by-step instructions for setup, connect, and update operations"
  href: "#"
```
* `title`: Document name. The name is displayed in the document's table of contents above the list of all sections.
* `description`: Document description.
* `meta`: Meta information such as title, description, keywords, and etc.
* `links`: Grouping element for individual sections. Grouped sections are displayed like links on page.
  * `title`: Name of link.
  * `description`: Page description.
  * `href`: Relative path to the file with YFM content.
  * `when`: [Conditional operator](#conditionalOperatorWhen). Lets you include separate sections or blocks in the document, depending on the values of variables.

## Declaring variables <a name="presets"></a>

In YFM, you can declare and use [variables](https://github.com/yandex-cloud/yfm-transform/blob/master/DOCS.md#vars). When making a build, variables are substituted into the text of a document or used to calculate conditions. This is useful, for example, when building the documentation for different versions of a service from the same source files.

A set of variable values is declared in preset files named `presets.yaml`:

```yaml
default:
    position: The Wizard
internal:
    place: Emerald City
external:
    place: The Land of Oz
```

* Each preset file must contain a section named `default`.
* When calculating variables, values are taken from the `default` section and the section specified in the `varsPreset` parameter, with the latter taking precedence.

Presets are convenient, for example, if you build documentation in two modes: internal and external. Create a preset with `internal` and `external` sections and you won't need to store variable values in build scripts.

There may be multiple preset files. They are applied in order of decreasing priority: from the file closest to the one being converted to the file closest to the project root. We recommend using top-level presets.

**Example**

```
input-folder
|-- .yfm
|-- toc.yaml
|-- presets.yaml // 2
|-- index.yaml
|-- quickstart.md
|-- pages
    |-- presets.yaml // 1
    |-- faq.md
    |-- how-to.md
```

* When building a file named `faq.md`, the variable values declared in `presets.yaml` file 1 take priority over file 2.
* When building a file named `quickstart.md`, only the variable values declared in `presets.yaml` file 2 are taken into account.

### Conditions for displaying sections <a name="conditionalOperatorWhen"></a>

You can include separate sections or blocks in a document, depending on the values of [YFM variables](https://github.com/yandex-cloud/yfm-transform/blob/master/DOCS.md#vars). This is useful, for example, when building the documentation for different versions of a service from the same source files.

The display condition is described in the `when` parameter:

```when: version == 12```

Available comparison operators: ==, !=, <, >, <=, >=.

## Configuration file <a name="config"></a>

A project may contain a configuration file. By default, a `.yfm` file is used in the root of the project.

| Name | Description | Type | Default value |
| :--- | :--- | :--- | :--- |
| allowHTML | Shows whether it's allowed to use HTML | bool | false |
| varsPreset | Name of the preset used | string | 'default' |
| strict | Shows whether warnings are acceptable in yfm-transform logs | bool | false |
| ignore | List of files excluded from the build | [] | undefined |
| vars | Variables | {} | undefined |
| publish | Should upload output files to S3 storage | bool | false |
| storageEndpoint | Endpoint of S3 storage | string | undefined |
| storageBucket | Bucket name of S3 storage | string | undefined |
| storagePrefix | Root directory prefix of S3 storage | string | "" |
| storageKeyId | Access key id of S3 storage. Access secret key S3 storage must be provided in `YFM_STORAGE_SECRET_KEY` environment variable. | string | undefined |

```yaml
allowHTML: true
strict: true
varsPreset: "default"
ignore:
    "**/includes/*.md"
```
