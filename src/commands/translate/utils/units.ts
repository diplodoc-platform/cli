import type {ExtractOptions, JSONObject} from '@diplodoc/translation';
import type {CodeMode} from './config';

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
        content.set(
            liquid(content.data as string, vars, inputPath, {
                conditions: 'strict',
                substitutions: false,
                cycles: false,
            }),
        );
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
