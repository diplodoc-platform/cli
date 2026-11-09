import type {MetadataField} from './types';

import {ok} from 'node:assert';
import {lstat, readFile, writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {glob} from 'glob';
import {dump, load} from 'js-yaml';
import {isMap, isScalar, parseDocument} from 'yaml';

export async function listDocuments(input: AbsolutePath): Promise<AbsolutePath[]> {
    const info = await lstat(input);

    if (info.isFile()) {
        ok(/\.(md|ya?ml)$/i.test(input), 'Expected a Markdown or YAML documentation file.');

        return [input];
    }

    ok(info.isDirectory(), `Expected a file or directory: ${input}`);

    return (
        await glob('**/*.{md,yaml,yml}', {
            cwd: input,
            absolute: true,
            nodir: true,
            ignore: ['**/node_modules/**', '**/_includes/**', '**/toc.yaml', '**/presets.yaml'],
        })
    ).sort((left, right) => left.localeCompare(right)) as AbsolutePath[];
}

export async function readDocument(path: AbsolutePath) {
    const info = await lstat(path);

    if (!info.isFile()) {
        return undefined;
    }

    const source = await readFile(path, 'utf8');
    const markdown = extname(path).toLowerCase() === '.md';
    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
    let prefix = `---${newline}`;
    let suffix = `---${newline}${source.slice(bom.length)}`;
    let yaml = '';

    if (markdown) {
        const opening = /^\uFEFF?-{3,}[ \t]*\r?\n/.exec(source);

        if (opening) {
            const rest = source.slice(opening[0].length);
            const closing = /^(?:-{3,}|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(rest);
            ok(closing, `Unclosed frontmatter in ${path}`);
            prefix = opening[0].slice(bom.length);
            yaml = rest.slice(0, closing.index);
            suffix = rest.slice(closing.index);
        }
    } else {
        yaml = source;
    }

    const document = parseDocument(yaml, {merge: true});

    if (
        !markdown &&
        (!isMap(document.contents) || (!document.has('links') && !document.has('blocks')))
    ) {
        return undefined;
    }

    ok(
        !/{{|{%/.test(yaml),
        `${path}: Liquid templates in YAML are not supported; file not changed.`,
    );
    ok(document.errors.length === 0, `${path}: ${document.errors.map(String).join('; ')}`);
    ok(document.contents === null || isMap(document.contents), `${path}: expected a YAML mapping.`);

    const node = markdown ? document.contents : document.get('meta', true);
    const parsed = (load(yaml) ?? {}) as Record<string, unknown>;
    const metadata = ((markdown ? parsed : parsed.meta) ?? {}) as Record<string, unknown>;
    ok(
        typeof metadata === 'object' && !Array.isArray(metadata),
        `${path}: metadata must be a YAML mapping.`,
    );

    return {
        metadata: metadata as Partial<Record<MetadataField, unknown>>,
        source,
        async write(fields: Record<string, unknown>) {
            if (!markdown && !isMap(node)) {
                document.set('meta', document.createNode(metadata));
            }

            const generated = parseDocument(dump(fields, {forceQuotes: true, quotingType: '"'}));

            for (const field of Object.keys(fields)) {
                const fieldPath = markdown ? [field] : ['meta', field];
                const current = document.getIn(fieldPath, true);
                const target = generated.get(field, true);

                if (isScalar(current) && isScalar(target)) {
                    current.value = target.value;
                    current.type = target.type;
                } else {
                    document.setIn(fieldPath, target);
                }
            }

            const rendered = document.toString({lineWidth: 0}).replace(/\n/g, newline);
            const updated = load(rendered) as Record<string, unknown>;
            const updatedMetadata = (markdown ? updated : updated.meta) as Record<string, unknown>;
            ok(
                Object.entries(fields).every(([field, value]) =>
                    isDeepStrictEqual(updatedMetadata[field], value),
                ),
                `${path}: Serialized metadata does not match the generated values; file not changed.`,
            );

            const omitGenerated = (value: Record<string, unknown>) =>
                Object.fromEntries(
                    Object.entries(value).filter(
                        ([field]) => !Object.prototype.hasOwnProperty.call(fields, field),
                    ),
                );
            const before = markdown
                ? omitGenerated(metadata)
                : {...parsed, meta: omitGenerated(metadata)};
            const after = markdown
                ? omitGenerated(updated)
                : {...updated, meta: omitGenerated(updatedMetadata)};
            ok(
                isDeepStrictEqual(before, after),
                `${path}: Updating metadata would change unselected fields; file not changed.`,
            );

            const result = markdown ? prefix + rendered + suffix : bom + rendered;
            ok(
                (await readFile(path, 'utf8')) === source,
                `${path} changed during generation; not saved.`,
            );
            await writeFile(path, result);
        },
    };
}
