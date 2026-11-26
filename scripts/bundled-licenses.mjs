import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

/**
 * Write notices for the exact third-party inputs included by esbuild.
 * @param {object} metafile - The completed esbuild input inventory.
 * @param {string} projectRoot - Root used to resolve input paths.
 * @param {string} output - Destination notice file.
 * @returns {void} Writes the complete notices to output.
 */
export function writeBundledLicenses(metafile, projectRoot, output) {
    const dependencyOf = (input) => {
        let directory = dirname(resolve(projectRoot, input));
        while (directory !== dirname(directory)) {
            const manifest = join(directory, 'package.json');
            if (existsSync(manifest)) {
                const {name, version} = JSON.parse(readFileSync(manifest, 'utf8'));
                if (name) return {directory, key: `${name}@${version}`};
            }
            directory = dirname(directory);
        }
        throw new Error(`Cannot identify bundled dependency for ${input}`);
    };

    const notices = new Map();
    for (const input of Object.keys(metafile.inputs)) {
        if (!input.includes('node_modules/')) continue;

        const {directory, key} = dependencyOf(input);
        if (notices.has(key)) continue;

        const licenses = readdirSync(directory)
            .filter((file) => /^(?:licen[sc]e|copying|notice)(?:[._-].*)?$/i.test(file))
            .sort();
        if (licenses.length > 0) {
            notices.set(
                key,
                licenses.map((file) => readFileSync(join(directory, file), 'utf8')).join('\n'),
            );
            continue;
        }

        const {license, author, contributors, repository} = JSON.parse(
            readFileSync(join(directory, 'package.json'), 'utf8'),
        );
        if (!license) throw new Error(`Missing license information for bundled dependency ${key}`);
        notices.set(key, JSON.stringify({license, author, contributors, repository}, null, 2));
    }

    const text = [...notices.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, notice]) => `${name}\n${notice.trim()}\n`)
        .join('\n');
    writeFileSync(output, text);
}
