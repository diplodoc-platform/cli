#!/usr/bin/env node

import {execSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, '..');
const CLI_PATH = join(__dirname, '../build/index.js');
const INPUT_DIR = join(ROOT, '../../docs');
// const INPUT_DIR = '/Users/gold-serg/Projects/test/in/ydb';
// const INPUT_DIR = '/Users/gold-serg/Projects/test/sc-docs';
// const INPUT_DIR = '/Users/gold-serg/Projects/test/metrica/common';
// const INPUT_DIR = '/Users/gold-serg/Projects/test/pdf/in/tracker';
// const INPUT_DIR = '/Users/gold-serg/Projects/test/in/market/common';
// const INPUT_DIR = '/Users/gold-serg/Projects/test/alice-common/alice';

// Test configuration
const TEST_RUNS = 3;
const THREAD_COUNTS = [12, 2, 4, 8];
const OUTPUT_BASE = join(ROOT, 'test-output');
const VERBOSE_LOGS = false; // Set to true to see full build logs
const SHOW_ALL_MISMATCHES = true; // Set to false to show only first mismatch
const PARALLEL_TESTS = 3; // Number of tests to run in parallel (set > 1 to max out CPU)

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function cleanDir(dir) {
    if (existsSync(dir)) {
        rmSync(dir, {recursive: true, force: true});
    }
}

function getFiles(dir) {
    const files = [];

    function traverse(currentDir) {
        const items = readdirSync(currentDir);
        for (const item of items) {
            const fullPath = join(currentDir, item);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.md')) {
                files.push(fullPath);
            }
        }
    }

    traverse(dir);
    return files.sort();
}

function compareFiles(file1, file2) {
    const content1 = readFileSync(file1, 'utf8');
    const content2 = readFileSync(file2, 'utf8');
    return content1 === content2;
}

function compareDirs(dir1, dir2) {
    const files1 = getFiles(dir1);
    const files2 = getFiles(dir2);

    if (files1.length !== files2.length) {
        log(`File count mismatch: ${files1.length} vs ${files2.length}`, colors.red);
        return {matches: false, mismatches: []};
    }

    const mismatches = [];

    for (let i = 0; i < files1.length; i++) {
        const relPath1 = files1[i].replace(dir1, '');
        const relPath2 = files2[i].replace(dir2, '');

        if (relPath1 !== relPath2) {
            log(`File path mismatch: ${relPath1} vs ${relPath2}`, colors.red);
            mismatches.push({type: 'path', file1: relPath1, file2: relPath2});
            if (!SHOW_ALL_MISMATCHES) {
                return {matches: false, mismatches};
            }
        }

        if (!compareFiles(files1[i], files2[i])) {
            log(`Content mismatch in: ${relPath1}`, colors.red);
            const diff = generateDiff(files1[i], files2[i]);
            mismatches.push({type: 'content', path: relPath1, diff});
            if (!SHOW_ALL_MISMATCHES) {
                return {matches: false, mismatches};
            }
        }
    }

    return {matches: mismatches.length === 0, mismatches};
}

function generateDiff(file1, file2) {
    const content1 = readFileSync(file1, 'utf8').split('\n');
    const content2 = readFileSync(file2, 'utf8').split('\n');

    const diff = [];
    let i = 0,
        j = 0;

    while (i < content1.length || j < content2.length) {
        if (i < content1.length && j < content2.length && content1[i] === content2[j]) {
            i++;
            j++;
        } else {
            // Find next matching line
            let found = false;
            for (let di = 0; di < 5 && i + di < content1.length; di++) {
                for (let dj = 0; dj < 5 && j + dj < content2.length; dj++) {
                    if (content1[i + di] === content2[j + dj]) {
                        // Output deletions
                        for (let k = 0; k < di; k++) {
                            diff.push({type: '-', line: content1[i + k], num: i + k + 1});
                        }
                        // Output additions
                        for (let k = 0; k < dj; k++) {
                            diff.push({type: '+', line: content2[j + k], num: j + k + 1});
                        }
                        i += di;
                        j += dj;
                        found = true;
                        break;
                    }
                }
                if (found) break;
            }

            if (!found) {
                if (i < content1.length) {
                    diff.push({type: '-', line: content1[i], num: i + 1});
                    i++;
                }
                if (j < content2.length) {
                    diff.push({type: '+', line: content2[j], num: j + 1});
                    j++;
                }
            }
        }
    }

    return diff;
}

function formatDiffAsMarkdown(diff, maxLines = 50) {
    if (diff.length === 0) return 'No differences';

    const lines = diff.slice(0, maxLines).map((d) => {
        const prefix = d.type === '-' ? '-' : d.type === '+' ? '+' : ' ';
        return `${prefix} ${d.line}`;
    });

    if (diff.length > maxLines) {
        lines.push(`... (${diff.length - maxLines} more lines)`);
    }

    return '```diff\n' + lines.join('\n') + '\n```';
}

function generateReport(results, referenceDir, outputBase) {
    const report = [];
    const timestamp = new Date().toISOString();

    report.push('# Concurrent Build Test Report');
    report.push(`\n**Generated:** ${timestamp}`);
    report.push(`\n## Configuration`);
    report.push(`- Test runs: ${TEST_RUNS}`);
    report.push(`- Thread counts: ${THREAD_COUNTS.join(', ')}`);
    report.push(`- Parallel tests: ${PARALLEL_TESTS}`);
    report.push(`- Input: ${INPUT_DIR}`);

    // Summary by thread count
    report.push(`\n## Summary by Thread Count`);

    for (const threads of THREAD_COUNTS) {
        const threadResults = results.filter((r) => r.threads === threads);
        const matches = threadResults.filter((r) => r.success).length;
        const failures = threadResults.filter((r) => !r.success).length;
        const times = threadResults.filter((r) => r.success).map((r) => r.duration);

        const avgTime =
            times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

        report.push(`\n### ${threads} thread(s)`);
        report.push(`- Success rate: ${matches}/${threadResults.length}`);
        if (times.length > 0) {
            report.push(`- Avg time: ${avgTime}ms`);
        }
    }

    // Detailed failures
    const failedResults = results.filter((r) => !r.success);
    if (failedResults.length > 0) {
        report.push(`\n## Failed Tests (${failedResults.length})`);

        for (const result of failedResults) {
            report.push(`\n### Run ${result.runNumber} (${result.threads} threads)`);
            report.push(`- Output: ${result.outputDir}`);

            if (result.mismatches && result.mismatches.length > 0) {
                report.push(`\n#### Mismatches (${result.mismatches.length})`);

                for (const mismatch of result.mismatches.slice(0, 10)) {
                    if (mismatch.type === 'path') {
                        report.push(`\n**Path mismatch:**`);
                        report.push(`- Reference: ${mismatch.file1}`);
                        report.push(`- Test: ${mismatch.file2}`);
                    } else if (mismatch.type === 'content') {
                        report.push(`\n**Content mismatch:** ${mismatch.path}`);
                        report.push(formatDiffAsMarkdown(mismatch.diff));
                    }
                }

                if (result.mismatches.length > 10) {
                    report.push(`\n... and ${result.mismatches.length - 10} more mismatches`);
                }
            }

            if (result.error) {
                report.push(`\n**Error:** ${result.error}`);
            }
        }
    }

    return report.join('\n');
}

function build(outputDir, threads = 1) {
    const args = [
        'node',
        CLI_PATH,
        'build',
        '--input',
        INPUT_DIR,
        '--output',
        outputDir,
        '--output-format',
        'md',
        '--ignore',
        '**/node_modules/**',
        '--no-vcs',
        '--no-add-alternate-meta',
        '--no-merge-svg',
        '--no-hash-includes',
    ];

    if (threads > 1) {
        args.push('--jobs', String(threads));
    }

    const startTime = Date.now();
    execSync(args.join(' '), {
        stdio: VERBOSE_LOGS ? 'inherit' : 'pipe',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer to avoid ENOBUFS error
    });
    const duration = Date.now() - startTime;

    return duration;
}

async function runSingleTest(runNumber, threads, referenceDir, outputBase) {
    const outputDir = join(outputBase, `run-${runNumber}-${threads}`);

    try {
        const duration = build(outputDir, threads);
        const comparison = compareDirs(referenceDir, outputDir);

        return {
            runNumber,
            threads,
            duration,
            success: comparison.matches,
            outputDir,
            mismatches: comparison.mismatches,
        };
    } catch (error) {
        return {
            runNumber,
            threads,
            duration: 0,
            success: false,
            error: error.message,
            outputDir,
            mismatches: [],
        };
    }
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

async function runTest() {
    log('\n=== Concurrent Build Test ===', colors.cyan);
    log(`Input: ${INPUT_DIR}`, colors.blue);
    log(`Test runs: ${TEST_RUNS}`, colors.blue);
    log(`Thread counts: ${THREAD_COUNTS.join(', ')}`, colors.blue);
    log('================================\n', colors.cyan);

    // Clean output directory before starting
    cleanDir(OUTPUT_BASE);

    // Build reference with 1 thread
    const referenceDir = join(OUTPUT_BASE, 'reference');
    log('Building reference (1 thread)...', colors.yellow);
    const refTime = build(referenceDir, 1);
    log(`Reference build time: ${refTime}ms`, colors.green);

    const results = [];

    // Generate random sequence of thread counts
    const testSequence = [];
    for (let i = 0; i < TEST_RUNS; i++) {
        testSequence.push(...shuffleArray(THREAD_COUNTS));
    }

    log(`\nRunning ${testSequence.length} tests in random order...`, colors.cyan);
    if (PARALLEL_TESTS > 1) {
        log(`Parallel execution: ${PARALLEL_TESTS} tests at a time`, colors.cyan);
    }

    // Run tests in batches
    for (let i = 0; i < testSequence.length; i += PARALLEL_TESTS) {
        const batch = testSequence.slice(i, i + PARALLEL_TESTS);
        const batchPromises = batch.map((threads, idx) =>
            runSingleTest(i + idx + 1, threads, referenceDir, OUTPUT_BASE),
        );

        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
            process.stdout.write(
                `  Run ${result.runNumber}/${testSequence.length} (${result.threads} threads)... `,
            );

            if (result.success) {
                log(`✓ ${result.duration}ms`, colors.green);
            } else {
                log(`✗ ${result.duration}ms (MISMATCH)`, colors.red);
                if (result.error) {
                    log(`  ERROR: ${result.error}`, colors.red);
                }
            }

            // Save full result object
            results.push(result);
        }
    }

    // Summary by thread count
    log('\n=== Summary by thread count ===', colors.cyan);
    let allPassed = true;

    for (const threads of THREAD_COUNTS) {
        const threadResults = results.filter((r) => r.threads === threads);
        const matches = threadResults.filter((r) => r.success).length;
        const failures = threadResults.filter((r) => !r.success).length;
        const times = threadResults.filter((r) => r.success).map((r) => r.duration);

        const avgTime =
            times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
        const minTime = times.length > 0 ? Math.min(...times) : 0;
        const maxTime = times.length > 0 ? Math.max(...times) : 0;
        const speedup = avgTime > 0 ? (refTime / avgTime).toFixed(2) : 'N/A';

        const passed = failures === 0;
        allPassed = allPassed && passed;

        log(`\n${threads} thread(s):`, colors.yellow);
        log(
            `  Success rate: ${matches}/${threadResults.length}`,
            passed ? colors.green : colors.red,
        );
        if (times.length > 0) {
            log(`  Avg time: ${avgTime}ms (speedup: ${speedup}x)`, colors.blue);
            log(`  Min time: ${minTime}ms`, colors.blue);
            log(`  Max time: ${maxTime}ms`, colors.blue);
        }
    }

    // Overall summary
    log('\n=== Overall Summary ===', colors.cyan);
    const totalMatches = results.filter((r) => r.success).length;
    const totalFailures = results.filter((r) => !r.success).length;
    log(
        `Total: ${totalMatches}/${results.length} passed`,
        totalFailures === 0 ? colors.green : colors.red,
    );

    // Generate report
    const reportPath = join(OUTPUT_BASE, 'test-report.md');
    const report = generateReport(results, referenceDir, OUTPUT_BASE);
    writeFileSync(reportPath, report, 'utf8');
    log(`\nReport saved to: ${reportPath}`, colors.cyan);

    // Don't cleanup for debugging

    if (allPassed) {
        log('\n✓ All tests passed!', colors.green);
        process.exit(0);
    } else {
        log('\n✗ Some tests failed!', colors.red);
        process.exit(1);
    }
}

runTest().catch((error) => {
    log(`\n✗ Test failed with error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
