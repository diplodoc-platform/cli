import type {TemplateType} from './types';

const extendedConfig = `

pdf:
  enabled: true

interface:
  toc-header: false

vcs: true
mtimes: true
authors: true

breaks: true
linkify: true

search:
  provider: local
  tolerance: 2
  confidense: phrased
`;

export function yfmConfig(langs: string[], defaultLang: string, template: TemplateType): string {
    if (langs.length > 1) {
        const langList = langs.map((l) => `'${l}'`).join(', ');
        const baseConfig = `allowHtml: true\nlang: ${defaultLang}\nlangs: [${langList}]`;

        if (template === 'minimal') {
            return baseConfig;
        }

        return baseConfig + extendedConfig;
    }

    const baseConfig = `lang: ${defaultLang}`;

    if (template === 'minimal') {
        return baseConfig;
    }

    return baseConfig + extendedConfig;
}

export function tocYaml(projectName: string, header = true): string {
    const nav = header ? `navigation:\n  header:\n    rightItems:\n      - type: controls\n` : '';
    return `title: ${projectName}
href: index.md
${nav}items:
  - name: Overview
    href: index.md
`;
}

export function indexMd(): string {
    return `# Welcome

This is your documentation project created with [Diplodoc](https://diplodoc.com).

## Getting started

Edit this file or add new pages and update \`toc.yaml\`.
`;
}

export function pcYaml(): string {
    return `blocks:
- type: basic-card
  title: Basic card
  description: Description
  text: Text
`;
}

export function presetsYaml(projectName: string): string {
    return `default:\n  project-name: ${projectName}\n`;
}
