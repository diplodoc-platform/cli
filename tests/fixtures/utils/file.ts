import {readFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {glob} from 'glob';
import {bundleless, hashless, platformless} from './test';
import {expect} from 'vitest';

const SYSTEM_DIRS = ['_bundle/', '_search/'];

export function getFileContent(filePath: string) {
    return platformless(bundleless(readFileSync(filePath, 'utf8')));
}

const uselessFile = (file: string, dirs: string[]) =>
    !dirs.some((part) => file.includes(part));

export function stripSystemLinks(content: string) {
    const dirPattern = SYSTEM_DIRS.map(d => d.replace('/', '\\/')).join('|');

    content = content.replace(
        new RegExp(`<script[^>]+src="(?:${dirPattern})[^"]*"[^>]*></script>`, 'g'),
        ''
    );

    content = content.replace(
        new RegExp(`<link[^>]+href="(?:${dirPattern})[^"]*"[^>]*\\/?>`, 'g'),
        ''
    );

    content = content.replace(/^[ \t]*\r?\n/gm, '');

    return content;
}

export async function compareDirectories(
    outputPath: string,
    ignoreFileContent = false,
    checkBundle = false,
) {
    const filesFromOutput = (
        await glob(`**/*`, {
            cwd: outputPath,
            dot: true,
            follow: true,
            nodir: true,
            posix: true,
        })
    ).map(bundleless).sort();

    let filesForSnapshot;

    if (checkBundle) {
        filesForSnapshot = filesFromOutput;
    } else {
        filesForSnapshot = filesFromOutput.filter(file => uselessFile(file, SYSTEM_DIRS));
    }

    filesForSnapshot = filesForSnapshot.map(hashless).sort(); 

    expect(JSON.stringify(filesForSnapshot, null, 2)).toMatchSnapshot('filelist');

    if (!ignoreFileContent) {
        filesFromOutput.filter(file => uselessFile(file, ['_assets/', ...SYSTEM_DIRS])).forEach((filePath) => {
            let content = getFileContent(resolve(outputPath, filePath));

            if (!checkBundle && filePath.endsWith('.html')) {
                content = stripSystemLinks(content);
            }

            expect(content).toMatchSnapshot();
        });
    }
}

type TestPaths = {
    inputPath: string;
    outputPath: string;
};

export function getTestPaths(testRootPath: string): TestPaths {
    return {
        inputPath: resolve(__dirname, '../../', join(testRootPath, 'input')),
        outputPath: resolve(__dirname, '../../', join(testRootPath, 'output')),
    };
}

export function cleanupDirectory(path: string) {
    return rm(path, {recursive: true, force: true});
}
