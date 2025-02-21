import {expect} from 'vitest';
import {resolve} from 'path';
import walkSync from 'walk-sync';
import {getFileContent, bundleless} from '~/../tests/utils';

const uselessFile = (file: string | string[]) =>
    !['_bundle/', '_search/'].some((part) => file.includes(part));

export function compareDirectories(outputPath: string) {
    const filesFromOutput = walkSync(outputPath, {
        directories: false,
        includeBasePath: false,
    }).sort();

    expect(bundleless(JSON.stringify(filesFromOutput, null, 2))).toMatchSnapshot();

    filesFromOutput.filter(uselessFile).forEach((filePath) => {
        const content = getFileContent(resolve(outputPath, filePath));
        expect(content).toMatchSnapshot();
    });
}
