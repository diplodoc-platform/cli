export function yfmConfig(langs: string[], defaultLang: string): string {
    if (langs.length > 1) {
        const langList = langs.map((l) => `'${l}'`).join(', ');
        return `lang: ${defaultLang}\nlangs: [${langList}]\n`;
    }

    return `# YFM project config\n# Docs: https://diplodoc.com/docs/ru/project/config\n\nlang: ${defaultLang}\n`;
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

export function presetsYaml(projectName: string): string {
    return `default:\n  project-name: ${projectName}\n`;
}
