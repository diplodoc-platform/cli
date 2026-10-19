import type {PrepareConfig, PrepareResult} from '../types';

import {spawn} from 'node:child_process';
import {
    access,
    chmod,
    copyFile,
    lstat,
    mkdir,
    mkdtemp,
    readFile,
    realpath,
    rm,
    stat,
    utimes,
} from 'fs/promises';
import {dirname, isAbsolute, join, relative, resolve, sep} from 'node:path';
import {tmpdir} from 'node:os';

import {createLinks, planSources} from './symlinks';

function inside(root: string, path: string) {
    const result = relative(root, path);
    return (
        result === '' || (!isAbsolute(result) && result !== '..' && !result.startsWith(`..${sep}`))
    );
}

async function preserveMetadata(source: string, target: string) {
    const info = await stat(source);
    await chmod(target, info.mode % 0o1000);
    await utimes(target, info.atime, info.mtime);
}

async function copySource(source: string, target: string) {
    await mkdir(dirname(target), {recursive: true});
    await copyFile(source, target);
    await preserveMetadata(source, target);
}

async function createDirectories(directories: string[], root: string, target: string) {
    for (const source of directories)
        await mkdir(join(target, relative(root, source)), {recursive: true});
}

async function preserveDirectories(directories: string[], root: string, target: string) {
    for (const source of [...directories].sort((left, right) => right.length - left.length))
        await preserveMetadata(source, join(target, relative(root, source)));
}

async function outputPath(path: string): Promise<string> {
    try {
        await lstat(path);
        throw new Error(`Output already exists: ${path}`);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
    const parent = dirname(path);
    try {
        const info = await lstat(parent);
        if (!info.isDirectory()) {
            throw new Error(`Output parent must be a directory: ${parent}`);
        }
        return join(await realpath(parent), relative(parent, path));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
        return join(await outputPath(parent), relative(parent, path));
    }
}

/** Collect original inputs observed during a real, isolated, one-shot build. */
export async function prepare(
    config: PrepareConfig,
    argv: string[],
    commandIndex: number,
): Promise<PrepareResult> {
    const input = await realpath(config.input);
    const output = await outputPath(resolve(config.output));
    if (inside(input, output) || inside(output, input)) {
        throw new Error('Prepare output must not overlap the input directory');
    }
    const work = await realpath(await mkdtemp(join(tmpdir(), 'yfm-prepare-')));
    try {
        const trace = join(work, 'trace.json');
        const binary = join(__dirname, 'index.js');
        const preload = join(__dirname, 'prepare-trace.js');
        await access(preload);
        const command = [...argv];
        command[commandIndex] = 'build';
        let forwarded = command
            .slice(2)
            .filter((arg) => !/^--(?:no-)?dry-?[Rr]un(?:=.*)?$/.test(arg));
        const discover = async (flags: string[], traceFile: string) => {
            const code = await new Promise<number | null>((resolveCode, reject) => {
                const child = spawn(
                    process.execPath,
                    ['--require', preload, binary, ...forwarded, ...flags],
                    {
                        env: {...process.env, YFM_PREPARE_TRACE: traceFile, YFM_PREPARE_WORK: work},
                        stdio: 'inherit',
                    },
                );
                child.once('error', reject);
                child.once('exit', resolveCode);
            });
            if (code !== 0) {
                throw new Error(`Prepare discovery build failed (exit ${code})`);
            }
            const result = JSON.parse(await readFile(traceFile, 'utf8')) as {
                files: string[];
                external: string[];
                directories: string[];
                config?: string;
                unsupportedReads: string[];
            };
            if (result.unsupportedReads.length) {
                throw new Error(
                    `Prepare cannot reproduce selected filesystem reads:\n${result.unsupportedReads.join('\n')}`,
                );
            }
            return result;
        };
        const commonFlags = [
            '--jobs',
            '1',
            '--no-watch',
            '--no-origin-as-input',
            '--extensions',
            join(__dirname, 'prepare-driver.js'),
        ];
        const result = await discover(['--output', join(work, 'build'), ...commonFlags], trace);
        const plan = await planSources([
            ...result.files,
            ...result.external,
            ...result.directories,
        ]);
        const sources = plan.files;
        const directories = plan.directories;
        let root = input;
        for (const source of [
            ...sources,
            ...directories,
            ...plan.links.map((link) => link.source),
        ]) {
            while (!inside(root, source)) root = dirname(root);
            if (inside(output, source))
                throw new Error(`Prepare output overlaps a source dependency: ${source}`);
        }
        const candidate = join(work, 'candidate');
        await mkdir(candidate);
        await createDirectories(directories, root, candidate);
        for (const source of sources) {
            const target = join(candidate, relative(root, source));
            await copySource(source, target);
        }
        await createLinks(plan.links, root, candidate);
        await preserveDirectories(directories, root, candidate);
        const buildInput = relative(root, input) || '.';
        const buildConfig = result.config && relative(root, result.config);
        const extensions: PrepareResult['extensions'] = [];
        const remapExtension = async (value: string) => {
            const local = /^\.{1,2}\//.test(value) || isAbsolute(value);
            const name = local ? relative(root, await realpath(resolve(value))) : value;
            extensions.push({name, local});
            return local ? join(candidate, name) : name;
        };
        const relocated: string[] = [];
        for (let index = 0; index < forwarded.length; index++) {
            const token = forwarded[index];
            if (token === '-e' || token === '--extensions') {
                relocated.push(token, await remapExtension(forwarded[++index]));
            } else if (token.startsWith('--extensions=')) {
                relocated.push(
                    `--extensions=${await remapExtension(token.slice('--extensions='.length))}`,
                );
            } else if (token.startsWith('-e') && token.length > 2) {
                relocated.push('-e', await remapExtension(token.slice(2)));
            } else relocated.push(token);
        }
        forwarded = relocated;
        const validation = await discover(
            [
                '--input',
                join(candidate, buildInput),
                '--output',
                join(work, 'validation'),
                ...(buildConfig ? ['--config', join(candidate, buildConfig)] : []),
                ...commonFlags,
            ],
            join(work, 'validation-trace.json'),
        );
        const remaining = [
            ...validation.files,
            ...validation.external,
            ...validation.directories,
        ].filter((path) => !inside(candidate, path));
        if (remaining.length)
            throw new Error(
                `Build still depends on original paths after relocation; use relative project paths:\n${remaining.join('\n')}`,
            );
        if (!config.dryRun) {
            await mkdir(dirname(output), {recursive: true});
            await mkdir(output);
            try {
                await createDirectories(directories, root, output);
                for (const source of sources) {
                    const target = join(output, relative(root, source));
                    await copySource(source, target);
                }
                await createLinks(plan.links, root, output);
                await preserveDirectories(directories, root, output);
            } catch (error) {
                await rm(output, {recursive: true, force: true});
                throw error;
            }
        }
        return {files: sources.length, output, input: buildInput, config: buildConfig, extensions};
    } finally {
        await rm(work, {recursive: true, force: true});
    }
}
