import {readFileSync, realpathSync, statSync} from 'node:fs';
import {dirname, isAbsolute, relative, resolve, sep} from 'node:path';
import {DEFAULT_SCHEMA, Type, load} from 'js-yaml';
import {isPlainObject} from 'lodash';

export function parseYfmConfig(content: string, path: string) {
    let hasIncludes = false;
    let root: string | undefined;

    function parse(source: string, file: string, parents: string[]): unknown {
        const include = new Type('!include', {
            kind: 'scalar',
            resolve: (name) => typeof name === 'string' && Boolean(name.trim()),
            construct(name: string) {
                hasIncludes = true;
                if (isAbsolute(name)) {
                    throw new Error(`Expected a relative !include path in ${file}: ${name}`);
                }

                // Resolve symlinks before checking the directory boundary and cycles.
                root ??= realpathSync(dirname(path));
                const target = realpathSync(resolve(dirname(file), name));
                const subpath = relative(root, target);
                if (subpath === '..' || subpath.startsWith('..' + sep) || isAbsolute(subpath)) {
                    throw new Error(`!include outside the config directory: ${target}`);
                }

                const chain = [...parents, realpathSync(file)];
                if (chain.includes(target)) {
                    throw new Error(`Circular !include: ${[...chain, target].join(' -> ')}`);
                }
                if (!statSync(target).isFile()) {
                    throw new Error(`Expected a file for !include: ${target}`);
                }

                // js-yaml constructs tags synchronously, including values used by YAML merges.
                return parse(readFileSync(target, 'utf8'), target, chain);
            },
        });

        return load(source, {filename: file, schema: DEFAULT_SCHEMA.extend([include])});
    }

    try {
        const data = parse(content, path, []);
        if (hasIncludes && !isPlainObject(data)) {
            throw new Error('The project config must be a YAML mapping');
        }

        return {data: data as Hash, hasIncludes};
    } catch (error) {
        // An absent fragment must not trigger the optional root .yfm fallback.
        throw new Error(`Failed to load ${path}: ${(error as Error).message}`);
    }
}
