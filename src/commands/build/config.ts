import {bold, underline} from 'chalk';
import {options as globalOptions} from '~/program/config';
import {option} from '~/config';
import {Stage} from '~/constants';

// need-to-sanitize-html

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

        If ${bold('md')} is selected, then renders md to prepared md filed
        enriched by additional metadata.
        (Useful for complex documentation servers with runtime rendering)
    `,
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

const allowHTML = option({
    flags: '--allowHTML',
    desc: 'Allow to use HTML in Markdown files.',
    defaultInfo: true,
    deprecated: 'Use --allow-html for consistency.',
});

const allowHtml = option({
    flags: '--allow-html',
    desc: 'Allow to use HTML in Markdown files.',
    defaultInfo: true,
});

const hidden = option({
    flags: '--hidden <glob...>',
    desc: `
        Do not process paths matched by glob.

        Example:
            {{PROGRAM}} -i ./input -o ./output --hidden *.bad.md
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
    outputFormat,
    varsPreset,
    vars,
    allowHTML,
    allowHtml,
    addMapFile,
    removeHiddenTocItems,
    resources,
    allowCustomResources,
    staticContent,
    hidden,
    ignoreStage,
    addSystemMeta,
    buildDisabled,
};
