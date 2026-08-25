---
description: How to install and connect Diplodoc extensions.
---

# Diplodoc extensions

Extensions are designed to add new capabilities to Diplodoc's functionality.

## Installation {#install}

Before using an extension, it must be loaded. This can be done using `npm` via the command `npm install ...` or by saving the extension files locally, which is also suitable for using [custom-developed](../dev/extensions-api.md) extensions.

Example — installing an extension for [connecting Algolia](../project/algolia.md):
```
npm install @diplodoc/algolia-extension
```

## Connection {#usage}

You can connect an extension to a project in one of two ways:

1. By specifying it in the project's `.yfm` file in the [parameter](../settings.md#extensions) ##extensions##:
    ```yaml
    extensions:
        - @diplodoc/algolia-extension
        - /local/path/to/extension
    ```
2. By passing it via the `-e` parameter when calling `yfm`:
    ```
    yfm build -e @diplodoc/algolia-extension
    ```

{% note info %}

If an extension is specified for connection but is unavailable, the `yfm` command will be executed with an error.

If an extension is not connected when running the yfm command, but is necessary for correct project processing, the `yfm` command may be executed with a correct response code, but with an unpredictable result.

{% endnote %}

## Built-in extensions {#built-in}

Diplodoc includes several extensions as examples of the Extensions API:

#|
|| **Name** | **Description** ||
||
`github-vcs`
|
Retrieves information about the [modification date](../settings.md#vcs-mtimes) and [authors](../settings.md#vcs-authors) from a Github repository when building a project for placement in article content.
||
||
`mdit-plugins`
|
Adds [additional plugins](../plugins/index.md) to the markdown-it parser to expand documentation markup capabilities.
||
|#