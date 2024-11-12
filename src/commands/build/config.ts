import {bold, underline} from 'chalk';
import {options as globalOptions} from '~/program/config';
import {option} from '~/config';
import {Stage} from '~/constants';

export enum OutputFormat {
    md = 'md',
    html = 'html',
}

const outputFormat = option({
    flags: '-f, --output-format <value>',
    defaultInfo: 'html',
    choices: ['html', 'md'],
    desc: `
        Format of output files. (html or md)

        If ${bold('html')} is selected, then renders md to static html files.
        (See also ${underline('--static-content')} option)

        If ${bold('md')} is selected, then renders md to prepared md files
        enriched by additional metadata.
        (Useful for complex documentation servers with runtime rendering)
    `,
});

const langs = option({
    flags: '--lang, --langs <value...>',
    desc: 'Allow loading custom resources into statically generated pages.',
    // parser: toArray,
});

const vars = option({
    flags: '-v, --vars <json>',
    desc: `
        Pass list of variables directly to build.
        Variables should be passed in JSON format.
        Passed variables overrides the same in presets.yaml

        Example:
          {{PROGRAM}} -i ./ -o ./build -v '{"name":"test"}'
    `,
    parser: (value) => JSON.parse(value),
});

const varsPreset = option({
    flags: '--vars-preset <value>',
    desc: `
        Select vars preset of documentation.
        Selected preset will be merged with default section of presets.yaml
    `,
});

const allowHtml = option({
    flags: '--allow-html',
    desc: 'Allow to use HTML in Markdown files.',
    defaultInfo: true,
});

const sanitizeHtml = option({
    flags: '--sanitize-html',
    desc: 'Toggle transformed HTML sanitizing. (Slow but secure feature)',
    defaultInfo: true,
});

const ignore = option({
    flags: '--ignore <glob...>',
    desc: `
        Do not process paths matched by glob.

        Example:
            {{PROGRAM}} -i ./input -o ./output --ignore *.bad.md

            or

            {{PROGRAM}} -i ./ -o ./build --ignore ./build
    `,
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

const mergeIncludes = option({
    flags: '--merge-includes',
    desc: 'Merge includes syntax during md to md processing.',
});

const resources = option({
    flags: '--resource, --resources <value...>',
    desc: 'Allow loading custom resources into statically generated pages.',
    // parser: toArray,
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
    flags: '--ignore-stage <value>',
    defaultInfo: Stage.SKIP,
    desc: 'Ignore tocs with stage.',
});

const addSystemMeta = option({
    flags: '--add-system-meta',
    desc: 'Should add system section variables form presets into files meta data.',
});

const buildDisabled = option({
    flags: '--build-disabled',
    desc: 'Disable building.',
});

export const options = {
    input: globalOptions.input,
    output: globalOptions.output,
    config: globalOptions.config,
    langs,
    outputFormat,
    varsPreset,
    vars,
    allowHtml,
    sanitizeHtml,
    addMapFile,
    removeHiddenTocItems,
    mergeIncludes,
    resources,
    allowCustomResources,
    staticContent,
    ignore,
    ignoreStage,
    addSystemMeta,
    buildDisabled,
};
