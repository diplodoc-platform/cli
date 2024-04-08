import {glob} from '../utils/glob';
import {join} from 'node:path';
import {ArgvService} from '../services';
import {readFile, unlink, writeFile} from 'node:fs/promises';

type Language = string;
type MergedChangelogs =
    | {
          [language: Language]: Record<string, Record<string, unknown>>;
      }
    | Record<string, Record<string, unknown>>;

/*
    {
        "ru": {
            "/": {
                "12314": <changelog>
            },
            "/plugins": {
                "213312": <changelog>
            }
        }
    }

    or if single language

    {
        "/": {
            "12314": <changelog>
        },
        "/plugins": {
            "213312": <changelog>
        }
    }
*/

export async function processChangelogs() {
    const {output: outputFolderPath, langs} = ArgvService.getConfig();

    const result = await glob('**/**/changes-*', {
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
        if (!langs?.length) {
            const parts = path.split('/');
            const [, hash] = parts.pop().split(/[-.]/);

            const fullPath = '/' + parts.join('/');

            if (!merged[fullPath]) {
                merged[fullPath] = {};
            }

            Object.assign(merged[fullPath], {
                [hash]: value,
            });

            return;
        }

        const [lang, ...rest] = path.split('/');
        const [, hash] = rest.pop().split(/[-.]/);

        const fullPath = '/' + rest.join('/');

        if (!merged[lang]) {
            merged[lang] = {};
        }

        if (!merged[lang][fullPath]) {
            merged[lang][fullPath] = {};
        }

        Object.assign(merged[lang][fullPath], {
            [hash]: value,
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
