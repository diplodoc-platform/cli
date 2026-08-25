# Быстрый старт

## Подготовка {#prepare}

- Установите [Node.js](https://nodejs.org/en/download) v22 или выше.

- Установите текстовый редактор, например [VS Code](https://code.visualstudio.com/).

- Установите пакет [Diplodoc CLI](tools/docs/index.md), выполнив в терминале команду `npm i @diplodoc/cli -g`.

## Создание проекта {#create}

{% list tabs group=create-mode %}

- Через консоль

    С помощью команды `yfm init` можно создать проект в нужной папке через консоль.
    
    На отдельной странице описаны [параметры инициализации проекта](./tools/docs/init.md).

- Использование шаблона

    Вы можете использовать [шаблон тестового проекта](https://github.com/diplodoc-platform/static-template) из нашего репозитория.

    {% include [github-warning](./_includes/github-warning.md) %}

    Сделайте форк репозитория шаблона, чтобы быстро развернуть свою документацию:

    1. На [странице шаблона](https://github.com/diplodoc-platform/static-template) рядом с заголовком нажмите кнопку **Fork**. Откроется страница **Create a new fork**.

    1. Нажмите **Create fork**. В вашем профиле GitHub будет создан репозиторий с готовой структурой проекта.

    1. Склонируйте созданный репозиторий на свой компьютер.

    **Структура проекта**

    ```text
    doc-folder
    |-- .yfm # Файл конфигурации
    |-- toc.yaml # Оглавление
    |-- index.md # Разводящая страница
    |-- content-page.md # Страница с контентом
    ```

    - [Конфигурационный файл .yfm](./settings.md).
    - [Разводящая страница](./project/leading-page.md).
    - Страницы с контентом.
    - [Файл оглавления toc.yaml](./project/toc.md).

    Подробнее о параметрах и конфигурации читайте в разделе [**Документационный проект**](./project/index.md).

{% endlist %}

## Сборка проекта {#build}

Сборка выполняется с консольной утилиты yfm и команды `yfm build`.

Чтобы собрать проект, выполните команду:

```bash
yfm build -i ./doc-folder -o ./output-folder
```

Где:
- `-i` — путь до директории проекта (например, папка, которую вы склонировали).
- `-o` — путь до директории, куда будут сохранены статические HTML-файлы.

После успешного выполнения появится папка с готовым HTML-проектом.

## Запуск локального сервера {#local-server}

Чтобы посмотреть результат сборки в браузере, используйте локальный веб-сервер.

1. Соберите проект:
   
    ```bash
    yfm build -i ./doc-folder -o ./output-folder
    ```

    {% note tip %}
    
    Используйте watch-режим. Для этого добавьте флаг `--watch`, чтобы изменения сразу отображались в локальной сборке.

    ```
    yfm build -i ./doc-folder -o ./output-folder --watch
    ```

    {% endnote %}

2. Запустите сервер для папки с результатом сборки с помощью пакета `http-server`:

    ```bash
    npx http-server ./output-folder -p 5005
    ```

Документация будет доступна по адресу [http://localhost:5005](http://localhost:5005).

## Публикация на GitHub Pages {#gh-pages}

1. Перейдите в репозиторий вашего документа на GitHub, откройте вкладку **Settings** и в меню слева выберите **Pages**.

1. В разделе **Build and deployment** в выпадающем списке выберите **GitHub Actions**.

1. В появившемся блоке **Static HTML** нажмите **Configure**. Откроется окно GitHub Actions.

1. В файле `workflow` найдите блок `jobs` и после строки `uses: actions/configure-pages@v5` добавьте:

    ```yaml
    - name: Build docs
      uses: diplodoc-platform/docs-build-static-action@v1
      with:
        src-root: './docs'
        build-root: './docs-html'
    ```

1. В том же файле найдите шаг `Upload artifact` и измените путь на каталог с собранной документацией:

    ```yaml
    - name: Upload artifact
      uses: actions/upload-pages-artifact@v3
      with:
        path: './docs-html'
    ```

1. В правом верхнем углу нажмите **Commit changes...**, в поле **Commit message** укажите сообщение коммита и нажмите **Commit changes**.

1. Перейдите на вкладку **Actions**. Вверху списка будет ваш последний коммит.

1. Нажмите на название коммита. После завершения сборки документ будет размещен на GitHub Pages. Посмотреть его можно по ссылке ниже под надписью **deploy**.


## Публикация на diplodoc.com {#diplodoc}

{% include [github-warning](./_includes/github-warning.md) %}

1. Перейдите на сайт [diplodoc.com](https://diplodoc.com/) и нажмите кнопку **Начать**.

1. Следуйте инструкции, указанной на странице.

1. На вашей странице GitHub будет автоматически создан репозиторий `diplodoc-example` и создана ссылка на пример документации.

{% note info %}

Чтобы изменить стандартное имя репозитория `diplodoc-example`, [свяжитесь с нами](https://diplodoc.com/#contact).

{% endnote %}
