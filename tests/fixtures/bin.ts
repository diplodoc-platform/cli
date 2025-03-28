#!/usr/bin/env node

import {program} from 'commander';
import {resolve} from 'path';
import {spawn} from 'child_process';

program
    .name('diplodoc-test')
    .description('Run Diplodoc CLI tests')
    .version('1.0.0')
    .option('--test-dir <dir>', 'Directory containing test files', 'e2e')
    .option('--test-pattern <pattern>', 'Pattern to match test files', '**/*.{test,spec}.ts')
    .option('--coverage', 'Generate coverage report')
    .action(async (options) => {
        const jestArgs = [
            '--config', resolve(__dirname, '../jest.config.js'),
        ];

        if (options.coverage) {
            jestArgs.push('--coverage');
        }

        // Pass through any additional Jest arguments
        const additionalArgs = program.args;
        jestArgs.push(...additionalArgs);

        const jest = spawn('jest', jestArgs, {
            stdio: 'inherit',
            env: {
                ...process.env,
                // Allow overriding test paths via environment variable
                DIPLODOC_TEST_PATHS: process.env.DIPLODOC_TEST_PATHS || ''
            }
        });

        jest.on('exit', (code) => {
            process.exit(code || 0);
        });
    });

program.parse(); 
