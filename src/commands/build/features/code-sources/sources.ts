import type {Run} from '~/commands/build';
import type {Forge} from './forge';
import type {ResolvedSource, SourceConfig, SourceType} from './types';

import {createHash} from 'node:crypto';
import {isAbsolute, join, resolve} from 'node:path';
import {bold} from 'chalk';

import {SourceError} from './types';
import {DEFAULT_HOST, forgeOf, refsUrl} from './forge';
import {resolveRef} from './refs';
import {download} from './http';
import {readState, writeState} from './state';

export type {ResolvedSource, SourceConfig, SourceType};
export {SourceError};

const DEFAULT_REF = 'main';

const VAR_REGEX = /{{\s*([\w.-]+)\s*}}/g;

const NAME_REGEX = /^[\w-]+$/;

const REPO_REGEX = /^[\w.-]+\/[\w.-]+$/;

const TYPES: SourceType[] = ['git', 'http', 'local'];

/**
 * Fields each source type accepts, `type` aside.
 *
 * `local` deliberately has no `repo`/`ref`: they would be a hand-maintained copy
 * of what the checkout already knows, and nothing would keep the two in step —
 * exactly the drift this feature exists to remove. A `link` template covers the
 * case where a local source still wants a "view source" url.
 */
const FIELDS: Record<SourceType, {required: string[]; optional: string[]}> = {
    git: {required: ['repo'], optional: ['host', 'ref', 'path', 'raw', 'link']},
    http: {required: ['url'], optional: ['path', 'link']},
    local: {required: ['dir'], optional: ['path', 'link']},
};

/**
 * Substitutes `{{ var }}` in source fields.
 *
 * The config file is not processed by the template engine, so this is done
 * explicitly — without it a versioned doc set cannot drive `ref` from the build
 * that produces it.
 *
 * Only global vars are visible (config `vars` and `--vars`): sources are resolved
 * once per build, before any file is processed, so per-directory presets do not
 * exist yet and would silently resolve to nothing.
 */
function interpolate(value: string, vars: Hash, source: string, field: string) {
    return value.replace(VAR_REGEX, (_match, key) => {
        const resolved = vars?.[key];

        if (resolved === undefined || resolved === null) {
            throw new SourceError(
                `Source '${source}' references undefined var '${key}' in '${field}'. ` +
                    `Only global vars are available here — set it in the config 'vars' section or pass --vars.`,
            );
        }

        return String(resolved);
    });
}

/**
 * `type` is required rather than inferred.
 *
 * Guessing it from the field shape ("has a `dir`, so it must be local") reads the
 * author's intent out of an incidental detail, and every new type makes the guess
 * more fragile. One explicit word costs a line and removes the question.
 */
function typeOf(name: string, config: SourceConfig): SourceType {
    if (!config.type) {
        throw new SourceError(`Source '${name}' needs a 'type'. Supported: ${TYPES.join(', ')}.`);
    }

    if (!TYPES.includes(config.type)) {
        throw new SourceError(
            `Unknown type '${config.type}' in source '${name}'. Supported: ${TYPES.join(', ')}.`,
        );
    }

    return config.type;
}

/**
 * Validates the `code-sources` config section.
 *
 * Config files are not schema-checked, so a typo would otherwise surface much
 * later and far from its cause — a misspelled field as a missing file, a
 * misspelled source name as "unknown code source" on every page. Fields are
 * checked against the source type, so `url` on a `git` source is rejected here
 * rather than silently ignored.
 */
export function validateSources(declared: unknown): asserts declared is Hash<SourceConfig> {
    if (typeof declared !== 'object' || declared === null || Array.isArray(declared)) {
        throw new SourceError(`Config 'code-sources' must be a map of name to source settings.`);
    }

    for (const [name, config] of Object.entries(declared)) {
        if (!NAME_REGEX.test(name)) {
            throw new SourceError(
                `Invalid source name '${name}': only letters, digits, '_' and '-' are allowed, ` +
                    `because the name is used before ':' in the directive target.`,
            );
        }

        if (typeof config !== 'object' || config === null || Array.isArray(config)) {
            throw new SourceError(`Source '${name}' must be a map of settings.`);
        }

        const type = typeOf(name, config);
        const {required, optional} = FIELDS[type];
        const known = ['type', ...required, ...optional];

        for (const [field, value] of Object.entries(config)) {
            if (!known.includes(field)) {
                throw new SourceError(
                    `Field '${field}' is not supported by '${type}' source '${name}'. ` +
                        `Supported: ${known.join(', ')}.`,
                );
            }

            if (typeof value !== 'string') {
                throw new SourceError(`Field '${field}' of source '${name}' must be a string.`);
            }
        }

        for (const field of required) {
            if (!config[field as keyof SourceConfig]) {
                throw new SourceError(`Source '${name}' of type '${type}' needs a '${field}'.`);
            }
        }
    }
}

/**
 * Download directory of a source.
 *
 * Keyed by everything that changes the content, so two refs of one source do not
 * collide. Computed without any I/O, so a worker derives the same path as the
 * main thread that resolved the ref.
 */
export function downloadPath(
    root: AbsolutePath,
    source: Pick<ResolvedSource, 'name' | 'url' | 'ref' | 'prefix'>,
) {
    const key = createHash('sha256')
        .update([source.url, source.ref, source.prefix].join('\n'))
        .digest('hex')
        .slice(0, 12);

    return join(root, `${source.name}-${key}`) as AbsolutePath;
}

/**
 * Turns the config into resolved sources.
 *
 * Deliberately free of I/O: it runs on every thread, and the paths it produces
 * must agree with the ones the resolving thread produced.
 */
export function resolveSources(run: Run): Hash<ResolvedSource> {
    const declared = run.config.codeSources || {};
    const vars = run.config.vars || {};
    const resolved: Hash<ResolvedSource> = {};

    validateSources(declared);

    for (const [name, config] of Object.entries(declared)) {
        const type = typeOf(name, config);
        const field = (value: string, key: string) => interpolate(value, vars, name, key);

        // Slashes trimmed before use: a leading one would make `path` absolute and
        // resolve the source root outside its base entirely.
        const path = (config.path ? field(config.path, 'path') : '').replace(/^\/+|\/+$/g, '');
        const repo = config.repo ? field(config.repo, 'repo') : null;

        // Checked here rather than in validation: `repo` may be templated, and
        // `org/{{ version }}` only takes its final shape after substitution.
        if (repo && !REPO_REGEX.test(repo)) {
            throw new SourceError(
                `Invalid repo '${repo}' in source '${name}': expected 'owner/name'. ` +
                    `Use 'host' for anything but ${DEFAULT_HOST}.`,
            );
        }
        const host = repo
            ? (config.host ? field(config.host, 'host') : DEFAULT_HOST).replace(/\/+$/, '')
            : null;
        // Trailing slashes first: otherwise a trailing `/` doubles up in urls.
        const url = config.url
            ? field(config.url, 'url').replace(/\/+$/, '')
            : host
              ? `${host}/${repo}`
              : null;
        // Only a forge has a ref to pin: `http` serves plain files, and `local`
        // is whatever the checkout holds.
        const ref = type === 'git' ? field(config.ref || DEFAULT_REF, 'ref') : null;

        const forge: Forge | null = host ? forgeOf(host) : null;
        const vendored = type === 'local';

        let base: AbsolutePath;
        if (config.dir) {
            const dir = field(config.dir, 'dir');
            base = (isAbsolute(dir) ? dir : resolve(run.originalInput, dir)) as AbsolutePath;
        } else {
            base = downloadPath(run.config.sourcesDownloadDir, {name, url, ref, prefix: path});
        }

        resolved[name] = {
            name,
            type,
            // Downloaded files are addressed by url, not by repository layout, so
            // they live directly under the cache. A vendored tree keeps its real
            // shape and the prefix is part of the path.
            root: (vendored ? resolve(base, path || '.') : base) as AbsolutePath,
            base,
            prefix: path,
            host,
            repo,
            url,
            ref,
            commit: null,
            raw:
                type === 'git'
                    ? config.raw
                        ? field(config.raw, 'raw')
                        : (forge as Forge).raw
                    : null,
            link: config.link ? field(config.link, 'link') : forge ? forge.link : null,
            vendored,
        };
    }

    return resolved;
}

const SHA_REGEX = /^[0-9a-f]{40}$/i;

/**
 * Resolves every ref to a commit.
 *
 * Done on every build rather than remembered between them: the ref advertisement
 * is a few kilobytes, and resolving it fresh is what makes a stale download
 * directory impossible — files live under the commit they came from, so a moved
 * branch simply lands in a different one. A `ref` that is already a commit needs
 * no request at all.
 *
 * Must only run on the main thread: `BeforeAnyRun` fires in workers too, and
 * every worker would otherwise repeat the request. Files themselves are not
 * downloaded here — which of them are needed is only known once documents are
 * parsed.
 */
export async function fetchSources(run: Run, sources: Hash<ResolvedSource>) {
    for (const source of Object.values(sources)) {
        if (source.type !== 'git') {
            continue;
        }

        const ref = source.ref as string;

        if (SHA_REGEX.test(ref)) {
            source.commit = ref;
        } else {
            run.logger.info(`Resolving ${bold(source.name)} at ${source.url}@${ref}`);

            source.commit = await resolveRef(
                refsUrl(source.host as string, source.repo as string),
                ref,
            );
        }

        await writeState(run, source, source.commit);
    }
}

/**
 * Fills in resolved commits from the download directory, without touching the
 * network.
 *
 * Used by worker threads, which must not resolve refs but still need the commit
 * to address files and build links.
 */
export async function hydrateSources(run: Run, sources: Hash<ResolvedSource>) {
    for (const source of Object.values(sources)) {
        if (source.type !== 'git') {
            continue;
        }

        const state = await readState(run, source);

        if (state) {
            source.commit = state.commit;
        }
    }
}

/**
 * Reads a file from a source, downloading it first unless it is local.
 *
 * Always ends in `run.read`, so the sandbox check applies to every source type.
 */
export async function readSourceFile(run: Run, source: ResolvedSource, path: string) {
    if (source.vendored) {
        return run.read(join(source.root, path) as AbsolutePath);
    }

    if (source.type === 'git' && !source.commit) {
        throw new SourceError(
            `Source '${source.name}' has no resolved commit; ref resolution did not run.`,
        );
    }

    // Scoped by commit so that advancing a ref cannot serve a stale file, and so
    // that two refs of one source can coexist.
    const target = join(source.root, source.commit || '', path) as AbsolutePath;
    const url = source.raw
        ? expand(source.raw, source, path, 0, 0)
        : `${source.url}/${source.prefix ? `${source.prefix}/` : ''}${path}`;

    await download(run, url, target);

    return run.read(target);
}

/** Substitutes `{placeholder}` values shared by link and download templates. */
function expand(
    template: string,
    source: ResolvedSource,
    path: string,
    start: number,
    end: number,
) {
    const values: Hash<string> = {
        host: source.host || '',
        repo: source.repo || '',
        url: source.url || '',
        ref: source.ref || '',
        commit: source.commit || source.ref || '',
        path: source.prefix ? `${source.prefix}/${path}` : path,
        start: String(start),
        end: String(end),
        // Ready-made anchor body, so the common case does not have to spell out
        // the single-line collapse in every template.
        lines: start === end ? `L${start}` : `L${start}-L${end}`,
    };

    return template.replace(/{(\w+)}/g, (match, key) =>
        values[key] === undefined ? match : values[key],
    );
}

/**
 * Builds the "view source" link.
 *
 * The rule differs per host and per type: a forge needs a commit and a line
 * anchor, a bucket is just the object url. A `link` template overrides both.
 */
export function permalink(source: ResolvedSource, path: string, start: number, end: number) {
    // A `local` source has no url of its own, so it links only when the config
    // spells out a template.
    const template = source.link || (source.url ? '{url}/{path}' : null);

    if (!template) {
        return null;
    }

    return expand(template, source, path, start, end);
}
