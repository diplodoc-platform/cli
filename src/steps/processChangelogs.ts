import {glob} from '../utils/glob';
import {join} from 'node:path';
import {ArgvService, TocService} from '../services';
import {readFile, unlink, writeFile} from 'node:fs/promises';
import {Lang} from '../constants';

type MergedChangelogs = {
    [pathToProjectToc: string]: {
        [language: string]: {
            [pathToFile: string]: unknown;
        };
    };
};

type ParsedPath = {
    language: string;
    path: string;
    level: number;
};

const hasSingleLanguage = () => {
    const {langs} = ArgvService.getConfig();
    return typeof langs === 'undefined' || langs.length === 1;
};

const project = (path: string): ParsedPath => {
    const parts = path.split('/').slice(0, -1);
    const language = hasSingleLanguage() ? Lang.EN : parts.shift()!;
    const level = parts.length;

    return {
        path: '/' + parts.join('/'),
        language,
        level,
    };
};

const file = (path: string): ParsedPath => {
    const parts = path.split('/');
    const language = hasSingleLanguage() ? Lang.EN : parts.shift()!;

    return {
        path: '/' + parts.join('/'),
        language,
        level: -1,
    };
};

type Project = {
    path: string;
    languages: string[];
    level: number;
};

/*
    This function collects all the project's subprojects and sorts them by depth level. 
    This is done to make it easier to find which toc.yaml file is responsible 
    for the necessary changes file: the earlier the project is in the list, the deeper it is. 
    The first project whose path to toc.yaml shares a common prefix with the path to changes 
    will be considered responsible for it.

*/
const uniqueProjects = (tocs: string[]): [string, Project][] => {
    const projects = tocs.map(project);
    const composed = projects.reduce(
        (acc, curr) => {
            if (acc[curr.path]) {
                acc[curr.path].languages.push(curr.language);

                return acc;
            }

            acc[curr.path] = {
                languages: [curr.language],
                path: curr.path,
                level: curr.level,
            };

            return acc;
        },
        {} as Record<string, Project>,
    );

    const entries = Object.entries(composed).sort((a, b) => {
        return b[1].level - a[1].level;
    });

    return entries;
};

export async function processChangelogs() {
    const {output: outputFolderPath} = ArgvService.getConfig();
    const tocs = TocService.getAllTocs();
    const projects = uniqueProjects(tocs);

    const result = await glob('**/**/__changes-*.json', {
        cwd: outputFolderPath,
    });

    const files = result.state.found;

    if (!files.length) {
        return;
    }

    const merged: MergedChangelogs = {};

    const changes = await Promise.all(
        files.map((path) => {
            const filePath = join(outputFolderPath, path);

            return readFile(filePath).then(
                (buffer) => [path, JSON.parse(buffer.toString())] as [string, unknown],
            );
        }),
    );

    changes.forEach(([path, value]) => {
        const {language, path: pathToFile} = file(path);

        const project = projects.find(([pathToProject, project]) => {
            return pathToFile.startsWith(pathToProject) && project.languages.includes(language);
        });

        if (!project) {
            return;
        }

        const [projectPath] = project;

        merged[projectPath] ??= {};
        merged[projectPath][language] ??= {};

        Object.assign(merged[projectPath][language], {
            [path]: value,
        });
    });

    await Promise.all(
        files.map((path) => {
            const filePath = join(outputFolderPath, path);

            return unlink(filePath);
        }),
    );

    const changelogPath = join(outputFolderPath, 'changelog.json');

    await writeFile(changelogPath, JSON.stringify(merged, null, 4));
}
