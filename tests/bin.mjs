#!/usr/bin/env node

import {spawn} from 'node:child_process';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const vitestPath = require.resolve('vitest');

const vitest = spawn(
    join(dirname(vitestPath), 'vitest.mjs'),
    [
        'run',
        '--config',
        resolve(dirname(fileURLToPath(import.meta.url)), 'vitest.config.ts'),
        ...process.argv.slice(2),
    ],
    {
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: 'test',
        },
    },
);

vitest.on('exit', (code) => {
    process.exit(code || 0);
});
