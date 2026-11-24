import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'path';
import {afterEach, expect, it, vi} from 'vitest';

import {Run} from './run';
import {upload} from './upload';

let root: string;

afterEach(async () => {
    vi.restoreAllMocks();
    if (root) {
        await rm(root, {recursive: true, force: true});
    }
});

it('publishes UTF-8 content types for text files and preserves binary and unknown types', async () => {
    root = await mkdtemp(join(tmpdir(), 'publish-content-type-'));
    const files: [string, string | false][] = [
        ['ru/guides/page.md', 'text/markdown; charset=utf-8'],
        ['llms.txt', 'text/plain; charset=utf-8'],
        ['llms-full.txt', 'text/plain; charset=utf-8'],
        ['index.html', 'text/html; charset=utf-8'],
        ['assets/style.css', 'text/css; charset=utf-8'],
        ['assets/script.js', 'application/javascript; charset=utf-8'],
        ['api.openapi.json', 'application/json; charset=utf-8'],
        ['assets/image.png', 'image/png'],
        ['archive.zip', 'application/zip'],
        ['unknown.custom', false],
    ];
    for (const [file] of files) {
        await mkdir(dirname(join(root, file)), {recursive: true});
        await writeFile(join(root, file), '# Привет, мир!\n');
    }
    const run = new Run({
        input: resolve(root),
        endpoint: 'https://s3.example.com',
        region: 'us-east-1',
        bucket: 'docs',
        prefix: 'static',
        accessKeyId: 'test',
        secretAccessKey: 'test',
        hidden: [],
        quiet: true,
    });
    const send = vi.spyOn(run, 'send').mockResolvedValue();

    await upload(run);

    expect(send).toHaveBeenCalledTimes(files.length);
    for (const [file, contentType] of files) {
        expect(send).toHaveBeenCalledWith(file, contentType);
    }
    run.s3.destroy();
});
