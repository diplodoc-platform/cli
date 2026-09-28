import {createServer} from 'node:http';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect, it} from 'vitest';

import runner from '../fixtures/runner';

it.each([false, true])(
    'applies a manifest delta through the packaged CLI (partial=%s)',
    {timeout: 60_000},
    async (partial) => {
        const root = mkdtempSync(join(tmpdir(), 'translate-update-e2e-'));
        const input = join(root, 'input');
        const output = join(root, 'output');
        mkdirSync(join(input, 'ru'), {recursive: true});
        mkdirSync(join(input, 'en'));
        mkdirSync(output);
        const sourceAfter = partial ? '# Новое\n\nНовая история' : '# Новое\n\nИстория';
        const target = '# Previous\n\nHuman-only text' + (partial ? '\n\nExtra explanation' : '');
        writeFileSync(join(input, 'ru/a.md'), sourceAfter);
        writeFileSync(join(input, 'en/a.md'), target);
        writeFileSync(join(root, 'before.md'), '# Старое\n\nИстория');
        writeFileSync(join(root, 'after.md'), sourceAfter);
        writeFileSync(join(root, 'target.md'), target);
        const manifest = join(root, 'manifest.json');
        writeFileSync(
            manifest,
            JSON.stringify({
                schemaVersion: 1,
                files: [
                    {
                        kind: 'update',
                        sourcePath: 'ru/a.md',
                        targetPath: 'en/a.md',
                        sourceBeforePath: 'before.md',
                        sourceAfterPath: 'after.md',
                        targetBeforePath: 'target.md',
                    },
                ],
            }),
        );
        const requests: string[] = [];
        const server = createServer(async (request, response) => {
            let body = '';
            for await (const chunk of request) body += String(chunk);
            requests.push(body);
            response.setHeader('content-type', 'application/json');
            response.end(
                JSON.stringify({
                    choices: [
                        {message: {role: 'assistant', content: 'New title'}, finish_reason: 'stop'},
                    ],
                    usage: {prompt_tokens: 1, completion_tokens: 1},
                }),
            );
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Missing test server address');
        const args = [
            'translate',
            '-i',
            input,
            '-o',
            output,
            '-sl',
            'ru',
            '-tl',
            'en',
            '--provider',
            'openai',
            '--model',
            'mock',
            '--auth',
            'fake',
            '--api-base',
            `http://127.0.0.1:${address.port}/v1`,
            '--update-manifest',
            manifest,
            '--report',
            join(root, 'report.json'),
        ];
        try {
            const result = await runner.runRaw(args);
            expect(result.code, result.stderr).toBe(partial ? 1 : 0);
            expect(readFileSync(join(output, 'en/a.md'), 'utf8')).toBe(
                target.replace('# Previous', '# New title'),
            );
            expect(requests).toHaveLength(1);
            expect(requests[0]).not.toContain('Human-only text');
            const report = JSON.parse(readFileSync(join(root, 'report.json'), 'utf8'));
            expect(report.updates).toMatchObject([{applied: 1, rejected: partial ? 1 : 0}]);
            expect(report.status).toBe(partial ? 'partial' : 'success');
            rmSync(join(output, 'en/a.md'));
            writeFileSync(manifest, '{"schemaVersion":999,"files":[]}');
            const invalid = await runner.runRaw(args);
            expect(invalid.code).not.toBe(0);
            expect(requests).toHaveLength(1);
            expect(existsSync(join(output, 'en/a.md'))).toBe(false);
        } finally {
            await new Promise<void>((resolve, reject) =>
                server.close((error) => (error ? reject(error) : resolve())),
            );
            rmSync(root, {recursive: true, force: true});
        }
    },
);
