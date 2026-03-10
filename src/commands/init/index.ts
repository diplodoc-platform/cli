import type {BaseArgs, BaseConfig} from '~/core/program';

import {basename, join} from 'node:path';
import {mkdir, readdir, writeFile} from 'node:fs/promises';
import {bold, green} from 'chalk';

import {console} from '~/core/utils';
import {BaseProgram, withConfigDefaults} from '~/core/program';
import {Command} from '~/core/config';

import {options} from './config';
import {indexMd, presetsYaml, tocYaml, yfmConfig} from './templates';

export type InitArgs = BaseArgs & {
    output: string;
    langs: string[];
    defaultLang?: string;
    name?: string;
    header: boolean;
};

export type InitConfig = BaseConfig & {
    output: string;
    langs: string[];
    defaultLang?: string;
    name?: string;
    header: boolean;
};

@withConfigDefaults(() => ({
    langs: ['ru'],
    output: process.cwd(),
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
    ];

    protected readonly modules = [];

    async action() {
        const {output, langs, defaultLang, name, header} = this.config;
        const lang = defaultLang || langs[0];
        const projectName = name || basename(output);
        const isMultilang = langs.length > 1;

        await ensureEmpty(output);

        if (isMultilang) {
            await createMultilangProject(output, projectName, langs, lang, header);
        } else {
            await createSingleLangProject(output, projectName, lang, header);
        }

        console.log(green(`\nProject initialized at ${bold(output)}`));
        console.log(`\nRun: ${bold(`yfm build -i ${output} -o ${join(output, 'build')}`)}`);
    }
}

async function ensureEmpty(dir: string) {
    try {
        const entries = await readdir(dir);
        if (entries.length > 0) {
            throw new Error(`Output directory "${dir}" is not empty`);
        }
    } catch (err: unknown) {
        if (
            err &&
            typeof err === 'object' &&
            'code' in err &&
            (err as NodeJS.ErrnoException).code === 'ENOENT'
        ) {
            return;
        }

        throw err;
    }
}

async function writeAll(files: Record<string, string>) {
    await Promise.all(
        Object.entries(files).map(async ([filePath, content]) => {
            await mkdir(dirname(filePath), {recursive: true});
            await writeFile(filePath, content, 'utf8');
        }),
    );
}

function dirname(filePath: string): string {
    return join(filePath, '..');
}

async function createSingleLangProject(
    output: string,
    projectName: string,
    lang: string,
    header: boolean,
) {
    await writeAll({
        [join(output, '.yfm')]: yfmConfig([lang], lang),
        [join(output, 'toc.yaml')]: tocYaml(projectName, header),
        [join(output, 'index.md')]: indexMd(),
    });
}

async function createMultilangProject(
    output: string,
    projectName: string,
    langs: string[],
    defaultLang: string,
    header: boolean,
) {
    const files: Record<string, string> = {
        [join(output, '.yfm')]: yfmConfig(langs, defaultLang),
        [join(output, 'presets.yaml')]: presetsYaml(projectName),
    };

    for (const lang of langs) {
        files[join(output, lang, 'toc.yaml')] = tocYaml(projectName, header);
        files[join(output, lang, 'index.md')] = indexMd();
    }

    await writeAll(files);
}
