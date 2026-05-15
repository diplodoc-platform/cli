<!-- LLM editing guide: When updating this file, follow these mandatory steps.
1) First, add a new section or improve/update an existing one (do not start with summaries).
2) Then, scan the whole document for logical conflicts or contradictions introduced by your change. If conflicts exist, resolve them (prefer the most recent, clearer guideline; remove duplicates; align terminology).
3) Finally, update the top summary sections (Rules at a glance, Quick links, Checklist) to reflect the new or changed content.
Keep edits minimal, consistent in style, and aligned with the existing anchors.
-->

## Base Architecture Principles

This document describes the core architectural principles used in this project.
They are intended to be reusable for other tools and libraries as well.

---

### Rules at a glance

1. Split responsibilities across small, focused modules (SRP).
2. Normalize inputs once at the boundary, then work with a clean model.
3. Invert dependencies via context and interfaces (DIP).
4. Extract reusable traversal / rendering patterns into helpers.
5. Keep entry points declarative; hide conditionals inside stages.
6. Prefer specific, type‑aware behavior where it clearly improves UX.
7. Provide documented extension points (CSS classes, hooks, callbacks).
8. Design for testability: pure functions, small modules, clear contracts.
9. Use domain‑specific test utilities (e.g. `ts-dedent`, context factories).
10. Document key architectural decisions (ADR, `ARCH.md`).
11. Treat errors as first‑class domain concepts with rich context.
12. Make complexity and performance characteristics explicit and controlled.

---

### Quick links

- [1. Separation of Concerns](#1-separation-of-concerns)
- [2. Data Normalization Before Processing](#2-data-normalization-before-processing)
- [3. Dependency Inversion through Context](#3-dependency-inversion-through-context)
- [4. Extract Reusable Patterns into Helpers](#4-extract-reusable-patterns-into-helpers)
- [5. Layered Composition for Readability](#5-layered-composition-for-readability)
- [6. Prefer Specific Solutions Over Generic Ones](#6-prefer-specific-solutions-over-generic-ones-when-ux-matters)
- [7. Provide Extension Points for Customization](#7-provide-extension-points-for-customization)
- [8. Design for Testability](#8-design-for-testability)
- [9. Use Domain-Specific Test Utilities](#9-use-domain-specific-test-utilities)
- [10. Document Architectural Decisions](#10-document-architectural-decisions)
- [11. Treat Errors as First-Class Domain Concepts](#11-treat-errors-as-first-class-domain-concepts)
- [12. Make Complexity and Performance Explicit](#12-make-complexity-and-performance-explicit)
- [Checklist](#checklist-are-we-applying-these-principles)

---

## 1. Separation of Concerns

**Principle**: Split logic into well‑testable stages, each with a single responsibility (SRP from SOLID).

**How we apply it**:

- Each module is responsible for one task (e.g. rendering descriptions, validations, examples).
- Modules talk through a shared interface (context) instead of direct tight coupling.
- It must be easy to replace or extend one part without touching the rest.

**Benefits**:

- Easier testing: each module can be tested in isolation.
- Easier to understand: you don’t need the whole system in your head.
- Easier maintenance: changes are localized.

**Example**:

```typescript
// ❌ Bad: everything in one function
function renderEverything(schema) {
  let output = '';
  if (schema.title) output += `**${schema.title}**\n`;
  if (schema.description) output += `${schema.description}\n`;
  if (schema.enum) output += `Enum: ${schema.enum.join(', ')}\n`;
  // ... ещё 200 строк
  return output;
}

// ✅ Good: separated responsibilities
function renderSchema(schema, context) {
  return blocks([
    renderTitle(schema, context),
    renderDescription(schema, context),
    renderValues(schema, context),
    // ...
  ]);
}
```

## 2. Data Normalization Before Processing

**Principle**: Normalize data _before_ heavy processing, not in the middle.

**How we apply it**:

- Inputs are converted to a canonical format as early as possible.
- Edge cases are normalized (e.g. nested `oneOf` in `oneOf` are flattened).
- Rendering / transformation logic works with predictable structures.

**Benefits**:

- Simpler downstream logic: no need to branch on all variants everywhere.
- Centralized edge‑case handling.
- Better readability: rendering logic is not cluttered with special cases.

**Example**:

```typescript
// ❌ Bad: checks in every stage
function renderType(schema) {
  // Проверяем вложенные oneOf
  if (schema.oneOf && schema.oneOf.length === 1 && schema.oneOf[0].oneOf) {
    schema = {...schema, oneOf: schema.oneOf[0].oneOf};
  }
  // ...
}

function renderDescription(schema) {
  // Опять та же проверка
  if (schema.oneOf && schema.oneOf.length === 1 && schema.oneOf[0].oneOf) {
    schema = {...schema, oneOf: schema.oneOf[0].oneOf};
  }
  // ...
}

// ✅ Good: normalize once
function normalizeSchema(schema) {
  // Сплющиваем вложенные oneOf
  if (schema.oneOf?.length === 1 && schema.oneOf[0].oneOf) {
    return {...schema, oneOf: schema.oneOf[0].oneOf};
  }
  return schema;
}

function renderSchema(schema, context) {
  const normalized = normalizeSchema(schema); // Один раз
  return renderType(normalized, context); // Работаем с чистыми данными
}
```

## 3. Dependency Inversion through Context

**Principle**: Use a context object to implement dependency inversion (DIP from SOLID).
Modules depend on _abstractions_, not concrete implementations.

**How we apply it**:

- Context holds callbacks/resolvers for external dependencies (e.g. `ref` for resolving links).
- Modules don’t know _how_ resolver works — they just call it.
- It’s easy to swap implementations in tests and between environments.

**Benefits**:

- Testability: mock resolvers in tests without changing real code.
- Flexibility: different implementations (FS, HTTP, cache, etc.).
- Loose coupling: modules are not tied to infrastructure details.

**Example**:

```typescript
// ❌ Bad: direct dependency on concrete implementation
import {resolveRefFromFile} from './fileResolver';

function renderType(schema) {
  if (schema.$ref) {
    const resolved = resolveRefFromFile(schema.$ref); // Hardcoded dependency
    // ...
  }
}

// ✅ Good: depend on abstraction via context
interface RenderContext {
  ref: (refId: string, schema: JSONSchema) => ResolvedRef | undefined;
  renderSchema: SchemaRenderer;
}

function renderType(schema, context: RenderContext) {
  if (schema.$ref) {
    const resolved = context.ref(schema.$ref, schema); // Abstraction
    // ...
  }
}

// In tests it’s easy to override
const testContext = {
  ref: (refId) => ({href: refId, schema: mockSchemas[refId]}),
  renderSchema: () => '',
};
```

## 4. Extract Reusable Patterns into Helpers

**Principle**: Logic that’s used in multiple places should be extracted into a reusable helper.

**How we apply it**:

- Identify repeating patterns (e.g. walking `$ref` chains).
- Extract them into a helper with a clear, small API.
- Use visitor‑style callbacks where behavior needs to vary.

**Benefits**:

- DRY: changes are done in one place.
- Consistency: everyone reuses the same traversal logic.
- Easier testing: helpers can be tested in isolation.

**Example**:

```typescript
// ❌ Bad: duplicated $ref traversal logic
function renderDescription(schema, context) {
  const descriptions = [];
  const seen = new Set();
  let current = schema;
  while (current) {
    if (current.description && !seen.has(current.description)) {
      descriptions.push(current.description);
      seen.add(current.description);
    }
    if (current.$ref && !seen.has(current.$ref)) {
      seen.add(current.$ref);
      const resolved = context.ref(current.$ref, current);
      current = resolved?.schema;
    } else {
      break;
    }
  }
  return descriptions.join('\n\n');
}

function renderValues(schema, context) {
  // Та же логика обхода повторяется...
  const values = [];
  const seen = new Set();
  let current = schema;
  // ... 15 строк дублированного кода
}

// ✅ Good: reusable helper
function traverseSchemaRefs(
  schema: JSONSchema,
  resolver: RefResolver,
  visitor: (current: JSONSchema, info: RefVisitInfo) => void,
): void {
  const seenRefs = new Set<string>();
  const stack = [{node: schema}];

  while (stack.length > 0) {
    const {node, refId} = stack.pop()!;
    if (refId && seenRefs.has(refId)) continue;
    if (refId) seenRefs.add(refId);

    visitor(node, {refId});

    if (node.$ref) {
      const resolved = resolver(node.$ref, node);
      if (resolved) {
        stack.push({node: resolved.schema, refId: node.$ref});
      }
    }
  }
}

// Usage
function renderDescription(schema, context) {
  const descriptions = [];
  const seen = new Set();

  traverseSchemaRefs(schema, context.ref, (current) => {
    if (current.description && !seen.has(current.description)) {
      descriptions.push(current.description);
      seen.add(current.description);
    }
  });

  return descriptions.join('\n\n');
}
```

## 5. Layered Composition for Readability

**Principle**: Entry points should be readable as a sequence of stages.
Keep conditional logic inside stages, not in the entry function.

**How we apply it**:

- Top‑level functions declaratively compose the results of smaller ones.
- Conditional logic is encapsulated inside each stage.
- The sequence of stages is visible at a glance.

**Benefits**:

- Readability: structure is obvious.
- Easy changes: add/remove/reorder stages with minimal impact.
- Simpler entry points: no embedded business logic.

**Example**:

```typescript
// ❌ Плохо: запутанная условная логика в точке входа
function renderSchema(schema, context) {
  let output = '';

  if (schema.title && !context.suppressTitle) {
    output += `**${schema.title}**\n\n`;
  }

  if (schema.deprecated && !context.suppressDeprecated) {
    output += '> ⚠️ Deprecated\n\n';
  }

  if (schema.type) {
    output += `**Type**: ${schema.type}\n\n`;
  } else if (schema.$ref) {
    // ... ещё 20 строк условий
  }

  if (schema.description && !someOtherCondition) {
    output += schema.description + '\n\n';
  }

  // ... продолжается ещё долго
  return output;
}

// ✅ Хорошо: декларативная композиция
function renderSchema(schema, context) {
  const normalized = normalizeSchema(schema);

  return blocks([
    renderTitle(normalized, context), // Условия внутри
    renderDeprecated(normalized, context), // Условия внутри
    renderType(normalized, context), // Условия внутри
    renderCombinators(normalized, context), // Условия внутри
    renderDescription(normalized, context), // Условия внутри
    renderValues(normalized, context), // Условия внутри
    renderAssertions(normalized, context), // Условия внутри
    renderExamples(normalized, context), // Условия внутри
  ]);
}

// Каждый этап сам решает, что возвращать
function renderDeprecated(schema, context) {
  if (context.suppressDeprecatedWarning) return '';
  if (!schema.deprecated) return '';
  return '> ⚠️ **Deprecated**: ...';
}
```

## 6. Prefer Specific Solutions Over Generic Ones (When UX Matters)

**Principle**: When generic handling produces bad UX, prefer targeted, type‑aware logic.

**How we apply it**:

- Identify cases where a generic solution produces noisy or confusing output.
- Add type‑aware or scenario‑specific logic for those cases.
- Balance genericity with quality of output.

**Benefits**:

- Better UX: users see relevant information, less noise.
- Lower cognitive load: documentation feels “smart”.
- More professional look and behavior.

**Example**:

```typescript
// ❌ Generic: show all assertions for all types
const assertions = [
  {key: 'minLength', label: 'Min length'},
  {key: 'minimum', label: 'Min value'},
  {key: 'minItems', label: 'Min items'},
  {key: 'minProperties', label: 'Min properties'},
];

function renderAssertions(schema) {
  return assertions
    .filter((a) => schema[a.key] !== undefined)
    .map((a) => `${a.label}: ${schema[a.key]}`)
    .join('\n');
}

// Result for type: string
// Min length: 5
// Min items: 1        ← Бессмысленно для string!
// Min properties: 2   ← Бессмысленно для string!

// ✅ Specific: type-aware filtering
const assertions = [
  {key: 'minLength', label: 'Min length', types: ['string']},
  {key: 'minimum', label: 'Min value', types: ['number', 'integer']},
  {key: 'minItems', label: 'Min items', types: ['array']},
  {key: 'minProperties', label: 'Min properties', types: ['object']},
];

function renderAssertions(schema) {
  const schemaTypes = extractTypes(schema); // ['string']

  return assertions
    .filter((a) => schema[a.key] !== undefined)
    .filter((a) => !a.types || a.types.some((t) => schemaTypes.includes(t)))
    .map((a) => `${a.label}: ${schema[a.key]}`)
    .join('\n');
}

// Result for type: string
// Min length: 5  ← Только релевантные assertions
```

## 7. Provide Extension Points for Customization

**Principle**: Provide clear extension points (CSS classes, themes, callbacks) for customization.

**How we apply it**:

- Add CSS classes to output elements for styling.
- Document available classes and their meaning.
- Allow users to override appearance without changing code.

**Important**: Document all extension points (classes, hooks, callbacks).

**Benefits**:

- Flexibility: users can style output for their needs.
- Backwards compatibility: style changes don’t break code.
- Separation of concerns: logic and presentation are independent.

**Example**:

```typescript
// ❌ Bad: hardcoded styles
function renderProperty(name, isRequired) {
  if (isRequired) {
    return `**${name}** (required)`;
  }
  return name;
}

// ✅ Good: extensibility via CSS classes
const CLASS_NAMES = {
  property: 'json-schema-property',
  required: 'json-schema-required',
  deprecated: 'json-schema-deprecated',
} as const;

function renderProperty(name, isRequired, isDeprecated) {
  return decorate(
    name,
    CLASS_NAMES.property,
    isRequired ? CLASS_NAMES.required : undefined,
    isDeprecated ? CLASS_NAMES.deprecated : undefined,
  );
  // => _name_{.json-schema-reset .json-schema-property .json-schema-required}
}

// In CSS file
/*
.json-schema-required::before {
  content: '*';
  color: red;
}

.json-schema-deprecated {
  text-decoration: line-through;
  opacity: 0.6;
}
*/
```

**Class documentation**:

```css
/* schema-to-md.css */

/* Property types */
.json-schema-property {
  /* Regular properties */
}
.json-schema-additional-property {
  /* additionalProperties */
}
.json-schema-pattern-property {
  /* patternProperties */
}

/* Property states */
.json-schema-required {
  /* Required fields - adds * prefix */
}
.json-schema-deprecated {
  /* Deprecated fields - strikethrough */
}

/* Content decorations */
.json-schema-assertion {
  /* Validation constraint labels */
}
.json-schema-reset {
  /* Resets default Markdown styling */
}
```

## 8. Design for Testability

**Principle**: Architecture should make unit‑testing easy and effective.

**How we apply it**:

- **Context pattern**: dependencies are easy to swap in tests.
- **Pure functions** where possible: deterministic output for a given input.
- **Small modules**: each module can be tested in isolation.
- **Clear interfaces**: minimal mocking, prefer real calls through abstraction.

**Benefits**:

- Fast tests: no real I/O.
- Reliable tests: fewer flaky failures from external systems.
- Easier debugging: problems are localized.

**Example**:

```typescript
// ❌ Плохо: сложно тестировать
import fs from 'fs';
import path from 'path';

function renderType(schema) {
  if (schema.$ref) {
    // Читаем файл напрямую - требует реальной FS в тестах
    const refPath = path.join(__dirname, schema.$ref);
    const refSchema = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
    return renderType(refSchema);
  }
  return `**Type**: ${schema.type}`;
}

// ✅ Хорошо: легко тестировать через context
interface RenderContext {
  ref: (refId: string, schema: JSONSchema) => ResolvedRef | undefined;
  renderSchema: SchemaRenderer;
}

function renderType(schema, context: RenderContext) {
  if (schema.$ref) {
    // Вызываем абстракцию - легко мокается
    const resolved = context.ref(schema.$ref, schema);
    if (!resolved) return '**Type**: unknown';
    return `**Type**: [${resolved.label}](${resolved.href})`;
  }
  return `**Type**: ${schema.type}`;
}

// Тест без реальной FS
it('renders $ref as link', () => {
  const mockContext = {
    ref: (refId) => ({
      label: 'User',
      href: '#user',
      schema: {type: 'object'},
    }),
    renderSchema: () => '',
  };

  const result = renderType({$ref: '#/defs/User'}, mockContext);
  expect(result).toBe('**Type**: [User](#user)');
});
```

## 9. Use Domain-Specific Test Utilities

**Principle**: Use test utilities tailored to this domain to keep tests readable and maintainable.

**How we apply it**:

- **`ts-dedent`** for multi‑line string assertions — preserves formatting and readable diffs.
- **Helper factories** for test contexts — avoid duplicated setup.
- **Custom matchers** (when needed) for domain‑specific assertions.

**Benefits**:

- Readability: tests read like specs, not plumbing.
- Maintainability: setup changes are done in one place.
- Clear diffs: changes in snapshots are easy to understand.

**Example**:

```typescript
// ❌ Плохо: сложно читать multi-line strings
it('renders object table', () => {
  const result = renderObject(schema);
  expect(result).toBe(
    '{% cut "**Type**: object" %}\n\n#|\n|| Name | Description ||\n||\nname\n|\n**Type**: string\n||\n|#\n\n{% endcut %}',
  );
  // Невозможно понять структуру вывода
});

// ✅ Хорошо: ts-dedent для читаемости
import dedent from 'ts-dedent';

it('renders object table', () => {
  const result = renderObject(schema);

  expect(result).toBe(dedent`
    {% cut "**Type**: object" %}

    #|
    || Name | Description ||
    ||
    name
    |
    **Type**: string
    ||
    |#

    {% endcut %}
  `);
  // Структура видна сразу, легко найти проблему в diff
});

// ✅ Helper factories для test contexts
function createTestContext(overrides = {}): RenderContext {
  return {
    ref: overrides.ref ?? (() => undefined),
    renderSchema: overrides.renderSchema ?? (() => ''),
    ...overrides,
  };
}

it('resolves $ref in description', () => {
  const refs = {
    '#/defs/Base': {description: 'Base description'},
  };

  const context = createTestContext({
    ref: (refId) => ({
      href: refId,
      schema: refs[refId],
    }),
  });

  const result = renderDescription({$ref: '#/defs/Base'}, context);
  expect(result).toBe('Base description');
});
```

## 10. Document Architectural Decisions

**Принцип**: Документируйте ключевые архитектурные решения и их обоснования.

**Как применяется**:

- Создавайте Architecture Decision Records (ADR)
- Пишите `ARCH.md` с обоснованием решений
- Комментируйте неочевидные архитектурные паттерны в коде

**Преимущества**:

- Новые разработчики понимают "почему", а не только "как"
- Избегаете повторного обсуждения уже решённых вопросов
- Сохраняете контекст для будущих рефакторингов

**Пример структуры ADR**:

```markdown
# ADR-001: Context Pattern for Dependency Injection

## Status

Accepted

## Context

Modules need to resolve $ref values but should not know about concrete loading details
(files, HTTP, memory, etc.).

## Decision

Use the Context Pattern with `ref: RefResolver` for dependency inversion.

## Consequences

✅ Easy to test
✅ Flexible with different data sources
❌ Additional abstraction (Context API)

## Alternatives Considered

1. Singleton registry — global state, hard to test
2. Direct imports — tight coupling, cannot be swapped
```

## 11. Treat Errors as First-Class Domain Concepts

**Principle**: Errors are part of the domain, not just “exceptions that happen sometimes”.

**How we apply it**:

- Use explicit error types/classes (e.g. `OpenApiIncluderError`) with contextual information (path, ref id, etc.).
- Separate _where_ an error is detected from _where_ it is presented to users.
- Prefer domain‑specific error messages over generic `Error('Something went wrong')`.

**Benefits**:

- Clearer diagnostics and better UX for users reading logs / build output.
- Easier to test: error conditions can be asserted precisely.
- Less accidental leaking of low‑level details (FS, YAML/JSON parser internals, etc.).

**Example**:

```typescript
// Domain-specific error with path context
class OpenApiIncluderError extends Error {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message);
    this.name = 'OpenApiIncluderError';
  }
}

// Wrapping low-level errors
try {
  // ...
} catch (error) {
  throw new OpenApiIncluderError(String(error), tocPath);
}
```

## 12. Make Complexity and Performance Explicit

**Principle**: Traversals and normalizations over large specs should have obvious and controlled complexity.

**How we apply it**:

- Avoid hidden quadratic (or worse) algorithms in `$ref` resolution and schema traversal.
- Use simple safeguards where needed (e.g. `MAX_DEPTH`, cycle detection sets).
- Cache results for repeated expensive operations when it’s safe and measurable.

**Benefits**:

- Predictable performance on large specs.
- Easier reasoning about the cost of new features.
- Fewer surprises in CI / production builds.

**Example**:

```typescript
const MAX_DEPTH = 5;

function generateExampleInternal(schema: JSONSchema | undefined, state: GenerationState): unknown {
  if (!schema || state.depth > MAX_DEPTH) {
    return undefined;
  }

  // ...
}
```

---

## Checklist: Are We Applying These Principles?

- [ ] Modules have a single responsibility (SRP)
- [ ] Inputs are normalized at the boundary
- [ ] Dependencies are inverted through context/interfaces (DIP)
- [ ] Reusable patterns are extracted into helpers
- [ ] Entry points are declarative, without embedded business logic
- [ ] Specific solutions are used where they clearly improve UX
- [ ] There are clear extension points for customization
- [ ] Architecture is designed for testability
- [ ] Domain-specific test utilities are used
- [ ] Key decisions are documented (ADR / ARCH.md)
- [ ] Errors are treated as first-class domain concepts
- [ ] Traversals/normalizations have explicit and reasonable complexity

---

**Remember**: Good architecture makes the right decisions easy, and the wrong ones hard.
