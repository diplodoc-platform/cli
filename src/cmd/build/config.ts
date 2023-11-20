import {bold, underline} from 'chalk';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {Command, options as globalOptions} from '../../config';
import {option, cmd} from '../../config/utils';
import {load} from 'js-yaml';
import {Stage, YFM_CONFIG_FILENAME} from '../../constants';

const output = (program: {command: Command}) =>
    option({
        flags: '-o, --output <string>',
        desc: `Configure path to ${cmd(program)} output directory.`,
        required: true,
    });

export enum OutputFormat {
    md = 'md',
    html = 'html',
}

const outputFormat = option({
    flags: '-f, --output-format <string>',
    default: 'html',
    choices: ['html', 'md'],
    desc: `
        Format of output files. (html or md)

        If ${bold('html')} is selected, then renders md to static html files.
        (See also ${underline('--static-content')} option)

        If ${bold('md')} is selected, then renders md to prepared md filed
        enriched by additional metadata.
        (Useful for complex documentation servers with runtime rendering)
    `,
});

const vars = (program: {command: Command}) =>
    option({
        flags: '-v, --vars',
        desc: `
            Pass list of variables directly to build.
            Variables should be passed in JSON format.
            Passed variables overrides the same in presets.yaml

            Example:
              ${cmd(program)} -i ./ -o ./build -v '{"name":"test"}'
        `,
        parser: JSON.parse,
    });

const varsPreset = option({
    flags: '--vars-preset <string>',
    desc: `
        Select vars preset of documentation.
        Selected preset will be merged with default section of presets.yaml
    `,
});

const allowHTML = option({
    flags: '--allowHTML',
    desc: 'Allow to use HTML in Markdown files.',
    default: true,
    deprecated: 'Use --allow-html for consistency.',
});

const allowHtml = option({
    flags: '--allow-html',
    desc: 'Allow to use HTML in Markdown files.',
    default: true,
});

// TODO: options below are not beautified.
const addMapFile = option({
    flags: '--add-map-file',
    desc: 'Should add all paths of documentation into file.json.',
});

const removeHiddenTocItems = option({
    flags: '--remove-hidden-toc-items',
    desc: 'Remove from Toc all items marked as hidden.',
});

const allowCustomResources = option({
    flags: '--allow-custom-resources',
    desc: 'Allow loading custom resources into statically generated pages.',
});

const staticContent = option({
    flags: '--static-content',
    desc: 'Allow loading custom resources into statically generated pages.',
});

const ignoreStage = option({
    flags: '--ignore-stage',
    desc: 'Ignore tocs with stage.',
});

const addSystemMeta = option({
    flags: '--add-system-meta',
    desc: 'Should add system section variables form presets into files meta data.',
});

// TODO: separate lint command, deprecate this flag
const lintDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable linting.',
});

const buildDisabled = option({
    flags: '--lint-disabled',
    desc: 'Disable building.',
});

const publish = option({
    flags: '--publish',
    desc: 'Should upload output files to S3 storage.',
    deprecated: 'Use separated publish command instead.',
});

export const options = {
    input: globalOptions.input,
    output,
    config: globalOptions.config,
    outputFormat,
    varsPreset,
    vars,
    allowHTML,
    allowHtml,
    addMapFile,
    removeHiddenTocItems,
    allowCustomResources,
    staticContent,
    ignoreStage,
    addSystemMeta,
    lintDisabled,
    buildDisabled,
    publish,
};

export async function resolveConfig(configPath: string) {
    const defaults = {
        outputFormat: OutputFormat.html,
        varsPreset: 'default',
        vars: {},
        allowHtml: true,
        addMapFile: false,
        removeHiddenTocItems: false,
        allowCustomResources: false,
        staticContent: false,
        ignoreStage: Stage.SKIP,
        addSystemMeta: false,
        lintDisabled: false,
        buildDisabled: false,
        publish: false,
    };

    try {
        const content = await readFile(resolve(configPath), 'utf8');
        const data = load(content) as Record<string, any>;

        return Object.assign(defaults, data.build || data);
    } catch (error: any) {
        if (error.name === 'YAMLException') {
            throw `Failed to parse ${configPath}: ${error.message}`;
        } else if (error.name === 'ENOENT' && configPath === YFM_CONFIG_FILENAME) {
            return defaults;
        } else {
            throw error;
        }
    }
}
