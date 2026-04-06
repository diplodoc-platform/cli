import type {InitArgs, InitConfig, TemplateType} from './types';

import {basename, dirname, join} from 'node:path';
import {mkdir, readdir, rm, writeFile} from 'node:fs/promises';
import {bold, cyan, gray, green} from 'chalk';

import {console} from '~/core/utils';
import {BaseProgram, withConfigDefaults} from '~/core/program';
import {Command} from '~/core/config';

import {options} from './config';
import {runWizard} from './wizard';
import {indexMd, pcYaml, presetsYaml, tocYaml, yfmConfig} from './templates';

@withConfigDefaults(() => ({
    langs: ['en'],
    output: process.cwd(),
    template: 'minimal',
    force: false,
    dryRun: false,
    header: true,
}))
export class Init extends BaseProgram<InitConfig, InitArgs> {
    readonly name = 'Init';

    readonly command = new Command('init').description('Initialize a new documentation project');

    readonly options = [
        options.output('.'),
        options.langs,
        options.defaultLang,
        options.name,
        options.header,
        options.force,
        options.dryRun,
        options.template,
        options.skipInteractive,
    ];

    protected readonly modules = [];

    async action() {
        const cfg = this.config;

        const isInteractive = process.stdin.isTTY && !cfg.skipInteractive;

        let output: string;
        let langs: string[];
        let defaultLang: string;
        let name: string;
        let header: boolean;
        let template: TemplateType;

        if (isInteractive) {
            const result = await runWizard({
                output: cfg.output,
                template: cfg.template,
                header: cfg.header,
            });

            ({output, langs, defaultLang, name, header, template} = result);
        } else {
            output = cfg.output;
            langs = cfg.langs;
            defaultLang =
                cfg.defaultLang && cfg.langs.includes(cfg.defaultLang)
                    ? cfg.defaultLang
                    : cfg.langs[0];
            name = cfg.name || basename(cfg.output);
            header = cfg.header;
            template = cfg.template;
        }

        const {force, dryRun} = cfg;
        const isMultilang = langs.length > 1;

        if (!dryRun && !force) {
            await ensureEmpty(output);
        }

        const files = isMultilang
            ? buildMultilangFiles(output, name, langs, defaultLang, header, template)
            : buildSingleLangFiles(output, name, langs[0], header, template);

        if (dryRun) {
            printDryRun(files);
            return;
        }

        await writeAll(files, output, force);

        console.log(green(`\nProject initialized at ${bold(output)}`));
    }
}

function buildSingleLangFiles(
    output: string,
    projectName: string,
    lang: string,
    header: boolean,
    template: TemplateType,
): Record<string, string> {
    const minimalFiles = {
        [join(output, '.yfm')]: yfmConfig([lang], lang, template),
        [join(output, 'toc.yaml')]: tocYaml(projectName, header),
        [join(output, 'index.md')]: indexMd(),
    };

    if (template === 'minimal') {
        return minimalFiles;
    }

    return {
        ...minimalFiles,
        [join(output, 'presets.yaml')]: presetsYaml(projectName),
        [join(output, 'pc.yaml')]: pcYaml(),
    };
}

function buildMultilangFiles(
    output: string,
    projectName: string,
    langs: string[],
    defaultLang: string,
    header: boolean,
    template: TemplateType,
): Record<string, string> {
    const files: Record<string, string> = {
        [join(output, '.yfm')]: yfmConfig(langs, defaultLang, template),
    };

    if (template === 'full') {
        files[join(output, 'presets.yaml')] = presetsYaml(projectName);
    }

    for (const lang of langs) {
        files[join(output, lang, 'toc.yaml')] = tocYaml(projectName, header);
        files[join(output, lang, 'index.md')] = indexMd();

        if (template === 'full') {
            files[join(output, lang, 'pc.yaml')] = pcYaml();
        }
    }

    return files;
}

async function ensureEmpty(dir: string) {
    try {
        const entries = await readdir(dir);

        if (entries.length > 0) {
            throw new Error(
                `Output directory "${dir}" is not empty. Use ${bold('--force')} to overwrite.`,
            );
        }
    } catch (err: unknown) {
        if (isEnoent(err)) {
            return;
        }

        throw err;
    }
}

async function writeAll(files: Record<string, string>, output: string, force: boolean) {
    if (force) {
        await rm(output, {recursive: true, force: true});
    }

    await Promise.all(
        Object.entries(files).map(async ([filePath, content]) => {
            await mkdir(dirname(filePath), {recursive: true});
            await writeFile(filePath, content, 'utf8');
        }),
    );
}

function printDryRun(files: Record<string, string>) {
    console.log(bold('\nDry run — no files will be written.\n'));

    for (const [filePath, content] of Object.entries(files)) {
        console.log(cyan(`  ${filePath}`));
        const indented = content
            .split('\n')
            .map((line) => gray(`    ${line}`))
            .join('\n');
        console.log(indented);
    }
}

function isEnoent(err: unknown): boolean {
    return (
        err !== null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
    );
}
