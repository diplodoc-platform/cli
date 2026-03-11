# ADR-006: Merge Includes in md2md Mode

## Status

**Реализовано (v8). Этапы 1a + 1b + 2 + 3: запись/чтение (md2md→md2html), инлайнинг с поддержкой indent (включая табы и смешанные отступы), hash section extraction (с корректной обработкой code blocks), полная поддержка rebasing ссылок, term boundary rule (инклюды после первого определения терма не инлайнятся). Интеграция с viewer не требует изменений. Единственное оставшееся ограничение — term definitions (Этап 4).**

## Context

### Цель

В режиме `md2md` (output-format=md) необходимо поддержать возможность "склейки" (развёртывания) include директив, т.е. заменять конструкции `{% include ... %}` на содержимое включаемых файлов.

**Основная мотивация**: Уменьшить количество запросов к S3 при рендеринге документации — вместо загрузки каждого include файла отдельно, получить "плоский" markdown файл со всем контентом.

### Текущая архитектура

#### CLI (packages/cli)

1. **Loader** ([`src/core/markdown/loader/resolve-deps.ts`](../src/core/markdown/loader/resolve-deps.ts:10)):
   - Парсит `{% include %}` директивы регулярным выражением
   - Собирает информацию о зависимостях (путь, location, hash)
   - НЕ разворачивает контент — только собирает метаданные

2. **MarkdownService** ([`src/core/markdown/MarkdownService.ts`](../src/core/markdown/MarkdownService.ts:280)):
   - Метод `_graph()` рекурсивно строит граф зависимостей
   - Каждый include загружается отдельно через `load()`
   - Возвращает структуру `EntryGraph` с `{path, content, deps, assets}`

3. **output-md feature** ([`src/commands/build/features/output-md/index.ts`](../src/commands/build/features/output-md/index.ts:139)):
   - Использует `Scheduler` для обработки контента
   - `rehashIncludes` — добавляет хеш к путям include файлов
   - Опция `mergeIncludes` существует, но **не реализована** (по умолчанию `false`)

4. **output-html plugins** ([`src/commands/build/features/output-html/plugins/includes.ts`](../src/commands/build/features/output-html/plugins/includes.ts:36)):
   - Разворачивает includes на уровне markdown-it токенов
   - Поддерживает `notitle`, `#hash` для частичного контента
   - Использует `contentWithoutFrontmatter()` для удаления YAML frontmatter

#### Transform (packages/transform)

1. **includes plugin** ([`src/transform/plugins/includes/index.ts`](../../transform/src/transform/plugins/includes/index.ts:28)):
   - Работает на уровне markdown-it токенов
   - Рекурсивно разворачивает includes
   - Поддерживает `notitle`, `#hash`
   - Использует `env.includes` для детекции циклических включений

2. **includes/collect** ([`src/transform/plugins/includes/collect.ts`](../../transform/src/transform/plugins/includes/collect.ts:59)):
   - Собирает includes рекурсивно
   - Использует `appendix` Map для хранения контента
   - Генерирует `{% included (path:path) %}...{% endincluded %}` разметку

3. **preprocessors/included** ([`src/transform/preprocessors/included/index.ts`](../../transform/src/transform/preprocessors/included/index.ts:77)):
   - Парсит `{% included %}` блоки
   - Сохраняет контент в `md.included[path]`
   - Удаляет блоки из основного контента

4. **term plugin** ([`src/transform/plugins/term/termDefinitions.ts`](../../transform/src/transform/plugins/term/termDefinitions.ts:34)):
   - Парсит определения терминов `[*term]: описание`
   - Сохраняет в `state.env.terms`
   - Поддерживает multiline через `{% include %}` директивы
   - **Проблема**: Работает только с includes, не с произвольным контентом

## Problem

### Список сложностей при склейке includes

#### 1. **notitle** — Удаление заголовка из включаемого контента

**Проблема**: При `{% include notitle [](file.md) %}` первый заголовок должен быть удалён.

**Текущее решение** (в output-html): Функция `stripTitleTokens()` удаляет первые 3 токена если это `heading_open`, `inline`, `heading_close`.

**Сложность для md2md**: Нужно работать на уровне текста, а не токенов. Требуется:

- Парсить markdown для определения первого заголовка
- Корректно удалять его с учётом возможных атрибутов `{#id .class}`

#### 2. **Частичный контент через #hash** — Включение только части файла

**Проблема**: `{% include [](file.md#section) %}` должен включить только секцию начиная с `#section`.

**Текущее решение** (в output-html): Функция `cutTokens()` ищет токен с `id=hash` и возвращает:

- Для `paragraph_open` — до `paragraph_close`
- Для `heading_open` — до следующего заголовка того же или меньшего уровня

**Сложность для md2md**:

- Нужно парсить markdown для поиска якорей
- Якоря могут быть автоматическими (из текста заголовка) или явными `{#id}`
- Нужно корректно определить границы секции

#### 3. **Terms (определения терминов)** — Самая сложная проблема

**Проблема**: Определения терминов `[*term]: описание` должны быть доступны во всём документе.

**Текущая архитектура**:

```
state.env.terms = {
  ':term1': 'описание 1',
  ':term2': 'описание 2'
}
```

**Сложности**:

a) **Multiline definitions**: Определение может занимать несколько строк:

```markdown
[*term]: Первая строка
{% include [](part1.md) %}
{% include [](part2.md) %}
```

Текущий код в `termDefinitions.ts` поддерживает это через `hasIncludeAfterBlanks()`.

b) **Multi-context**: При склейке includes каждый файл может иметь свои определения терминов. Нужно:

- Собрать все определения из всех includes
- Разрешить конфликты (одинаковые термины с разными определениями)
- Обеспечить доступность терминов в правильном контексте

c) **Порядок обработки**: Terms парсятся на этапе `block` правил markdown-it, а используются на этапе `core`. При склейке на уровне текста этот порядок нарушается.

d) **Definitions в конце файла**: По конвенции YFM, определения терминов должны быть в конце файла. При склейке они окажутся в середине.

---

### Детальный анализ Terms

#### Текущее ограничение

Сейчас term definition поддерживает multiline контент только если после пустой строки идёт `{% include %}`:

```typescript
// termDefinitions.ts
function hasIncludeAfterBlanks(state, fromLine, endLine) {
  for (let line = fromLine + 1; line <= endLine; line++) {
    const content = state.src.slice(start, end);
    return INCLUDE_LINE_RE.test(content.trimStart()); // /^{%\s*include\s/
  }
  return false;
}
```

#### Предлагаемое расширение

**Новое правило**: Term definition продолжается до:

1. Следующего term definition (`[*другой_терм]:`)
2. Конца файла

**Условие**: Все term definitions должны быть в конце файла (после основного контента).

**Пример:**

```markdown
# Основной контент

Текст с [термином](*api) и [другим термином](*sdk).

<!-- Секция определений терминов -->

[*api]: API (Application Programming Interface) — это набор
определений и протоколов для создания и интеграции
программного обеспечения.

Дополнительная информация об API:

- REST API
- GraphQL API
- gRPC

{% include [](api-examples.md) %}

[*sdk]: SDK (Software Development Kit) — комплект средств
разработки, который позволяет создавать приложения.

{% include [](sdk-details.md) %}
```

#### Сценарии с includes внутри term definitions

**Сценарий 1: Include как часть определения**

```markdown
[*term]: Основное определение
{% include [](details.md) %}
```

При склейке `details.md` вставляется inline:

```markdown
[*term]: Основное определение
Содержимое details.md...
```

**Сценарий 2: Include содержит свои term definitions**

```markdown
<!-- main.md -->

Текст с [термином](*api).

[*api]: Определение API

<!-- api-include.md (включается в main.md) -->

Дополнительный контент.

[*sdk]: Определение SDK
```

**Варианты обработки:**

| Вариант                    | Описание                                                        | Плюсы                       | Минусы                             |
| -------------------------- | --------------------------------------------------------------- | --------------------------- | ---------------------------------- |
| A. Сбор всех terms в конец | Все definitions из includes переносятся в конец основного файла | Соответствует конвенции YFM | Теряется контекст расположения     |
| B. Inline с дедупликацией  | Terms остаются на месте, дубликаты игнорируются                 | Сохраняется структура       | Нарушает конвенцию "terms в конце" |
| C. Запрет terms в includes | Выдавать ошибку если include содержит terms                     | Простая реализация          | Ограничивает функциональность      |
| D. Namespace для terms     | Добавлять префикс из имени файла: `api:sdk`                     | Избегает конфликтов         | Усложняет использование            |

**Рекомендация**: Вариант A с предупреждениями о конфликтах.

#### Пример полной обработки

**Входные файлы:**

```markdown
<!-- main.md -->

# Документация

Используем [API](*api) и [SDK](*sdk).

{% include [](chapter1.md) %}

[*api]: Application Programming Interface
```

```markdown
<!-- chapter1.md -->

## Глава 1

Работа с [библиотекой](*lib).

[*lib]: Внешняя библиотека
[*sdk]: Software Development Kit (из chapter1)
```

**Результат склейки:**

```markdown
# Документация

Используем [API](*api) и [SDK](*sdk).

## Глава 1

Работа с [библиотекой](*lib).

<!-- Term definitions (merged) -->

[*api]: Application Programming Interface
[*lib]: Внешняя библиотека
[*sdk]: Software Development Kit (из chapter1)
```

**Примечание**: `[*sdk]` из `chapter1.md` используется, так как в `main.md` нет определения для `sdk`.

#### Конфликты определений

**Пример конфликта:**

```markdown
<!-- main.md -->

[*api]: REST API

<!-- include.md -->

[*api]: GraphQL API
```

**Варианты разрешения:**

| Стратегия  | Результат                       | Когда использовать  |
| ---------- | ------------------------------- | ------------------- |
| First wins | `[*api]: REST API`              | По умолчанию        |
| Last wins  | `[*api]: GraphQL API`           | Для переопределения |
| Error      | Ошибка сборки                   | Строгий режим       |
| Merge      | `[*api]: REST API\nGraphQL API` | Для объединения     |

**Рекомендация**: "First wins" с warning в логах.

#### 4. **Относительные пути** — Ссылки и изображения

**Проблема**: Включаемый файл может содержать относительные ссылки:

```markdown
<!-- _includes/snippet.md -->

![image](./image.png)
[link](../other.md)
```

**Сложность**: При вставке в основной файл пути становятся некорректными.

**Решение**: Нужно перебазировать все относительные пути относительно нового расположения.

#### 5. **Frontmatter** — YAML метаданные

**Проблема**: Включаемые файлы могут иметь frontmatter:

```yaml
---
csp:
  script-src: ['unsafe-inline']
---
```

**Текущее решение**: `contentWithoutFrontmatter()` удаляет frontmatter перед вставкой.

**Сложность**: Некоторые метаданные (CSP, meta) должны быть объединены, а не отброшены.

#### 6. **Циклические включения**

**Проблема**: `a.md` включает `b.md`, который включает `a.md`.

**Текущее решение**: `env.includes` массив отслеживает цепочку включений.

**Сложность для md2md**: Нужно сохранить эту логику при работе на уровне текста.

#### 7. **Tabs, Cuts и другие блочные конструкции**

**Проблема**: Include может быть внутри tabs или cut:

```markdown
{% list tabs %}

- Tab 1

  {% include [](content1.md) %}

- Tab 2

  {% include [](content2.md) %}

{% endlist %}
```

**Сложность**: При склейке нужно сохранить правильную вложенность и отступы.

#### 11. **Вложенные списки и отступы**

**Проблема**: Include внутри списка должен сохранять правильные отступы:

```markdown
1. Первый пункт

   {% include [](step1.md) %}

2. Второй пункт
   - Вложенный список

     {% include [](nested.md) %}
```

**Содержимое `step1.md`:**

```markdown
Описание первого шага.

- Подпункт A
- Подпункт B

Дополнительная информация.
```

**Ожидаемый результат:**

```markdown
1. Первый пункт

   Описание первого шага.
   - Подпункт A
   - Подпункт B

   Дополнительная информация.

2. Второй пункт
   - Вложенный список

     Содержимое nested.md с правильными отступами...
```

**Сложности:**

a) **Определение уровня отступа**: Нужно вычислить отступ include директивы и применить его ко всему включаемому контенту.

b) **Вложенные списки в include**: Если включаемый файл содержит списки, их отступы должны быть увеличены относительно базового.

c) **Смешанные отступы**: Tabs vs spaces, разная ширина отступов.

d) **Code blocks**: Отступы внутри code blocks не должны изменяться.

**Алгоритм обработки отступов:**

```
1. Определить базовый отступ include директивы (количество пробелов/табов)
2. Для каждой строки включаемого контента:
   a. Если строка пустая — оставить как есть
   b. Если строка внутри code block — оставить как есть
   c. Иначе — добавить базовый отступ в начало
3. Обработать вложенные includes рекурсивно
```

**Пример с глубокой вложенностью:**

```markdown
- Уровень 1
  - Уровень 2
    - Уровень 3
      {% include [](deep.md) %}
```

Если `deep.md` содержит:

```markdown
Текст

- Список
  - Вложенный
```

Результат:

```markdown
- Уровень 1
  - Уровень 2
    - Уровень 3
      Текст
      - Список
        - Вложенный
```

#### 8. **Liquid переменные и условия**

**Проблема**: Включаемый файл может содержать liquid синтаксис:

```markdown
{% if var %}
Content
{% endif %}
```

**Сложность**: Переменные должны быть разрешены в контексте основного файла, а не включаемого.

#### 9. **Source maps и номера строк**

**Проблема**: После склейки номера строк в ошибках будут указывать на "плоский" файл, а не на исходные файлы.

**Решение**: Нужно сохранять source map для отладки.

#### 10. **Anchors и ID конфликты**

**Проблема**: Разные include файлы могут иметь одинаковые якоря:

```markdown
<!-- file1.md -->

## Introduction {#intro}

<!-- file2.md -->

## Introduction {#intro}
```

**Сложность**: Нужно либо переименовывать якоря, либо выдавать предупреждения.

## Decision

### Предлагаемый подход: Двухфазная обработка

#### Фаза 1: Сбор и подготовка (на уровне текста)

1. Рекурсивно обойти все includes
2. Для каждого include:
   - Загрузить контент
   - Удалить frontmatter
   - Перебазировать относительные пути
   - Собрать определения терминов
   - Применить `notitle` если нужно
   - Применить `#hash` фильтрацию если нужно
3. Сгенерировать специальную разметку для отложенной вставки

#### Фаза 2: Финальная сборка

1. Вставить подготовленный контент на место include директив
2. Объединить определения терминов в конец файла
3. Объединить метаданные (CSP, scripts, styles)
4. Сгенерировать source map

### Специальная разметка для отложенной вставки

```markdown
<!-- INCLUDE_START path="file.md" notitle="true" hash="section" -->

Контент включаемого файла

<!-- INCLUDE_END -->
```

Эта разметка позволяет:

- Отложить финальную вставку до момента когда все данные собраны
- Сохранить метаинформацию для отладки
- Легко откатиться если что-то пошло не так

### Обработка Terms

**Вариант A: Сбор в конец файла**

```markdown
<!-- Основной контент -->

<!-- TERMS_START -->

[*term1]: Определение 1
[*term2]: Определение 2

<!-- TERMS_END -->
```

**Вариант B: Inline определения с дедупликацией**

- Оставить определения на месте
- При конфликтах использовать первое определение
- Выдавать warning при конфликтах

**Рекомендация**: Вариант A, так как он соответствует конвенции YFM.

### Обработка отступов для вложенных структур

````typescript
function addIndent(content: string, indent: string): string {
  const lines = content.split('\n');
  let inCodeBlock = false;

  return lines
    .map((line) => {
      // Отслеживаем code blocks
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Пустые строки и code blocks не трогаем
      if (line.trim() === '' || inCodeBlock) {
        return line;
      }

      return indent + line;
    })
    .join('\n');
}
````

## Implementation Plan

> **Важно**: Merge includes выполняется на том же этапе pipeline, что и merge SVG, autotitle — т.е. **после резолва liquid**. Это означает, что проблем с liquid переменными быть не должно.

### Этап 0: Terms — multiline поддержка (КРИТИЧЕСКИЙ)

**Пакет**: `packages/transform`

**Задачи:**

1. Модифицировать [`termDefinitions.ts`](../../transform/src/transform/plugins/term/termDefinitions.ts:34) для поддержки multiline без ограничения на includes
2. Новое правило: term definition продолжается до следующего `[*key]:` или EOF
3. Добавить unit тесты для multiline terms
4. Обеспечить обратную совместимость с текущим синтаксисом

**Изменения в коде:**

```typescript
// Было: hasIncludeAfterBlanks() проверяет только {% include %}
// Стало: definition продолжается до следующего term или EOF

function findTermDefinitionEnd(state, startLine, endLine) {
  const TERM_DEF_RE = /^\[\*[^\]]+\]:/;

  for (let line = startLine + 1; line <= endLine; line++) {
    const content = getLineContent(state, line);
    if (TERM_DEF_RE.test(content.trimStart())) {
      return line - 1; // Конец текущего definition
    }
  }
  return endLine; // До конца файла
}
```

**Результат**: Terms поддерживают произвольный multiline контент.

---

### Этап 1a: Исправление `{% included %}` блоков (fallback-механизм)

**Пакеты**: `packages/cli`, `packages/transform` (чтение — уже поддерживается)

**Статус**: Реализовано (v4). Запись и чтение (md2md→md2html) работают.

**Концепция**: `{% included %}` блоки — fallback для инклюдов, которые нельзя безопасно
встроить по месту (см. Q9). `{% include %}` директивы сохраняются как есть, контент deps
дописывается в конец файла. Transform pipeline обрабатывает их при чтении.

**Задачи (v2 — выполнено):**

1. ✅ Переписать `merge-includes.ts` — генерация `{% included %}` блоков вместо инлайнинга
2. ✅ Запуск mergeIncludes только на root уровне (`!write`), не для deps
3. ✅ Пропуск записи отдельных dep-файлов при `mergeIncludes`
4. ✅ Реализовать `extractIncludedBlocks()` — парсинг `{% included %}` блоков для чтения
5. ✅ Интегрировать чтение в `run.transform()` — fallback из `{% included %}` в `files` dict
6. ✅ Unit-тесты (42 теста) и e2e-тесты (5 тестов)

**Задачи (v3 — исправления чтения, выполнено):**

1. ✅ `MarkdownService.load()` — graceful ENOENT: при отсутствии dep-файла (content embedded
   в parent через `{% included %}`) resolve с пустым content вместо reject
2. ✅ `run.transform()` — merge ALL `includedFiles` в `files` dict (не только из `deps`)
3. ✅ `run.lint()` — аналогично `transform()`, использует `extractIncludedBlocks`
4. ✅ Убрано `rebaseRelativePaths` из `collectAllDeps` — пути в `{% included %}` блоках
   остаются оригинальными, transform pipeline резолвит их через colon-chain key
5. ✅ `_deps()` — try-catch для recursive dep loading (safety net)
6. ✅ Обновлены e2e тесты — проверка оригинальных путей вместо ребейзенных

**Задачи (v4 — loader isolation, выполнено):**

1. ✅ `resolveDependencies` — исключение `{% included %}` блоков из поиска `{% include %}`
   директив. Без этого loader резолвил `{% include %}` внутри `{% included %}` блоков
   относительно root-файла → "out of project scope" на вложенных инклюдах.
2. ✅ `resolveAssets` — исключение `{% included %}` блоков из поиска ассетов.
   Без этого ассеты из embedded контента ребейсились относительно root-файла → ENOENT.
3. ✅ `resolveHeadings` — аналогичное исключение для headings.
4. ✅ `findIncludedBlockRanges()` вынесена в `utils.ts` как общая утилита.
5. ✅ Исправлен e2e тест "without flag" — `mergeIncludes` по умолчанию `true`,
   тест должен явно передавать `--no-merge-includes`.

**Задачи (TODO):**

1. ✅ Проверить интеграцию с viewer — изменений не требуется, `root` уже передаётся (см. v6)
2. ⬜ Добавить e2e тест для полного цикла write→read (md2md→md2html)

**Файлы:**

- `src/commands/build/features/output-md/plugins/merge-includes.ts` — генерация `{% included %}` блоков
- `src/commands/build/features/output-md/index.ts` — `!write` guard + skip dep file writing
- `src/commands/build/features/output-md/utils.ts` — расширение `HashedGraphNode` (добавлено `deps`)
- `src/commands/build/extract-included.ts` — утилита `extractIncludedBlocks()` для чтения
- `src/commands/build/run.ts` — интеграция extractIncludedBlocks в `transform()` и `lint()`
- `src/core/markdown/MarkdownService.ts` — graceful ENOENT для dep-файлов
- `src/core/markdown/utils.ts` — `findIncludedBlockRanges()` для фильтрации контента внутри `{% included %}` блоков
- `src/core/markdown/loader/resolve-deps.ts` — исключение `{% included %}` из dep-поиска
- `src/core/markdown/loader/resolve-assets.ts` — исключение `{% included %}` из asset-поиска
- `src/core/markdown/loader/resolve-headings.ts` — исключение `{% included %}` из heading-поиска
- `src/commands/build/extract-included.spec.ts` — 9 unit-тестов для extractIncludedBlocks
- `src/commands/build/features/output-md/plugins/merge-includes.spec.ts` — 127 unit-тестов
  (rebaseUrl, rebaseRelativePaths, canInlineInclude, stripFirstHeading, addIndent,
  extractSection, prepareInlinedContent, collectFallbackDeps, linked images, code fences,
  nested links, term references, term boundary, catastrophic backtracking)
- `tests/e2e/merge-includes.spec.ts` — 7 e2e тестов (simple inline, nested, relative-paths,
  hash-fallback, term-inline, inline-context, without flag)
- `tests/mocks/merge-includes/` — test fixtures

**Детали реализации:**

1. **Запись (md2md)**: Плагин `mergeIncludes(run, deps)` — `StepFunction`, запускается
   только при `!write` (root level). Рекурсивно обходит дерево deps через `collectAllDeps()`,
   строя colon-chain ключи (`_includes/outer.md:inner.md`) для вложенных includes.
   Для каждого dep: удаляет frontmatter, генерирует
   `{% included (key) %}...{% endincluded %}` блок. Пути в контенте НЕ перебазируются —
   transform pipeline резолвит их через colon-chain key. Все блоки — плоские (не вложенные),
   добавляются через один Scheduler actor в конец контента.

2. **Colon-chain ключи**: Формат `parentLink:childLink` совместим с transform'овским
   `preprocessors/included`. Позволяет корректно резолвить вложенные пути:
   `_includes/outer.md:inner.md` → resolve `_includes/outer.md` от root, затем `inner.md` от результата.

3. **Чтение (CLI output-html)**: `run.transform()` и `run.lint()` вызывают
   `extractIncludedBlocks(markdown, file)` перед передачей в transformer/linter.
   Функция парсит `{% included %}` блоки, резолвит colon-chain ключи в normalized paths
   и возвращает `{content, files}`. `files` dict формируется как `{...depFiles, ...includedFiles}` —
   embedded контент имеет приоритет, fallback на диск для файлов, не встроенных в блоки.

4. **Graceful ENOENT**: `MarkdownService.load()` при ENOENT для dep-файлов (когда `from`
   задан) не отклоняет Defer, а резолвит с пустым content. Это предотвращает каскадные
   ошибки при рекурсивном обходе deps (`_deps()`), т.к. контент dep'а встроен в parent.

5. **Чтение (viewer/transform)**: Transform уже поддерживает чтение из `{% included %}` блоков:
   - `preprocessors/included` парсит блоки → `md.included[absolutePath]`
   - `plugins/includes` проверяет `md.included?.[pathname]` → `getFileTokens(pathname, state, options, included)`
   - Для корректной работы viewer должен передавать `root` в transform options (отдельная задача).

6. **Dep файлы не пишутся**: Условие `config.mergeIncludes` в dump() пропускает запись
   отдельных include файлов. Весь контент встроен в root файл.

7. **Пути НЕ ребейсятся**: Контент в `{% included %}` блоках сохраняет оригинальные
   относительные пути. Transform pipeline корректно резолвит их, т.к. знает source file
   из colon-chain key. `rebaseRelativePaths()` сохранена для будущего Step 1b (inline includes).

**Результат**: Работающий fallback-механизм для инклюдов, которые нельзя встроить по месту.

---

### Этап 1b: Простой инлайнинг includes

**Пакет**: `packages/cli`

**Концепция**: Инклюды, удовлетворяющие критериям простоты (см. Q9), встраиваются
непосредственно по месту `{% include %}` директивы. Остальные используют `{% included %}`
fallback из Этапа 1a. Это гибридный подход, при котором выходной файл может содержать
и встроенный контент, и `{% included %}` блоки одновременно.

**Критерии для инлайнинга (текущие, после v8):**

- Нет паттерна `[*key]:` в контенте включаемого файла (нет term definitions)
- Include-директива расположена ДО первого определения терма в parent content (term boundary)
- Include-директива — единственное содержимое на строке (standalone check)
- `notitle` — поддерживается (простое удаление первого заголовка)
- `#hash` — поддерживается (section extraction с корректным пропуском code blocks)
- Отступы — поддерживаются (сохранение реальных символов отступа: табы, пробелы, mixed)

**Задачи (выполнено):**

1. ✅ Реализован `canInlineInclude(dep, parentContent)` — проверка indent, hash в link, term definitions
2. ✅ Реализован `stripFirstHeading(content)` — удаление первого заголовка для `notitle`
3. ✅ Модифицирован `mergeIncludes` плагин — для каждого dep: если `canInlineInclude` → inline,
   иначе → `{% included %}` fallback. Дедупликация по ключу через `seen` Set.
4. ✅ Обработка вложенных includes: инлайненные deps используют `collectFallbackDepsForInlined`
   с ребейсенными ключами; не-инлайненные — `collectFallbackDepsWithChain` с colon-chain.
5. ✅ Unit-тесты для `canInlineInclude` (6), `stripFirstHeading` (8), linked image rebase (2)
6. ✅ E2E тесты: simple inline, nested (outer inline + inner fallback), relative-paths rebase,
   hash-fallback deduplication, without flag
7. ✅ Исправлен `rebaseLinksInLine` — добавлена обработка linked images `[![alt](img)](url)`
   через `LINKED_IMAGE_RE`, т.к. `INLINE_LINK_RE` ловил только внутреннюю часть.
8. ✅ Обновлены снапшоты всех затронутых e2e тестов (preprocess, regression, includes,
   pdf-page, include-toc, metadata)

**Обработка вложенных includes:**

```
Дерево: main.md → outer.md (простой) → inner.md#section (сложный — hash)

Результат:
1. outer.md инлайнится → его контент (с перебазированными путями) вставляется в main.md
2. inner.md — сложный → добавляется как {% included (_includes/inner.md) %}
   (путь ребейсен от outer.md к main.md, без colon-chain т.к. outer.md инлайнен)
3. {% include %} директива на inner.md внутри контента outer.md уже ребейсена
```

**Пример `canInlineInclude`:**

```typescript
interface InlineCheckParams {
  includeLine: string;
  includeContent: string;
}

const HASH_RE = /\.md#[\w-]+/;
const TERM_DEF_RE = /^\[\*\w+\]:/m;

function canInlineInclude({includeLine, includeContent}: InlineCheckParams): boolean {
  const indent = includeLine.match(/^(\s*)/)?.[1] ?? '';
  if (indent.length > 0) return false;

  if (HASH_RE.test(includeLine)) return false;

  if (TERM_DEF_RE.test(includeContent)) return false;

  return true;
}
```

**Пример `stripFirstHeading`:**

```typescript
const HEADING_RE = /^(#{1,6})\s+.*(?:\{#[\w-]+\})?$/;

function stripFirstHeading(content: string): string {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (HEADING_RE.test(trimmed)) {
      lines.splice(i, 1);
      // Remove trailing empty line after heading
      if (i < lines.length && lines[i].trim() === '') {
        lines.splice(i, 1);
      }
      break;
    }
    break; // First non-empty line is not a heading — nothing to strip
  }
  return lines.join('\n');
}
```

**Ограничения (после этапов 2 и 3 осталось):**

- ~~Инклюды с `#hash` не инлайнятся~~ → решено в Этапе 3 (v7)
- ~~Инклюды с отступом не инлайнятся~~ → решено в Этапе 2 (v7)
- Инклюды с term definitions не инлайнятся (→ Этап 4)
- HTML links/images не ребейсятся (только markdown syntax)
- Reference-style links `[text][ref]` не ребейсятся (только definitions и inline links)

**Результат**: ~95% инклюдов встраиваются по месту (включая indent и hash), остальные (term definitions) работают через fallback.

**Задачи (v8 — баг-фиксы и рефакторинг, выполнено):**

Массовое тестирование на реальных документациях (wiki/common, marketplace, ledger-guide и др.)
выявило три бага и несколько мест для упрощения:

1. ✅ **ERR tab-list-not-closed**: `extractSection` не пропускал fenced code blocks — заголовки
   внутри ` ``` ` блоков ошибочно завершали секцию, отсекая `{% endlist %}`.
   **Исправлено**: введён shared `processCodeFence`/`FenceState` — используется и в
   `rebaseRelativePaths`, и в `extractSection`.

2. ✅ **Indent с табами и пробелами**: `addIndent` использовал `' '.repeat(indent)`, теряя
   реальные символы табуляции. **Исправлено**: `parentContent.slice(lineStart, dep.location[0])`
   захватывает точную строку отступа, сохраняя табы и смешанные отступы.

3. ✅ **Инклюды в термах**: `TERM_DEF_RE` (`/^\[\*\w+\]:/m`) не распознавал термы с дефисами
   (`[*ekat-mgt]:`) и другими спецсимволами. **Исправлено**: regex обновлён на
   `/^\[\*[^[\]]+\]:/m` — допускает любые символы кроме `[` и `]` в имени терма.

4. ✅ **Term boundary rule**: `canInlineInclude` теперь проверяет: если include-директива
   расположена в parent content после первого определения терма (`TERM_DEF_RE`), она не
   инлайнится. Обоснование: по конвенции YFM все термы идут в конце страницы, поэтому
   инклюды после первого терма принадлежат секции термов и не должны разворачиваться до Этапа 4.

5. ✅ **Standalone check**: `canInlineInclude` проверяет, что include-директива — единственное
   содержимое на своей строке (нет текста до/после). Это ловит inline-контексты: `> {% include %}`,
   `| {% include %} |`, `text {% include %}`, где инлайнинг многострочного контента сломает
   структуру markdown. Не дублирует term-проверки — работает для не-термовых inline-контекстов.

6. ✅ **Рефакторинг `merge-includes.ts`**:
   - Все regex-константы вынесены в начало файла
   - `matchHeading` + `resolveHeadingAnchor` объединены в `parseHeading` (возвращает
     `{level, anchor}` сразу)
   - `matchParagraphAnchor` инлайнен в `extractSection`
   - Heading-обработка вынесена в `processHeadingForSection` — cognitive complexity
     `extractSection` снижена с 17 до ~12 (лимит SonarCloud: 15)
   - Единый `processCodeFence`/`FenceState` для code fence tracking
   - `HEADING_RE` удалён (заменён на `parseHeading`)
   - Восстановлён `String.raw` в regex template literals
   - Итого: 509 строк, 127 unit-тестов, 7 e2e тестов

**Что было сломано и исправлено (v5-v6) — rebasing ссылок:**

Инлайнинг с `rebaseRelativePaths()` привнёс массу ошибок `YFM003` (unreachable link) на реальных
документациях. Корневые причины:

1. **Неполное покрытие markdown link syntax**: Начальный `INLINE_LINK_RE` не покрывал linked images
   с атрибутами, double-bracket autotitle синтаксис `[[!TITLE path]](url)`, вложенные ссылки.
   Каждый новый edge case требовал отдельного regex или усложнения существующего.

2. **Катастрофический бэктрекинг (ReDoS)**: Попытка обработать вложенные скобки через
   `(?:[^\[\]]*|\[[^\]]*\])*` привела к экспоненциальному времени на строках с незакрытыми
   скобками (часто в code spans с `<`, `>`, `[` в тексте).

3. **Некорректная детекция code blocks**: Inline backtick-выражения вроде `` `code()` ``
   интерпретировались как открывающий fenced code block → все ссылки после них пропускались.

4. **Ребейз «не-ссылок»**: YFM term references (`[*term]`) и liquid directives (`{%...%}`)
   ошибочно ребейзились как файловые пути.

**Эволюция решения:**

| Версия | Подход                                          | Проблемы                          |
| ------ | ----------------------------------------------- | --------------------------------- |
| v5.0   | `INLINE_LINK_RE` + `LINKED_IMAGE_RE`            | Не ловил атрибуты, double-bracket |
| v5.1   | + `FULL_LINKED_IMAGE_RE` + placeholder-механизм | Double-rebase, сложность          |
| v5.2   | + `DOUBLE_BRACKET_LINK_RE` + вложенные скобки   | Catastrophic backtracking         |
| v5.3   | Backtrack-safe regex                            | Не обрабатывал вложенные ссылки   |
| **v6** | **`LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g`**       | **Нет — решает все кейсы**        |

Финальное решение v6 — замена всех сложных regex одним простым, который матчит `](url`
в любом контексте. Это паттерн, общий для ВСЕХ типов markdown-ссылок.

---

### Этап 2: Обработка отступов для списков → расширение инлайнинга

**Пакет**: `packages/cli`

**Статус**: Реализовано (v7).

**Концепция**: Снять ограничение `indent === 0` из `canInlineInclude()`. После реализации
инклюды внутри списков, табов и катов также встраиваются по месту.

**Задачи (выполнено):**

1. ✅ Реализована функция `addIndent(content, indent)` — добавляет отступ ко всем строкам
   кроме первой (она уже продолжает indent из parent) и пустых строк
2. ✅ Отступ include директивы определяется из `parentContent` через
   `parentContent.slice(lineStart, dep.location[0])` — сохраняет реальные символы отступа
   (табы, пробелы, смешанные)
3. ✅ `addIndent` интегрирован в `prepareInlinedContent` — при наличии indent применяется отступ
4. ✅ `canInlineInclude()` — убрана проверка на indent
5. ✅ Unit-тесты для `addIndent` (6 тестов, включая mixed tab+space), обновлены тесты
   `canInlineInclude` и `prepareInlinedContent`

**Детали реализации:**

Функция `addIndent(content, indent)` принимает строку indent (не число!) — реальные символы
отступа из parent content. Это позволяет корректно обрабатывать табы, пробелы и их
комбинации. Добавляет indent ко всем строкам кроме первой и пустых. Первая строка не
получает indent, т.к. она продолжает уже существующий indent из parent content.

Кроссплатформенная поддержка: `addIndent` корректно обрабатывает `\r\n`, `\r` и `\n`
разрывы строк, сохраняя оригинальные символы.

**Результат**: Инлайн-покрытие расширилось с ~80% до ~90%.

---

### Этап 3: `#hash` section extraction → расширение инлайнинга

**Пакет**: `packages/cli`

**Статус**: Реализовано (v7).

**Концепция**: Снять ограничение на `#hash` из `canInlineInclude()`. Реализовать поиск и
извлечение секции из контента на уровне текста.

**Задачи (выполнено):**

1. ✅ Реализована `extractSection(content, hash)` — поиск секции по якорю:
   - Поддержка автоматических якорей (из текста заголовка через `slugify`)
   - Поддержка явных якорей `{#id}` на заголовках
   - Поддержка paragraph anchors `{#id}` (не на заголовках — извлекается параграф)
   - Определение границ секции (до следующего заголовка того же или меньшего уровня)
   - Пропуск fenced code blocks — заголовки внутри ` ``` `/`~~~` не обрывают секцию
   - Если anchor не найден — возвращается весь контент (graceful fallback)
2. ✅ Интегрировано в `prepareInlinedContent`: при наличии `#hash` в `dep.link`
   вызывается `extractSection` до `stripFirstHeading` и `rebaseRelativePaths`
3. ✅ `canInlineInclude()` — убрана проверка на hash
4. ✅ Unit-тесты для `extractSection` (10 тестов): explicit anchor, auto-slug,
   same-level boundary, lower-level boundary, EOF, sub-headings, not-found, paragraph anchor,
   headings inside code blocks (3-tick and 4-tick fences)

**Исправление бага кэширования deps:**

При реализации этапа 3 был обнаружен баг в `output-md/index.ts`: функция `dump()` кэшировала
результат по `graph.path`. Когда один файл включался дважды с разными `#hash`
(e.g., `file.md#section-a` и `file.md#section-b`), второй dep получал `link`, `match`,
`location` от первого. **Исправлено**: после `dump()` значения `link`, `match`, `location`
из оригинального `EntryGraphNode` возвращаются поверх кэшированного результата.

**Результат**: Инлайн-покрытие расширилось с ~90% до ~95%.

---

### Этап 4: Terms — полная поддержка (сбор, мерж, конфликты) → 100% инлайнинг

**Пакет**: `packages/cli`

**Концепция**: Снять ограничение на term definitions из `canInlineInclude()` и одновременно
реализовать обработку конфликтов. После этого этапа все инклюды инлайнятся.

#### Ключевой кейс: терм без определения на родительской странице

Родительская страница может **использовать** терм (`[текст](*api)`), но **не определять** его.
Определение находится где-то в цепочке инклюдов. Это корректный паттерн — позволяет иметь
одно определение, переиспользуемое на разных страницах.

**Пример:**

```markdown
<!-- main.md — использует терм, но не определяет -->

Работа с [API](*api) и [SDK](*sdk).

{% include [](chapter1.md) %}
{% include [](chapter2.md) %}

<!-- chapter1.md — определяет *api -->

Описание API.

[*api]: Application Programming Interface

<!-- chapter2.md — тоже определяет *api (одинаково) и *sdk -->

Описание SDK.

[*api]: Application Programming Interface
[*sdk]: Software Development Kit
```

После склейки:

```markdown
Работа с [API](*api) и [SDK](*sdk).

Описание API.

Описание SDK.

[*api]: Application Programming Interface
[*sdk]: Software Development Kit
```

Терм `[*api]` определён в двух инклюдах одинаково → дубликат не создаётся.
Терм `[*sdk]` определён только в одном → просто переносится в конец.
Родительская страница не имела определений → термы доступны через собранные definitions.

#### Алгоритм обработки terms при склейке

```
Вход: root content + список deps (каждый dep = {path, content, includeLine})

1. СБОР ОПРЕДЕЛЕНИЙ
   Для root и каждого dep:
   a. Найти все [*key]: definition в контенте
   b. Записать в Map<key, Array<{definition, sourcePath}>>
   c. Удалить definitions из контента (они будут добавлены в конец)

2. ДЕДУПЛИКАЦИЯ
   Для каждого key в Map:
   a. Если все definitions одинаковые → оставить одно
   b. Если definitions разные → конфликт (см. п.3)

3. РАЗРЕШЕНИЕ КОНФЛИКТОВ
   При конфликте (одинаковый key, разный контент):
   a. Первое определение (из root или первого dep по порядку обхода) сохраняет
      оригинальный ключ [*key]
   b. Последующие определения переименовываются: [*key] → [*key--sourcePath]
      где sourcePath — нормализованный путь к файлу-источнику
      (например: [*api--_includes/chapter2]: GraphQL API)
   c. В контенте соответствующего dep обновляются все ссылки:
      [текст](*key) → [текст](*key--sourcePath)
   d. Выдать warning с указанием всех источников конфликта

4. ОПРЕДЕЛЕНИЯ БЕЗ ИСПОЛЬЗОВАНИЯ (orphaned definitions)
   Определение из инклюда, которое нигде не используется в собранном документе —
   всё равно добавляется в конец. Transform сам удалит unreferenced terms при рендеринге.

5. ИСПОЛЬЗОВАНИЕ БЕЗ ОПРЕДЕЛЕНИЯ
   Терм [текст](*key) в root без [*key]: в root — корректно, если определение
   найдено в каком-либо dep. Алгоритм сбора (п.1) это покрывает автоматически.

6. ФИНАЛЬНАЯ СБОРКА
   Все собранные definitions (с учётом дедупликации и переименования)
   добавляются в конец основного файла.
```

#### Формат суффикса при конфликте: путь вместо хеша

Вместо нечитаемого хеша (`[*api-f7e8d9]`) используется нормализованный путь к файлу-источнику.
Это позволяет быстро найти, откуда пришёл конфликтующий терм.

**Нормализация пути для суффикса:**

- Убрать `_includes/` префикс (если есть)
- Заменить `/` на `-`
- Убрать расширение `.md`
- Пример: `_includes/api/chapter2.md` → `api-chapter2`

**Формат**: `[*key--normalized-path]`

Разделитель `--` (двойной дефис) выбран, чтобы не конфликтовать с обычными дефисами
в именах термов (`[*my-term]`) и в именах файлов.

**Пример конфликта:**

```markdown
<!-- main.md -->

Использует [API](*api) для REST.
[*api]: REST API для работы с данными

<!-- _includes/graphql/intro.md -->

Использует [API](*api) для GraphQL.
[*api]: GraphQL API для запросов
```

После склейки:

```markdown
Использует [API](*api) для REST.

Использует [API](*api--graphql-intro) для GraphQL.

[*api]: REST API для работы с данными
[*api--graphql-intro]: GraphQL API для запросов
```

#### Правило "кто первый" для определения оригинального ключа

При конфликте оригинальный ключ (без суффикса) остаётся за **первым определением
в порядке обхода дерева инклюдов** (depth-first, pre-order):

1. Root file — всегда первый
2. Далее — deps в порядке появления `{% include %}` директив в root
3. Для вложенных deps — рекурсивно тот же порядок

Это означает: если root определяет `[*api]`, его определение всегда "выигрывает".
Если root не определяет, выигрывает первый инклюд в цепочке.

**Задачи:**

1. ⬜ Реализовать `extractTermDefinitions(content)` — парсинг и извлечение term definitions
2. ⬜ Реализовать `normalizePathForSuffix(depPath)` — нормализация пути для суффикса
3. ⬜ Реализовать алгоритм сбора, дедупликации и разрешения конфликтов
4. ⬜ Обновлять ссылки `[текст](*key)` → `[текст](*key--path)` в контенте при конфликте
5. ⬜ Добавить warning при конфликтах с указанием источников
6. ⬜ Обновить `canInlineInclude()` — убрать проверку на terms
7. ⬜ Unit-тесты: сбор terms, дедупликация, конфликты, бездефиниционный терм в root
8. ⬜ E2E тесты: terms в includes, shared terms, конфликты, root без определения

**Результат**: 100% инлайн-покрытие. `{% included %}` fallback остаётся в коде
как safety net, но не используется при нормальной работе.

---

### Этап 5: Source maps (inline комментарии)

**Пакет**: `packages/cli`

**Задачи:**

1. Добавлять комментарии `<!-- source: path:line -->` перед включаемым контентом
2. Опционально: флаг для отключения source maps
3. Добавить тесты

**Результат**: Возможность отладки склеенных файлов.

---

### Этап 6: Frontmatter merging (ОТЛОЖЕНО)

**Статус**: Требует дополнительного анализа.

**Задачи (для будущей реализации):**

1. Определить какие поля frontmatter нужно мержить
2. Реализовать стратегию мержа для CSP, scripts, styles
3. Добавить тесты

**Результат**: Метаданные из includes объединяются с основным файлом.

## Consequences

### Positive

✅ Уменьшение запросов к S3 при рендеринге
✅ Упрощение архитектуры рендеринга на клиенте
✅ Возможность кэширования "плоских" файлов

### Negative

❌ Увеличение размера выходных файлов
❌ Сложность отладки (нужны source maps)
❌ Потенциальные проблемы с большими документациями

### Risks

⚠️ Конфликты якорей и ID
⚠️ Неожиданное поведение при сложных вложенностях
⚠️ Производительность при глубокой вложенности includes

## Alternatives Considered

### 1. Обработка на уровне markdown-it токенов

**Плюсы**: Уже реализовано в output-html
**Минусы**: Требует полного парсинга, сложно сохранить исходный markdown

### 2. Lazy loading includes на клиенте

**Плюсы**: Не требует изменений в md2md
**Минусы**: Не решает проблему множества запросов к S3

### 3. Bundling includes в отдельный JSON

**Плюсы**: Один запрос для всех includes
**Минусы**: Требует изменений на клиенте, не уменьшает сложность

## Open Questions (Требуют решения)

### Q1: Стратегия разрешения конфликтов term definitions ✅ РЕШЕНО (обновлено)

**Контекст**: Когда один и тот же term определён в нескольких файлах. Дополнительный кейс:
родительская страница может использовать терм без определения — определение приходит
из цепочки инклюдов (переиспользование одного определения на разных страницах).

**Решение**: Дедупликация по контенту + суффикс из пути к файлу-источнику при конфликтах.

**Алгоритм:**

1. Собрать все определения `[*key]: ...` из root и всех deps
2. Если определения одинаковые → дубликат не создаётся
3. Если определения разные → конфликт:
   - Первое определение (в порядке обхода дерева) сохраняет ключ `[*key]`
   - Последующие переименовываются: `[*key--normalized-path]`
   - Ссылки в контенте соответствующего dep обновляются
4. Все definitions переносятся в конец файла

**Формат суффикса**: `--normalized-path` (вместо хеша — путь к файлу-источнику для читаемости).
Нормализация: убрать `_includes/`, заменить `/` на `-`, убрать `.md`.
Пример: `_includes/api/chapter2.md` → `[*api--api-chapter2]`.

**Пример — бездефиниционный терм в root:**

```markdown
<!-- main.md — использует *api, но НЕ определяет -->

Работа с [API](*api).
{% include [](terms.md) %}

<!-- terms.md -->

[*api]: Application Programming Interface
```

Результат: определение из `terms.md` доступно в main.md — корректное поведение.

**Пример — конфликт (разный контент):**

```markdown
<!-- main.md -->

[*api]: REST API для работы с данными

<!-- _includes/graphql/intro.md -->

[*api]: GraphQL API для запросов
```

После склейки:

```markdown
...использует [API](*api)...

...использует [API](*api--graphql-intro)...

[*api]: REST API для работы с данными
[*api--graphql-intro]: GraphQL API для запросов
```

**Пример — одинаковый контент (через общий include):**

```markdown
<!-- chapter1.md включает shared-terms.md -->

{% include [](shared-terms.md) %}
Текст с [API](*api).

<!-- chapter2.md тоже включает shared-terms.md -->

{% include [](shared-terms.md) %}
Другой текст с [API](*api).

<!-- shared-terms.md -->

[*api]: Application Programming Interface
```

Результат: term `[*api]` появляется только один раз — определения одинаковые, дубликат не создаётся.

**Преимущества:**

- ✅ Нет дублирования при одинаковом контенте определения
- ✅ При конфликте суффикс содержит путь — легко найти источник
- ✅ Корректная работа с "бездефиниционными" термами (определение в цепочке инклюдов)
- ✅ Детерминированный результат (порядок обхода дерева определяет приоритет)

---

### Q2: Расширение синтаксиса term definitions ✅ РЕШЕНО

**Контекст**: Сейчас term definition заканчивается на пустой строке (если дальше не include).

**Решение**: Вариант B — definition продолжается до следующего term или конца файла.

**Новое правило парсинга:**

```
Term definition = [*key]: content
                  (любой контент до следующего [*другой_key]: или EOF)
```

**Пример:**

```markdown
[*api]: API (Application Programming Interface) — это набор
определений и протоколов для создания и интеграции
программного обеспечения.

Дополнительная информация об API:

- REST API
- GraphQL API
- gRPC

[*sdk]: SDK (Software Development Kit) — комплект средств
разработки, который позволяет создавать приложения.
```

**Изменения в коде:**

- Модифицировать `termDefinitions.ts` для поддержки multiline без ограничения на includes
- Условие: все term definitions должны быть в конце файла (после основного контента)

---

### Q3: Terms в includes — разрешить или запретить? ✅ РЕШЕНО

**Контекст**: Include файл может содержать свои term definitions.

**Решение**: Объединяется с Q1 — terms из includes разрешены и мержатся с дедупликацией
по контенту и суффиксом из пути к файлу-источнику при конфликтах (см. Q1).

**Алгоритм:**

1. Собрать все term definitions из root и всех includes
2. При конфликте ключей — дедупликация по контенту + суффикс из пути (см. Q1)
3. Все terms переносятся в конец основного файла
4. Бездефиниционные термы в root — корректны, если определение есть в цепочке инклюдов

---

### Q4: Обработка отступов в списках ✅ РЕШЕНО

**Контекст**: Include внутри списка должен сохранять отступы.

**Решение**: Вариант A — автоматическое добавление отступов.

**Алгоритм:**

1. Определить отступ include директивы (количество пробелов/табов в начале строки)
2. Применить этот отступ ко всем строкам включаемого контента
3. Исключения: пустые строки и содержимое code blocks

**Реализация** (из PR #1305):

````typescript
function addIndent(content: string, indent: string): string {
  const lines = content.split('\n');
  let inCodeBlock = false;

  return lines
    .map((line) => {
      // Отслеживаем code blocks
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
      }

      // Пустые строки и code blocks не трогаем
      if (line.trim() === '' || inCodeBlock) {
        return line;
      }

      return indent + line;
    })
    .join('\n');
}
````

---

### Q5: Source maps и отладка ✅ РЕШЕНО

**Контекст**: После склейки номера строк в ошибках не соответствуют исходным файлам.

**Решение**: Вариант A — inline комментарии для отладки.

**Формат:**

```markdown
<!-- source: _includes/chapter1.md:1 -->

## Глава 1

Контент главы...

<!-- source: _includes/chapter1.md:15 -->

### Подраздел
```

**Преимущества:**

- Простая реализация
- Не требует дополнительных файлов
- Легко читается при отладке
- Комментарии игнорируются при рендеринге

---

### Q6: Обработка frontmatter из includes ⏸️ ОТЛОЖЕНО

**Контекст**: Include файлы могут содержать frontmatter с CSP, meta и другими данными.

**Статус**: Требует дополнительного анализа. Пока используем текущее поведение (удаление frontmatter).

**Варианты для будущего рассмотрения:**

- A) **Удалять полностью** — как сейчас в output-html
- B) **Мержить в основной frontmatter** — объединять CSP, meta и т.д.
- C) **Выборочный мерж** — только определённые поля (CSP, scripts, styles)

---

### Q7: Порядок этапов реализации ✅ РЕШЕНО

**Контекст**: Нужно определить MVP и последующие итерации.

**Решение**: Начать с поддержки multiline terms, затем следовать предложенному порядку.

**Важное уточнение**: Merge includes выполняется на том же этапе, что и merge SVG, autotitle — т.е. **после резолва liquid**. Это означает, что проблем с liquid переменными быть не должно.

**Финальный порядок реализации (прогрессивный инлайнинг — см. Q9):**

| Этап | Задача                                                             | Приоритет         | Инлайн-покрытие         |
| ---- | ------------------------------------------------------------------ | ----------------- | ----------------------- |
| 0    | **Terms — multiline поддержка** (изменения в transform)            | Критический       | —                       |
| 1a   | **Исправить `{% included %}` блоки** — fallback-механизм           | Высокий           | 0% (всё через fallback) |
| 1b   | **Простой инлайнинг** — indent=0, notitle, без hash/terms          | Высокий           | ~80% инклюдов           |
| 2    | **Обработка отступов для списков** → расширение инлайнинга (v7-v8) | Высокий ✅        | ~90%                    |
| 3    | **`#hash` section extraction** → расширение инлайнинга (v7-v8)     | Высокий ✅        | ~95%                    |
| 4    | Terms — полная поддержка (сбор, мерж, конфликты) → 100% инлайнинг  | Высокий           | 100%                    |
| 5    | Source maps (inline комментарии)                                   | Средний           | —                       |
| 6    | Frontmatter merging                                                | Низкий (отложено) | —                       |
| 7    | Детекция дублирующихся anchors                                     | Низкий            | —                       |

**Примечание**: "Инлайн-покрытие" — оценочная доля инклюдов, которые встраиваются по месту
(остальные используют `{% included %}` fallback). Процент основан на типичных паттернах
использования: большинство инклюдов — простые top-level вставки без hash/terms.

---

### Q8: Anchors и ID конфликты ✅ РЕШЕНО

**Контекст**: Разные include файлы могут иметь одинаковые якоря (anchors/IDs):

```markdown
<!-- file1.md -->

## Introduction {#intro}

<!-- file2.md -->

## Introduction {#intro}
```

**Решение**: Выдавать предупреждения (warnings) при обнаружении дублирующихся якорей.

**Обоснование**:

- Сейчас на фазе HTML с якорями ничего не происходит — они не переименовываются
- Дублирующиеся якоря в одном документе — это ошибка разметки
- Автоматическое переименование может сломать существующие ссылки
- Warning позволяет автору документации исправить проблему

**Алгоритм:**

1. При склейке includes собирать все явные якоря `{#id}` и автоматические (из заголовков)
2. Отслеживать источник каждого якоря (файл:строка)
3. При обнаружении дубликата — выдать warning с указанием обоих источников
4. Не модифицировать якоря автоматически

**Пример warning:**

```
WARN: Duplicate anchor '#intro' found:
  - file1.md:5 (## Introduction {#intro})
  - file2.md:3 (## Introduction {#intro})
```

**Реализация**: Добавить в Этап 5 (Source maps) или как отдельный Этап 7.

---

### Q9: Этап 1 (`{% included %}` блоки) — нужно ли исправлять? ✅ РЕШЕНО

**Контекст**: Этап 1 реализован (v2) с использованием `{% included %}` блоков, но решение
не заработало полностью (проблемы на стороне чтения — viewer). В рамках последующих
этапов (2–5) предполагается полный инлайнинг, который потенциально делает `{% included %}`
подход ненужным. Вопрос: нужно ли исправлять Этап 1, и если да — как совместить оба подхода?

**Анализ двух подходов:**

|                          | `{% included %}` блоки (Этап 1)                                                             | Полный инлайнинг (Этапы 2–5)                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Запись (md2md)**       | `{% include %}` директивы сохраняются, контент deps дописывается как `{% included %}` блоки | `{% include %}` директивы заменяются контентом с обработкой notitle/hash/отступов/terms |
| **Чтение (viewer/CLI)**  | Transform pipeline обрабатывает includes (notitle, hash, terms)                             | Контент уже "плоский", includes не обрабатываются                                       |
| **Сложность реализации** | Низкая — используется существующий transform pipeline                                       | Высокая — нужно переимплементировать notitle/hash/terms/отступы на уровне текста        |
| **Выигрыш**              | Устраняет S3 запросы                                                                        | Устраняет S3 запросы + снижает нагрузку на рендеринг                                    |
| **Риски**                | Минимальные — опирается на проверенный код                                                  | Высокие — текстовый парсинг markdown хрупок                                             |

**Решение: Прогрессивный инлайнинг с `{% included %}` fallback**

Использовать ОБА подхода одновременно с постепенным расширением inline-возможностей:

1. **Исправить Этап 1** — `{% included %}` блоки становятся рабочим fallback-механизмом
2. **Добавить простой инлайнинг** — инклюды без сложностей встраиваются по месту
3. **Постепенно расширять** — каждый этап добавляет поддержку новых сложностей для инлайнинга
4. **Финальная цель** — все инклюды встраиваются, `{% included %}` блоки не генерируются

**Критерии для инлайнинга (include встраивается по месту, если ВСЕ условия выполнены):**

| Условие                                  | Проверка                                            | Реализуется в   |
| ---------------------------------------- | --------------------------------------------------- | --------------- |
| Нет отступа (не внутри списка/таба/ката) | `indent === 0` на строке с `{% include %}`          | Этап 1b (сразу) |
| `notitle` обработан                      | Простое удаление первого заголовка (строка `# ...`) | Этап 1b (сразу) |
| Нет `#hash` секции                       | Нет `#fragment` в пути файла                        | Этап 3          |
| Нет term definitions в контенте          | Нет паттерна `[*key]:` в контенте                   | Этап 4          |

Если ХОТЯ БЫ ОДНО условие не выполнено — используется `{% included %}` fallback.

**Как это работает в выходном файле:**

```markdown
# Основной контент

Контент из simple.md (встроен по месту — был простой include)

{% include [title](complex.md#section) %}

{% included (_includes/complex.md) %}
Контент complex.md (сложный include — hash, оставлен как included)
{% endincluded %}
```

**Как это работает при чтении:**

- Встроенный контент — просто текст, ничего делать не нужно
- `{% include %}` + `{% included %}` — обрабатывается transform pipeline как обычно
- Оба формата прозрачно работают: `preprocessors/included` парсит блоки, `plugins/includes`
  резолвит директивы, встроенный контент уже является частью документа

**Обработка вложенных includes при смешанном подходе:**

Если родительский include A инлайнится, а дочерний B — нет:

1. Контент A вставляется по месту (с перебазированными путями через `rebaseRelativePaths`)
2. `{% include %}` директива для B внутри A теперь в основном контенте с перебазированным путём
3. B добавляется как `{% included (rebased-B-path) %}` блок (БЕЗ colon-chain, т.к. A уже инлайнен)
4. Transform pipeline резолвит B по перебазированному пути

**Пример:**

```markdown
<!-- main.md включает outer.md, outer.md включает inner.md#section -->
<!-- outer.md — простой include (indent=0, no hash, no terms) → инлайнится -->
<!-- inner.md — сложный include (есть #section) → {% included %} fallback -->

# Заголовок из main.md

Контент из outer.md (встроен по месту)

{% include [inner](_includes/inner.md#section) %}

{% included (_includes/inner.md) %}
Контент inner.md
{% endincluded %}
```

**Преимущества:**

- ✅ Рабочее решение сразу (после исправления `{% included %}` fallback)
- ✅ ~80% инклюдов — простые, инлайнятся сразу на Этапе 1b
- ✅ Сложные кейсы надёжно обрабатываются через battle-tested transform pipeline
- ✅ Каждый этап расширяет множество инлайн-способных инклюдов
- ✅ Безопасный откат: если инлайнинг не работает для кейса — fallback на `{% included %}`
- ✅ Постепенная миграция: можно отслеживать метрику "% инлайненных инклюдов"

**Что было сломано и исправлено (v3):**

Запись (md2md) работала. Чтение (md2html) было сломано по трём причинам:

1. **ENOENT при загрузке dep-файлов**: `MarkdownService._deps()` рекурсивно вызывает
   `load()` для каждого dep. Если dep-файл не существует (embedded в parent), `load()`
   создаёт `Defer` и вызывает `reject()`. Из-за timing issue с Defer-промисами ошибка
   не перехватывалась try-catch в `_deps()`. **Исправлено**: `load()` при ENOENT и `from`
   resolve'ит Defer с пустым content.
2. **Двойное перебазирование путей**: `merge-includes.ts` перебазировал пути в контенте
   (`rebaseRelativePaths`), но transform pipeline ещё раз резолвил их относительно source file
   через colon-chain key → двойной путь (`includes/includes/sub/user.md`).
   **Исправлено**: убран `rebaseRelativePaths` из `collectAllDeps`.
3. **`run.lint()` не обрабатывал `{% included %}` блоки**: `lint()` загружал dep-файлы
   напрямую через `this.files()` без `extractIncludedBlocks`.
   **Исправлено**: lint() аналогично transform() использует extractIncludedBlocks.

**Задачи (v5 — этап 1b, инлайнинг простых includes, выполнено):**

1. ✅ Реализован `canInlineInclude(dep, parentContent)` — проверка критериев инлайнинга
   (indent=0, нет hash в link, нет term definitions в контенте)
2. ✅ Реализован `stripFirstHeading(content)` — удаление первого заголовка для `notitle`
3. ✅ Модифицирован `mergeIncludes` — гибридный inline + fallback для каждого dep
4. ✅ Дедупликация `{% included %}` блоков через `seen` Set
5. ✅ Обработка вложенных deps при инлайнинге: `collectFallbackDepsForInlined` с ребейсенными ключами
6. ✅ Исправлен `rebaseLinksInLine` — добавлена `LINKED_IMAGE_RE` для `[![alt](img)](url)`
7. ✅ `output-md/index.ts` передаёт `graph.content` как `parentContent` в `mergeIncludes`
8. ✅ Обновлены все e2e снапшоты (preprocess, regression, includes, pdf-page, include-toc)

**Задачи (v6 — исправления rebasing ссылок и интеграция с viewer, выполнено):**

Массовое тестирование на реальных документациях выявило серию ошибок `YFM003` (unreachable link)
и `YFM016` (self-include), вызванных некорректным rebasing'ом ссылок при инлайнинге. Все исправлены:

1. ✅ **YFM016: self-include из `{% included %}` блоков**: `resolveDependencies` находила
   `{% include %}` директивы внутри `{% included %}` блоков и считала их self-include.
   **Исправлено**: в `resolve-deps.ts` добавлен early `continue` для exclude ranges.

2. ✅ **YFM003: некорректный rebase linked images с атрибутами**: Ссылки вида
   `[![alt](img){height=25px}](url)` не ребейзились из-за attributes между `)` и `]`.
   **Исправлено**: через серию улучшений regex (позднее поглощено упрощением).

3. ✅ **YFM003: rebase term-references и template directives**: `rebaseUrl()` пыталась
   ребейзить YFM-ссылки на термины (`*term`) и liquid-выражения (`{%...}`).
   **Исправлено**: добавлены проверки `url.startsWith('*')` и `url.startsWith('{')` в `rebaseUrl`.

4. ✅ **YFM003: некорректная детекция code fences**: Строки с inline backticks вроде
   `` `console.log()` `` ошибочно интерпретировались как открытие fenced code block.
   **Исправлено**: проверка по CommonMark — backtick fence не открывается если info string
   содержит backtick символы.

5. ✅ **YFM003: нестандартное закрытие code fence**: Закрывающий fence вида ` ```|| `
   (в таблицах) не распознавался из-за строгого `\s*$` в regex.
   **Исправлено**: regex закрытия fence теперь допускает `\s*\|\|` после fence символов.

6. ✅ **YFM003: leading space в URL ссылки**: Ссылки с пробелом `[text]( url)` не ребейзились.
   **Исправлено**: `\s*` после открывающей скобки в regex.

7. ✅ **YFM003: double-bracket autotitle синтаксис**: `[[!TITLE path]](url)` не ребейзились.
   **Исправлено**: через промежуточное решение с вложенными скобками (позднее упрощено).

8. ✅ **ReDoS (catastrophic backtracking)**: Строки с незакрытыми скобками в code spans
   вызывали бесконечный цикл в regex `(?:[^\[\]]*|\[[^\]]*\])*`.
   **Исправлено**: рефакторинг regex на backtrack-safe структуру (позднее упрощено).

9. ✅ **YFM003: вложенные ссылки**: `[outer [inner](inner-url) text](outer-url)` — сложные
   regex не могли корректно обработать обе URL во вложенных ссылках.
   **Исправлено**: полная замена на простой `LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g`,
   который матчит паттерн `](url` в любом контексте вложенности.

**Итоговое решение rebasing'а:**

Вместо сложных regex для каждого типа ссылок (`INLINE_LINK_RE`, `LINKED_IMAGE_RE`,
`FULL_LINKED_IMAGE_RE`, `DOUBLE_BRACKET_LINK_RE` + placeholder-механизм) используется
один универсальный regex:

```typescript
const LINK_URL_RE = /(\]\(\s*)([^)\s]+)/g;
```

Этот regex матчит паттерн `](url` — общий для ВСЕХ markdown-ссылок (inline, linked images,
nested links, autotitle) вне зависимости от глубины вложенности и сложности link text.
Для link definitions сохранён отдельный `LINK_DEF_RE`.

**Результат**: 127 unit-тестов, 118 e2e тестов, проверено на >10 реальных документациях.

10. ✅ **Viewer интеграция**: Проведён анализ кода viewer'а
    (`docs-viewer-external/packages/models/src/transformer`). **Изменений не требуется**:
    - `root` УЖЕ передаётся в `transformMarkdown` options (`doc-transform.js:140,148`)
    - `@diplodoc/transform` v4.70.1 содержит `preprocessors/included` — парсит `{% included %}`
      блоки и сохраняет контент в `md.included[resolvedPath]`
    - `md.ts:139` передаёт `md` в `preprocess()` → preprocessor получает markdown-it instance
    - Viewer'овский includes plugin (`plugins/includes/index.js:79-80`) уже делает lookup:
      `md?.included?.[resolve('./', pathname)]`
    - Ключи совпадают: preprocessor хранит по `resolve(fromDir, relativePath)`,
      plugin ищет по `resolve('./', viewerResolvedPath)` — оба дают одинаковый абсолютный путь
    - Colon-chain ключи обрабатываются preprocessor'ом: `_includes/outer.md:inner.md` →
      `getFullIncludePath('_includes/outer.md', root, path)` → `getFullIncludePath('inner.md', root, outer)`

**Оставшееся TODO:** Нет. Все задачи этапов 1a и 1b выполнены, включая интеграцию с viewer.

---

## E2E Test Plan

### Базовые сценарии

```
tests/e2e/merge-includes/
├── basic/
│   ├── input/
│   │   ├── main.md
│   │   ├── _includes/
│   │   │   ├── simple.md
│   │   │   └── nested.md
│   │   └── toc.yaml
│   └── expected/
│       └── main.md
├── notitle/
├── hash-section/
├── nested-lists/
├── tabs-and-cuts/
├── terms-basic/
├── terms-multiline/
├── terms-in-includes/
├── terms-conflicts/
├── circular-includes/
├── relative-paths/
└── frontmatter/
```

### Тестовые кейсы

| ID  | Сценарий              | Входные данные                   | Ожидаемый результат             |
| --- | --------------------- | -------------------------------- | ------------------------------- |
| T1  | Простой include       | `{% include [](a.md) %}`         | Контент a.md вставлен           |
| T2  | Include с notitle     | `{% include notitle [](a.md) %}` | Контент без первого заголовка   |
| T3  | Include с #hash       | `{% include [](a.md#section) %}` | Только секция section           |
| T4  | Вложенный include     | a.md включает b.md               | Оба контента вставлены          |
| T5  | Include в списке      | `- {% include [](a.md) %}`       | Контент с правильными отступами |
| T6  | Include в tabs        | Внутри `{% list tabs %}`         | Сохранена структура tabs        |
| T7  | Term definition       | `[*term]: описание`              | Term в конце файла              |
| T8  | Term multiline        | Term с несколькими строками      | Полное определение сохранено    |
| T9  | Term в include        | Include содержит terms           | Terms собраны в конец           |
| T10 | Term конфликт         | Одинаковый term в двух файлах    | Warning + хеширование ключа     |
| T11 | Циклический include   | a→b→a                            | Ошибка с понятным сообщением    |
| T12 | Относительные пути    | `![](./img.png)` в include       | Путь перебазирован              |
| T13 | Дублирующиеся anchors | `{#intro}` в двух includes       | Warning с указанием источников  |

## Related Documents

- [ADR-004: Output Format MD](./ADR-004-output-format-md.md)
- [ADR-005: Linting Includes Line Numbers](./ADR-005-linting-includes-line-numbers.md)
- PR #1305 (GitHub) — предыдущая попытка реализации
