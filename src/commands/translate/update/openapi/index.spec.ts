import {expect, test} from 'vitest';
import {parse, stringify} from 'yaml';

import {planOpenapi} from './index';

const root = 'openapi.yaml';

function plan(
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
    target: string,
    current = after,
) {
    return planOpenapi(root, before, after, current, target, 'ru', 'en');
}

test('projects a reference-file description insertion at a unique protected anchor', () => {
    const spec = 'openapi: 3.0.3\npaths:\n  /books:\n    $ref: paths.yaml#/books\n';
    const fragment = [
        'books:',
        '  get:',
        '    operationId: listBooks',
        '    description: |',
        '      Используйте `pageToken`.',
        '',
    ].join('\n');
    const before = new Map([
        [root, spec],
        ['paths.yaml', fragment],
    ]);
    const after = new Map(before);
    after.set(
        'paths.yaml',
        fragment.replace('      Используйте', '      Список книг.\n\n      Используйте'),
    );
    const target = [
        '# Reviewed',
        'openapi: 3.0.3',
        'paths:',
        '  /books:',
        '    get:',
        '      operationId: listBooks # review',
        '      description: |',
        '        Pass :no-translate[`pageToken`].',
        '',
    ].join('\r\n');

    const update = plan(before, after, target);
    expect(update.input.trim()).toBe('Список книг.');
    expect(update.apply('List books.')).toBe(
        target.replace('        Pass', '        List books.\r\n\r\n        Pass'),
    );
    const stale = new Map(after);
    stale.set('paths.yaml', after.get('paths.yaml')!.replace('Список книг.', 'Новая версия.'));
    expect(() => plan(before, after, target, stale)).toThrow();
});

test('adds a route from a new file and keeps request example values opaque', () => {
    const target =
        'openapi: 3.0.3\npaths:\n  /books:\n    get:\n      operationId: listBooks # approved\n';
    const before = new Map([[root, target]]);
    const after = new Map(before);
    after.set(root, target + '  /authors:\n    $ref: author.yaml#/routes/create\n');
    after.set(
        'author.yaml',
        stringify({
            routes: {
                create: {
                    post: {
                        operationId: 'createAuthor',
                        summary: 'Добавить автора',
                        requestBody: {
                            content: {'application/json': {example: {description: 'Данные'}}},
                        },
                    },
                },
            },
        }),
    );
    const update = plan(before, after, target);
    expect(update.input).toContain('Добавить автора');
    expect(update.input).not.toContain('Данные');
    const output = update.apply(update.input.replace('Добавить автора', 'Add an author'));
    expect(output.startsWith(target)).toBe(true);
    expect(parse(output).paths['/authors'].post).toEqual({
        operationId: 'createAuthor',
        summary: 'Add an author',
        requestBody: {content: {'application/json': {example: {description: 'Данные'}}}},
    });
});

test('does not translate or reserialize a change to a technical sequence', () => {
    const target = [
        'openapi: 3.0.3',
        'paths:',
        '  /books:',
        '    get:',
        '      operationId: listBooks',
        '      summary: Browse books # reviewed',
        '      x-access-scopes:',
        '        - read # keep',
        '        - comment',
        '',
    ].join('\r\n');
    const original = target.replace('Browse books # reviewed', 'Список книг');
    const changed = original.replace('        - comment', '        - write\r\n        - comment');
    const update = plan(new Map([[root, original]]), new Map([[root, changed]]), target);
    expect(update.input).toBe('');
    expect(update.apply('')).toBe(
        target.replace('        - comment', '        - write\r\n        - comment'),
    );
    expect(() => update.apply('unexpected')).toThrow();
});

test('detects a semantic no-op when a local reference moves to an added file', () => {
    const mark = 'openapi: 3.0.3\npaths:\n  /books:\n    $ref: old.yaml#/books\n';
    const books = 'books:\n  get:\n    operationId: listBooks\n';
    const target = 'openapi: 3.0.3\npaths:\n  /books:\n    get:\n      operationId: listBooks\n';
    const before = new Map([
        [root, mark],
        ['old.yaml', books],
    ]);
    const after = new Map([
        [root, mark.replace('old.yaml', 'new.yaml')],
        ['new.yaml', books],
    ]);
    const update = plan(before, after, target);
    expect(update.input).toBe('');
    expect(update.apply('')).toBe(target);
});

test('keeps a note-title edit attached to its operation across surrounding source edits', () => {
    const base = 'openapi: 3.0.3\npaths:\n  /books:\n    $ref: paths.yaml#/books\n';
    const books = [
        'books:',
        '  get:',
        '    operationId: listBooks',
        '    description: |',
        '      Поиск книг.',
        '',
        '      {% note info "Справка" %}',
        '',
        '      Введите название.',
        '',
        '      {% endnote %}',
        '',
    ].join('\n');
    const before = new Map([
        [root, base],
        ['paths.yaml', books],
    ]);
    const after = new Map(before);
    after.set(root, base + '  /authors:\n    $ref: authors.yaml#/create\n');
    after.set('paths.yaml', books.replace('Справка', 'Поиск'));
    after.set(
        'authors.yaml',
        'create:\n  post:\n    operationId: createAuthor\n    summary: Новый автор\n',
    );
    const current = new Map(after);
    current.set('paths.yaml', after.get('paths.yaml')!.replace('Поиск книг.', 'Каталог.'));
    const target = [
        'openapi: 3.0.3',
        'paths:',
        '  /books:',
        '    get:',
        '      operationId: listBooks',
        '      description: |',
        '        Browse books.  ',
        '',
        '        {% note info "Справка" %}',
        '',
        '        Enter a title.',
        '',
        '        {% endnote %}',
        '',
    ].join('\n');

    const update = plan(before, after, target, current);
    expect(update.input).not.toContain('Каталог.');
    expect(update.input).not.toContain('Введите название.');
    const translated = update.input.replace('Поиск', 'Search').replace('Новый автор', 'New author');
    expect(update.apply(translated).startsWith(target.replace('Справка', 'Search'))).toBe(true);
    expect(parse(update.apply(translated)).paths['/authors'].post.summary).toBe('New author');
    expect(() => update.apply(translated.replace(/^.*\n/, ''))).toThrow();

    const drift = new Map(current);
    drift.set(
        'paths.yaml',
        current.get('paths.yaml')!.replace('Введите название.', 'Укажите год.'),
    );
    expect(() => plan(before, after, target, drift)).toThrow();
});

test('projects a new scalar request property without requiring an item reference', () => {
    const spec = 'openapi: 3.0.3\npaths:\n  /books:\n    $ref: books.yaml#/bookRoutes\n';
    const original = [
        'bookRoutes:',
        '  post:',
        '    operationId: createBook',
        '    requestBody:',
        '      content:',
        '        application/json:',
        '          schema:',
        '            $ref: "#/Book"',
        'Book:',
        '  type: object',
        '  properties:',
        '    title:',
        '      type: string',
        '',
    ].join('\n');
    const before = new Map([
        [root, spec],
        ['books.yaml', original],
    ]);
    const desired = original + '    hardcover:\n      type: boolean\n';
    const after = new Map([
        [root, spec],
        ['books.yaml', desired],
    ]);
    const target = [
        'openapi: 3.0.3',
        'paths:',
        '  /books:',
        '    post:',
        '      operationId: createBook',
        '      requestBody:',
        '        content:',
        '          application/json:',
        '            schema:',
        '              type: object',
        '              properties:',
        '                title:',
        '                  type: string',
        '',
    ].join('\n');

    const update = plan(before, after, target);
    expect(update.input).toBe('');
    expect(update.apply('')).toBe(
        target + '                hardcover:\n                  type: boolean\n',
    );
});
