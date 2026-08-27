# Quick start

## Preparation {#prepare}

- Install [Node.js](https://nodejs.org/en/download) v22 or higher.

- Install a text editor, such as [VS Code](https://code.visualstudio.com/).

- Install the [Diplodoc CLI](tools/docs/index.md) package by running the command `npm i @diplodoc/cli -g` in the terminal.

## Creating a project {#create}

{% list tabs group=create-mode %}

- Via the console

    Using the command `yfm init`, you can create a project in the desired folder via the console.
    
    A separate page describes the [project initialization parameters](./tools/docs/init.md).

- Using a template

    You can use the [test project template](https://github.com/diplodoc-platform/static-template) from our repository.

    {% include [github-warning](./_includes/github-warning.md) %}

    Fork the template repository to quickly deploy your documentation:

    1. On the [template page](https://github.com/diplodoc-platform/static-template), next to the title, click the **Fork** button. The **Create a new fork** page will open.

    1. Click **Create fork**. A repository with a ready-made project structure will be created in your GitHub profile.

    1. Clone the created repository to your computer.

    **Project structure**

    ```text
    doc-folder
    |-- .yfm # Файл конфигурации
    |-- toc.yaml # Оглавление
    |-- index.md # Разводящая страница
    |-- content-page.md # Страница с контентом
    ```

    - [Configuration file .yfm](./settings.md).
    - [Leading page](./project/leading-page.md).
    - Pages with content.
    - [Table of contents file toc.yaml](./project/toc.md).

    For more details about parameters and configuration, see the section [**Documentation project**](./project/index.md).

{% endlist %}

## Building a project {#build}

The build is performed using the yfm console utility and the command `yfm build`.

To build the project, run the command:

```bash
yfm build -i ./doc-folder -o ./output-folder
```

Where:
- `-i` — path to the project directory (for example, the folder you cloned).
- `-o` — path to the directory where static HTML files will be saved.

After successful execution, a folder with the ready HTML project will appear.

## Running a local server {#local-server}

To view the build result in a browser, use a local web server.

1. Build the project:
   
    ```bash
    yfm build -i ./doc-folder -o ./output-folder
    ```

    {% note tip %}
    
    Use watch mode. To do this, add the flag `--watch` so that changes are immediately reflected in the local build.

    ```
    yfm build -i ./doc-folder -o ./output-folder --watch
    ```

    {% endnote %}

2. Run a server for the folder with the build result using the package `http-server`:

    ```bash
    npx http-server ./output-folder -p 5005
    ```

The documentation will be available at [http://localhost:5005](http://localhost:5005).

## Publishing on GitHub Pages {#gh-pages}

1. Go to your documentation repository on GitHub, open the **Settings** tab, and select **Pages** in the left menu.

1. In the **Build and deployment** section, select **GitHub Actions** from the dropdown list.

1. In the appeared block **Static HTML**, click **Configure**. The GitHub Actions window will open.

1. In the `workflow` file, find the `jobs` block and after the line `uses: actions/configure-pages@v5` add:

    ```yaml
    - name: Build docs
      uses: diplodoc-platform/docs-build-static-action@v1
      with:
        src-root: './docs'
        build-root: './docs-html'
    ```

1. In the same file, find the `Upload artifact` step and change the path to the directory with the built documentation:

    ```yaml
    - name: Upload artifact
      uses: actions/upload-pages-artifact@v3
      with:
        path: './docs-html'
    ```

1. In the upper-right corner, click **Commit changes...**, in the **Commit message** field specify the commit message and click **Commit changes**.

1. Go to the **Actions** tab. At the top of the list, you will see your latest commit.

1. Click on the commit name. After the build completes, the document will be published on GitHub Pages. You can view it via the link below under the **deploy** label.


## Publishing on diplodoc.com {#diplodoc}

{% include [github-warning](./_includes/github-warning.md) %}

1. Go to the website [diplodoc.com](https://diplodoc.com/) and click the **Start** button.

1. Follow the instructions provided on the page.

1. On your GitHub page, a repository `diplodoc-example` will be automatically created and a link to the documentation example will be generated.

{% note info %}

To change the default repository name `diplodoc-example`, [contact us](https://diplodoc.com/#contact).

{% endnote %}
