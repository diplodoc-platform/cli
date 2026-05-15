import {resolve} from 'node:path';

import {option} from '~/core/config';

const absolute = (path: string) => resolve(process.cwd(), path);

const output = (defaultPath = '.') =>
    option({
        flags: '-o, --output <string>',
        desc: 'Path to create the project in.',
        default: absolute(defaultPath),
        parser: absolute,
    });

const langs = option({
    flags: '--langs <string>',
    desc: 'Comma-separated list of project languages.',
    default: ['en'],
    parser: (v: string) => v.split(',').map((l) => l.trim()),
});

const defaultLang = option({
    flags: '--default-lang <string>',
    desc: 'Default language (defaults to first value of --langs).',
});

const name = option({
    flags: '--name <string>',
    desc: 'Project name (defaults to output directory basename).',
});

const header = option({
    flags: '--header',
    desc: 'Add navigation header with controls to toc.yaml.',
    default: true,
});

const force = option({
    flags: '--force',
    desc: 'Forces overwriting of the project.',
    default: false,
});

const dryRun = option({
    flags: '--dry-run',
    desc: 'Show what will be created without actually creating the files.',
    default: false,
});

const template = option({
    flags: '--template <string>',
    desc: 'Project template: minimal or full.',
    default: 'minimal',
});

const skipInteractive = option({
    flags: '--skip-interactive',
    desc: 'Skip interactive wizard and use defaults.',
    default: false,
});

export const options = {
    output,
    langs,
    defaultLang,
    name,
    header,
    force,
    dryRun,
    template,
    skipInteractive,
};
