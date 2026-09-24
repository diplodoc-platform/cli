import type {ExtractOptions, JSONObject} from '@diplodoc/translation';
import type {CodeMode} from './config';

import {isEqual} from 'lodash';
import {extractFrontMatter} from '@diplodoc/liquid';
import liquid from '@diplodoc/transform/lib/liquid';

import {FileLoader, resolveSchemas} from './fs';
import {extract} from './translate';

export type LoadTranslationUnitsParams = {
    /** Absolute path of the file to read. */
    inputPath: AbsolutePath;
    /** Input-relative path, used for schema resolution. */
    path: string;
    sourceLanguage: string;
    targetLanguage: string;
    vars: Record<string, unknown>;
    /** Code processing mode of the run, see `--code`. Engine default when unset. */
    code?: CodeMode;
};

/**
 * Liquid conditions of a document under `vars`, its frontmatter kept as
 * written. Liquid re-serializes the frontmatter through YAML (indentation,
 * quotes, a no-break space as `\_`), and a translation is composed from this
 * text: every translated file would get a reformatted frontmatter, and the
 * escaped space breaks the extraction of a heading repeating the title. The
 * re-serialized frontmatter stays only when a condition in it changed a value.
 */
export function applyConditions(text: string, vars: Hash, path: string): string {
    const result = liquid(text, vars, path, {
        conditions: 'strict',
        substitutions: false,
        cycles: false,
    }) as string;

    try {
        const [frontmatter, , raw] = extractFrontMatter(text);
        if (!raw) {
            return result;
        }

        const [evaluated, body] = extractFrontMatter(result);

        return isEqual(evaluated, frontmatter) ? raw + body : result;
    } catch {
        // A frontmatter YAML cannot parse stays as liquid left it.
        return result;
    }
}

export type LoadedTranslationUnits = {
    content: FileLoader<string | object>;
    units: string[];
    skeleton?: string | JSONObject;
    schemas?: ExtractOptions['schemas'];
    ajvOptions?: ExtractOptions['ajvOptions'];
};

/**
 * Loads a file and extracts translation units exactly the way the AI
 * translate run does: same liquid handling, same extract options.
 *
 * Any consumer that needs cache-key parity with translation (seeding,
 * cache inspection) must go through this helper - a single divergence
 * in preprocessing changes unit texts and silently misses the cache.
 */
export async function loadTranslationUnits(
    params: LoadTranslationUnitsParams,
): Promise<LoadedTranslationUnits> {
    const {inputPath, path, sourceLanguage, targetLanguage, vars, code} = params;

    const content = new FileLoader(inputPath);
    await content.load();

    if (Object.keys(vars).length && content.isString) {
        content.set(applyConditions(content.data as string, vars, inputPath));
    }

    if (!content.data) {
        return {content, units: []};
    }

    const {schemas, ajvOptions} = await resolveSchemas({content: content.data, path});
    const {units, skeleton} = extract(content.data, {
        compact: true,
        code,
        // Unit texts are cache and seed keys: with document-wide placeholder
        // ids a unit's text depends on the markup above it, so a section
        // added at the top of a file invalidates every unit below.
        unitLocalIds: true,
        source: {language: sourceLanguage, locale: 'RU'},
        target: {language: targetLanguage, locale: 'US'},
        schemas,
        ajvOptions,
    });

    return {content, units, skeleton, schemas, ajvOptions};
}
