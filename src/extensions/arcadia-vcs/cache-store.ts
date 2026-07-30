import type {ArcadiaVcsCache, ArcadiaVcsCacheConfig} from './types';

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';

export class ArcadiaVcsCacheStore {
    private config: ArcadiaVcsCacheConfig;

    private root: string;

    private output: string;

    private warn: (message: string) => void;

    constructor(
        config: ArcadiaVcsCacheConfig,
        root: string,
        output: string,
        warn: (message: string) => void = () => undefined,
    ) {
        this.config = config;
        this.root = root;
        this.output = output;
        this.warn = warn;
    }

    async load(): Promise<ArcadiaVcsCache | undefined> {
        if (this.config.source) {
            try {
                const token = this.config.authEnv && process.env[this.config.authEnv];
                const response = await fetch(this.config.source, {
                    headers: token ? {Authorization: `OAuth ${token}`} : undefined,
                    signal: AbortSignal.timeout(10_000),
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status} ${response.statusText}`);
                }
                return parseCache(await response.text());
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.warn(`Cannot load the published Arcadia VCS cache: ${message}. Using seed.`);
            }
        }

        if (!this.config.seed) {
            return undefined;
        }

        try {
            const content = await readFile(resolve(this.root, this.config.seed), 'utf8');
            return parseCache(content);
        } catch (error) {
            if (isErrorWithCode(error, 'ENOENT')) {
                this.warn(`Cannot load Arcadia VCS seed: ${error.message}. Building full cache.`);
                return undefined;
            }
            throw error;
        }
    }

    async save(cache: ArcadiaVcsCache): Promise<void> {
        const target = resolve(this.output, this.config.output || 'vcs-cache.json');
        await mkdir(dirname(target), {recursive: true});
        await writeFile(target, `${JSON.stringify(cache, null, 2)}\n`);
    }
}

function isErrorWithCode(error: unknown, code: string): error is Error & {code: string} {
    return error instanceof Error && 'code' in error && error.code === code;
}

function parseCache(content: string): ArcadiaVcsCache {
    const cache: unknown = JSON.parse(content);
    if (!isCache(cache)) {
        throw new Error('Invalid Arcadia VCS cache format.');
    }

    return cache;
}

function isCache(cache: unknown): cache is ArcadiaVcsCache {
    if (!cache || typeof cache !== 'object') {
        return false;
    }

    const value = cache as Partial<ArcadiaVcsCache>;
    return (
        value.version === 1 &&
        typeof value.revision === 'string' &&
        value.revision.length > 0 &&
        isStringArray(value.scopes) &&
        isNumberRecord(value.mtimes) &&
        isAuthorRecord(value.authors) &&
        isContributorsRecord(value.contributors)
    );
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumberRecord(value: unknown): value is Record<string, number> {
    return isRecord(value) && Object.values(value).every((item) => Number.isFinite(item));
}

function isAuthorRecord(value: unknown): value is Record<string, {login: string; commit: string}> {
    return isRecord(value) && Object.values(value).every(isAuthorInfo);
}

function isContributorsRecord(
    value: unknown,
): value is Record<string, Array<{login: string; commit: string}>> {
    return (
        isRecord(value) &&
        Object.values(value).every(
            (contributors) => Array.isArray(contributors) && contributors.every(isAuthorInfo),
        )
    );
}

function isAuthorInfo(value: unknown): value is {login: string; commit: string} {
    return isRecord(value) && typeof value.login === 'string' && typeof value.commit === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
