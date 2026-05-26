# Build Content Map — дизайн

**Дата:** 2026-05-26
**Статус:** утверждено к реализации
**Пакет:** `@diplodoc/cli`

## Цель

Записать в артефакты сборки content-fingerprint каждой выходной страницы и ресурса, по которому offline-инструмент может вычислить точный набор страниц, изменившихся между двумя любыми ревизиями билда.

Основные потребители:

- индексация поиска: переиндексировать только изменённые страницы;
- рассылка уведомлений авторам/подписчикам об изменении страницы.

Diff между ревизиями строится **постпроцессом** над двумя файлами манифеста. Сборка не должна знать о других ревизиях и не должна делать incremental build.

## Не-цели

- Incremental build / кеш переиспользования.
- Root cause analysis ("почему страница изменилась"). Возможное расширение в schema v2.
- HTML-уровневое сравнение содержимого. Возможное расширение в schema v2.
- Запись хешей исходников. Возможное расширение в schema v2.
- Сам diff-инструмент. Он живёт у потребителя.

## Контекст

CLI собирает документацию в нескольких форматах. `md2md` сохраняет результат в S3, потребитель (поиск, рассыльщик) читает оттуда. Релевантные для дизайна свойства текущего билда:

- `mergeIncludes` в `md2md` по умолчанию **выключен** и таким останется ещё около месяца, потом включится.
- `hashIncludes` в `md2md` по умолчанию **включён**. Это значит, что include-файлы в output получают подпись по содержимому: `inc.md → inc-{12hex}.md` (см. `signlink` в `packages/cli/src/commands/build/features/output-md/utils.ts`), а ссылки в parent-страницах переписываются на это имя.
- Картинки/видео/svg-ассеты не подвергаются никаким fingerprint-преобразованиям: ссылка `![](pic.png)` остаётся как есть.
- В проекте уже есть граф зависимостей `run.entry.relations`: для каждой entry он содержит прямые dependencies с типами `entry | source | resource | missed`.
- Существующий `yfm-build-manifest.json` описывает структуру (toc-mapping, file-trie, redirects, yfm-config) и нужен docs-viewer'у для навигации. К нему не примешиваем content-fingerprint.

### Как изменения распространяются по графу

| Сценарий                                     | Что в финальном `.md` entry-страницы           | Как изменение include видно в diff                                |
| -------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `mergeIncludes: true`                        | Контент include встраивается inline            | Через сам контент entry → хеш entry меняется                      |
| `mergeIncludes: false`, `hashIncludes: true` | Ссылка `[](inc-{12hex}.md)` с подписью include | Через имя файла → ссылка в entry обновляется → хеш entry меняется |
| Картинка                                     | `![](pic.png)` — не меняется при изменении png | **Не видно** через хеш entry. Нужен явный граф `page → asset`.    |

Из таблицы следует ключевое архитектурное решение: для покрытия всех живых сценариев достаточно (а) хешировать каждый файл из `run.output`, индексируя по source-path, и (б) записать прямые ассет-зависимости для каждой entry. Граф для includes избыточен в обоих сценариях, актуальных для проекта.

## Артефакт

Новый файл рядом с уже существующими `yfm-*`-артефактами:

**`yfm-build-content.json`**

```json
{
  "schemaVersion": 1,
  "contentHashes": {
    "ru/foo.md": {"hash": "sha256-...", "size": 1234},
    "ru/foo/inc.md": {"hash": "sha256-...", "size": 567},
    "ru/img/pic.png": {"hash": "sha256-...", "size": 8901}
  },
  "pageAssets": {
    "ru/foo.md": ["ru/img/pic.png"]
  }
}
```

Правила:

- **Ключи во всех секциях — source-paths** (стабильны между билдами; output-paths нестабильны из-за signlink).
- **`contentHashes[source]`** — `sha256` финального файла из `run.output`, отображённого через mapping source → output:
  - entry/leading: identity (`foo.md → foo.md`);
  - include при `hashIncludes: true`, `mergeIncludes: false`: через `signlink`;
  - include при `mergeIncludes: true`: ключа нет — include-файл не пишется в output, его контент уже в entry;
  - asset: identity (`pic.png → pic.png`).
- **`size`** — размер в байтах файла в output. Дешёвый эвристический сигнал для потребителя; не влияет на диффинг.
- **`hash`** имеет префикс `sha256-` для возможности эволюции алгоритма без поломок.
- **`pageAssets[source]`** — прямые `resource`-зависимости entry, нормализованные к source-paths. Includes сюда не пишутся.
- **`schemaVersion: 1`** — для будущей совместимости.

## Diff-алгоритм (на стороне потребителя)

```
changed_pages = {
  p ∈ entries(curr) |
       prev.contentHashes[p]?.hash ≠ curr.contentHashes[p]?.hash
    OR ∃ a ∈ curr.pageAssets[p]:
         prev.contentHashes[a]?.hash ≠ curr.contentHashes[a]?.hash
}
```

Плюс отдельно — добавленные и удалённые страницы:

```
added_pages   = keys(curr.contentHashes) \ keys(prev.contentHashes)
removed_pages = keys(prev.contentHashes) \ keys(curr.contentHashes)
```

Diff-инструмент сам решает, какой фильтр накладывать на типы файлов: для индексации поиска — `.md` и `.yaml`, для CDN-инвалидации — всё.

## Имплементация

### Где живёт код

Новая фича `build-content-map` по образцу `build-stats`:

```
packages/cli/src/commands/build/features/build-content-map/
  ├── index.ts
  ├── index.spec.ts
  └── config.ts
```

Регистрируется наряду с `BuildStats`, `BuildManifest` в общем pipeline билда.

### Флаг

`--build-content` (поведение в точности как у `--build-stats`, `--build-manifest`):

- option в `config.ts` через `~/core/config`;
- `Command` hook добавляет опцию;
- `Config` hook нормализует `valuable(...)`-проверкой из CLI-аргумента и yfm-config.

### Хук и пайплайн

Используем `AfterAnyRun` (как `BuildStats`), не `AfterRun.for('md')` — артефакт должен работать в любом outputFormat, не только в `md`.

Последовательность внутри `AfterAnyRun`:

1. Если `run.config.buildContent !== true` — выходим.
2. Собираем `pageAssets`: проходим `run.entry.relations`, для каждой ноды типа `entry` берём прямые dependencies с `type === 'resource'`. Ключи нормализуем как source-paths.
3. Глобим `run.output`: `run.glob('**/*', { cwd: run.output })`. Из списка вычитаем служебные файлы по фильтру (см. "Исключения" ниже).
4. Для каждого output-файла определяем его source-path по правилам секции "Mapping source → output".
5. Параллельно (`pmap`, concurrency 30 — как `STAT_CONCURRENCY` в `build-stats`) для каждого output-файла:
   - читаем содержимое через `run.fs.readFile`;
   - считаем `sha256(content)`, форматируем как `sha256-{hex}`;
   - читаем `size` через `run.fs.stat`;
   - пишем в `contentHashes[source]`.
6. Сериализуем result, пишем `yfm-build-content.json` через `run.write` с overwrite.

### Исключения из обхода

Свои собственные служебные файлы билда не должны попадать в `contentHashes`: они шумят при diff и иногда содержат сами хеши других файлов, что даёт рекурсивный шум.

Фильтр — по имени на верхнем уровне output. Конкретный набор уточняем эмпирически (см. "Открытые вопросы"), стартовый список:

- `yfm-build-manifest.json`
- `yfm-build-stats.json`
- `yfm-build-content.json`
- `yfm-redirects-meta-file.json`
- любые `yfm-*-meta.json`

### Mapping source → output (детальный алгоритм)

Тонкое место. План:

1. Из `run.entry.relations` собираем три множества source-paths:
   - `entries`: ноды типа `entry`;
   - `sources`: ноды типа `source` (include-файлы);
   - `resources`: ноды типа `resource`.
2. Для каждого output-файла определяем его source:
   - если output-path совпадает с одной из нод (`entries ∪ sources ∪ resources`) — identity-mapping (source = output);
   - иначе пытаемся распарсить `name-{12hex}.{ext}` и проверить, есть ли `name.{ext}` в `sources`. Если есть — это include с signlink, маппим к source;
   - иначе — файл не присутствует в graph: identity-mapping и логируем `debug` (это нормально для assets, которые prefix-копируются — например ассеты темы). Пропуск делаем только если файл попал под фильтр исключений из предыдущей секции.
3. Для include с `mergeIncludes: true` соответствующего файла в output нет — в `contentHashes` он отсутствует. Это корректное поведение: его содержимое уже в entry.

### Содержимое для хеширования

Используется **сырое содержимое файла в output** (`run.fs.readFile`, без нормализации). Это то, что реально попадает в S3 и читается потребителями. Нормализовать перевод строк или whitespace — не нужно: любая нормализация искажает картину "файл изменился".

### Конкурентность и ограничения

- `pmap` concurrency 30 (как `STAT_CONCURRENCY` в build-stats) — защита от EMFILE на больших проектах.
- На очень больших output (десятки тысяч файлов) feature добавит секунды к билду из-за чтения файлов. Это приемлемо для CI; для локального dev — `--build-content` не включаем по умолчанию.

### Деградация

- Если `run.entry.relations` пуст или не содержит entry-нод — `pageAssets` пустой, `contentHashes` строится только из glob output. Файл валиден.
- Если файл из glob не удаётся прочитать или статнуть — логируем warning и пропускаем (как `readOutputSize` в `build-stats`).
- Сам `yfm-build-content.json` ещё не существует на момент glob, поэтому в список не попадает. Остальные `yfm-*.json` снимаются фильтром из секции "Исключения".

## Тестирование

Unit-spec `index.spec.ts`:

1. Сравниваем два полных билда из одинакового исходника → идентичные `contentHashes` (детерминизм).
2. Меняем содержимое entry → меняется только её хеш в `contentHashes`.
3. Меняем содержимое include → хеш include меняется И хеш entry меняется (через signlink); `pageAssets` не меняется.
4. Меняем содержимое картинки → хеш картинки меняется, хеш entry **не** меняется (ожидаемо), но `pageAssets[entry]` всё ещё содержит этот asset, что позволяет потребителю засчитать entry как изменённую.
5. Добавляем картинку в entry → `pageAssets[entry]` расширяется.
6. С `mergeIncludes: true` хеш include-файла отсутствует в `contentHashes`, но хеш entry меняется.
7. Служебные файлы `yfm-*.json` не появляются в `contentHashes`.

E2E на реальной мини-документации в `tests/e2e/`:

- собираем dataset с одной entry, одним include, одной картинкой;
- проверяем структуру `yfm-build-content.json`;
- меняем картинку, пересобираем, проверяем что хеш картинки изменился, `pageAssets` стабилен.

### Детерминизм — задача 0

Перед началом написания фичи проверяем экспериментально, что два полных билда одного исходника дают идентичные хеши финальных файлов. Кандидаты на нестабильность:

- `addMetaFrontmatter` — порядок полей в YAML frontmatter ([packages/cli/src/commands/build/features/output-md/index.ts:233](packages/cli/src/commands/build/features/output-md/index.ts#L233));
- timestamp в meta (если есть);
- `Map`/`Set` обходы без сортировки в плагинах.

Если найдётся источник нестабильности — фиксим его (это в любом случае баг для воспроизводимости сборки). Только после этого начинаем реализацию хеширования.

## Эволюция

Schema v2 (не сейчас, не часть этого спека, но дизайн закладывает совместимость):

- `sourceHashes: { [src]: { hash, size } }` — хеш исходника, рядом с финальным;
- `pageIncludes: { [page]: string[] }` — прямые includes для root-cause;
- `htmlHash: { [page]: string }` — отдельный hash от md2html для индексации поиска без include-обёрток;
- composite-hash страницы — не нужен на стороне сборки, может вычисляться diff-инструментом.

Все будущие поля добавляются как новые ключи в существующий JSON. Старые потребители игнорируют незнакомые поля. `schemaVersion: 2` сигнализирует о наличии новых полей; v1-потребитель продолжит работать.

## Открытые вопросы (не блокеры реализации)

1. Какой именно набор `yfm-*.json` исключать из обхода? Будет уточнено по факту просмотра текущих artifact-имён в `run.output`.
2. Нужна ли отдельная enum-метка `type: page | include | asset` рядом с каждым хешем? Сейчас потребитель определяет по extension и по факту присутствия в `pageAssets`-значениях. Если этого окажется недостаточно — добавляется в v2.
