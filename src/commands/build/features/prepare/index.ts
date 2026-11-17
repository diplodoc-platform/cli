import type {Run} from '~/commands/build';

import {ok} from 'node:assert';
import {copyFile, readFile, writeFile} from 'node:fs/promises';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {dump, load} from 'js-yaml';

export async function prepareInput(run: Run) {
    const {prepare} = run.config;
    if (!prepare) {
        return;
    }

    ok(!run.config.originAsInput, 'prepare cannot be used with originAsInput');

    const resolveInputPath = (file: string) => {
        const absolutePath = resolve(run.input, file);
        const relativePath = relative(run.input, absolutePath);
        ok(
            file &&
                !isAbsolute(file) &&
                relativePath &&
                relativePath !== '..' &&
                !relativePath.startsWith(`..${sep}`) &&
                !isAbsolute(relativePath),
            `prepare: path must stay inside the input: ${file}`,
        );
        return absolutePath;
    };

    for (const {from, to} of prepare.moveFiles || []) {
        await copyFile(resolveInputPath(from), resolveInputPath(to));
    }

    for (const {to, sources} of prepare.presets || []) {
        const presets = await readYamlObject(resolveInputPath(to));

        for (const {from, select = [], into} of sources) {
            let incomingData = await readYamlObject(resolveInputPath(from));

            for (const key of select) {
                incomingData = validateObject(incomingData[key], `${from}:${key}`);
            }

            const newPresets = into ? {[into]: incomingData} : incomingData;

            for (const [name, values] of Object.entries(newPresets)) {
                presets[name] = {
                    ...validateObject(presets[name] ?? {}, `${to}:${name}`),
                    ...validateObject(values, `${from}:${name}`),
                };
            }
        }

        await writeFile(resolveInputPath(to), dump(presets));
    }
}

function validateObject(value: unknown, source: string): Record<string, unknown> {
    ok(
        value && typeof value === 'object' && !Array.isArray(value),
        `prepare: expected a YAML mapping in ${source}`,
    );
    return value as Record<string, unknown>;
}

async function readYamlObject(file: AbsolutePath) {
    return validateObject(load(await readFile(file, 'utf8')), file);
}
