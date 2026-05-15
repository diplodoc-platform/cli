#!/usr/bin/env node

import {execa} from 'execa';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const vitestPath = require.resolve('vitest');
const configPath = resolve(dirname(fileURLToPath(import.meta.url)), 'vitest.config.ts');

let stdout = '';
let stderr = '';

const childProcess = execa(
    join(dirname(vitestPath), 'vitest.mjs'),
    ['run', '--config', configPath, ...process.argv.slice(2)],
    {
        stdio: ['inherit', 'pipe', 'pipe'],
        env: {...process.env, NODE_ENV: 'test'},
        reject: false,
    },
);

childProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(chunk);
});

childProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(chunk);
});

const result = await childProcess;

if (result.exitCode !== 0) {
    const output = stdout + stderr;
    const hasTimeout = /Test timed out|timed out in \d+ms/gi.test(output);
    const exitCode = hasTimeout ? 124 : result.exitCode || 1;

    const error = new Error(`Command failed with exit code ${result.exitCode}`);
    error.exitCode = exitCode;

    if (hasTimeout) {
        const timeoutCount = (output.match(/Test timed out|timed out in \d+ms/gi) || []).length;
        error.message += ` (${timeoutCount} timeout${timeoutCount > 1 ? 's' : ''} detected)`;
    }

    process.exit(exitCode);
}
