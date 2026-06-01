#!/usr/bin/env node

import {execSync, spawn} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

function expandPath(value) {
    if (typeof value !== 'string') return value;
    let result = value;
    if (result === '~') {
        result = homedir();
    } else if (result.startsWith('~/')) {
        result = join(homedir(), result.slice(2));
    }
    result = result.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/gi, (_, a, b) => {
        const name = a || b;
        return process.env[name] ?? '';
    });
    return result;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLI_PATH = join(__dirname, '../build/index.js');

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
    const out = {configPath: null};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--config' || a === '-c') {
            out.configPath = argv[++i];
        } else if (a.startsWith('--config=')) {
            out.configPath = a.slice('--config='.length);
        }
    }
    return out;
}

function loadConfig(explicitPath) {
    const defaultPath = join(__dirname, 'test-build-options.config.yaml');
    const configPath = explicitPath
        ? isAbsolute(explicitPath)
            ? explicitPath
            : resolve(process.cwd(), explicitPath)
        : defaultPath;

    if (!existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }

    const raw = readFileSync(configPath, 'utf8');
    const cfg = yaml.load(raw) || {};

    // Apply defaults / validation
    cfg.inputBase = expandPath(cfg.inputBase || '~/Projects/test/in');
    cfg.outputBase = expandPath(cfg.outputBase || '~/Projects/test/out');
    cfg.commonArgs = Array.isArray(cfg.commonArgs) ? cfg.commonArgs : [];
    cfg.openMeld = Boolean(cfg.openMeld);
    cfg.saveReport = cfg.saveReport !== false;
    cfg.modes = Array.isArray(cfg.modes) ? cfg.modes : [];
    cfg.projects = Array.isArray(cfg.projects) ? cfg.projects : [];

    // Normalize modes
    cfg.modes = cfg.modes.map((m, i) => {
        if (!m || typeof m !== 'object') {
            throw new Error(`Invalid mode at index ${i}`);
        }
        const name = m.name || `mode-${i + 1}`;
        const md_args = Array.isArray(m.md_args) ? m.md_args : null; // null => skip md2md
        const html_args = Array.isArray(m.html_args) ? m.html_args : [];
        return {name, md_args, html_args};
    });

    return {cfg, configPath};
}

const cliArgs = parseCliArgs(process.argv.slice(2));
const {cfg: CONFIG, configPath: CONFIG_PATH} = loadConfig(cliArgs.configPath);

const INPUT_BASE = CONFIG.inputBase;
const OUTPUT_BASE = CONFIG.outputBase;
const BUILD_MODES = CONFIG.modes;
const PROJECTS = CONFIG.projects;
const COMMON_ARGS = CONFIG.commonArgs;
const OPEN_MELD = CONFIG.openMeld || process.env.OPEN_MELD === '1';

// ---------------------------------------------------------------------------
// ANSI colors
// ---------------------------------------------------------------------------

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    magenta: '\x1b[35m',
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

// ---------------------------------------------------------------------------
// FS / formatting helpers
// ---------------------------------------------------------------------------

function cleanDir(dir) {
    if (existsSync(dir)) {
        rmSync(dir, {recursive: true, force: true});
    }
}

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    const totalSec = ms / 1000;
    if (totalSec < 60) return `${totalSec.toFixed(2)}s`;
    const min = Math.floor(totalSec / 60);
    const sec = (totalSec - min * 60).toFixed(1);
    return `${min}m ${sec}s`;
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    const rounded =
        value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
    return `${rounded} ${units[unitIndex]}`;
}

function formatBytesFull(bytes) {
    return `${bytes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} B`;
}

function getDirSize(dir) {
    if (!existsSync(dir)) return 0;
    let total = 0;
    const stack = [dir];
    while (stack.length) {
        const current = stack.pop();
        let stat;
        try {
            stat = statSync(current);
        } catch {
            continue;
        }
        if (stat.isDirectory()) {
            let items;
            try {
                items = readdirSync(current);
            } catch {
                continue;
            }
            for (const item of items) {
                stack.push(join(current, item));
            }
        } else if (stat.isFile()) {
            total += stat.size;
        }
    }
    return total;
}

// ---------------------------------------------------------------------------
// HTML comparison
// ---------------------------------------------------------------------------

function getHtmlFiles(dir) {
    const files = [];

    function traverse(currentDir) {
        const items = readdirSync(currentDir);
        for (const item of items) {
            const fullPath = join(currentDir, item);
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                traverse(fullPath);
            } else if (item.endsWith('.html')) {
                files.push(fullPath);
            }
        }
    }

    traverse(dir);
    return files.sort();
}

function extractDiplodocState(htmlContent) {
    const startTag = '<script type="application/json" id="diplodoc-state">';
    const endTag = '</script>';

    const startIndex = htmlContent.indexOf(startTag);
    if (startIndex === -1) return null;

    const startContent = startIndex + startTag.length;
    const endIndex = htmlContent.indexOf(endTag, startContent);
    if (endIndex === -1) return null;

    return htmlContent.slice(startContent, endIndex).trim();
}

function compareDiplodocStates(file1, file2) {
    const content1 = readFileSync(file1, 'utf8');
    const content2 = readFileSync(file2, 'utf8');

    const state1 = extractDiplodocState(content1);
    const state2 = extractDiplodocState(content2);

    if (state1 === null && state2 === null) {
        return {matches: true, reason: 'No diplodoc-state found in both files'};
    }
    if (state1 === null) return {matches: false, reason: 'No diplodoc-state found in file1'};
    if (state2 === null) return {matches: false, reason: 'No diplodoc-state found in file2'};

    try {
        const json1 = JSON.parse(state1);
        const json2 = JSON.parse(state2);
        const matches = JSON.stringify(json1) === JSON.stringify(json2);
        return {matches, reason: matches ? 'States match' : 'States differ'};
    } catch (error) {
        return {matches: false, reason: `JSON parse error: ${error.message}`};
    }
}

function compareHtmlDirs(dir1, dir2) {
    const files1 = getHtmlFiles(dir1);
    const files2 = getHtmlFiles(dir2);

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
            continue;
        }

        const comparison = compareDiplodocStates(files1[i], files2[i]);
        if (!comparison.matches) {
            mismatches.push({type: 'content', path: relPath1, reason: comparison.reason});
        }
    }

    return {matches: mismatches.length === 0, mismatches};
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function buildProject(inputDir, outputDir, extraArgs = []) {
    const args = [
        'node',
        CLI_PATH,
        'build',
        '--input',
        inputDir,
        '--output',
        outputDir,
        ...COMMON_ARGS,
        ...extraArgs,
    ];

    execSync(args.join(' '), {
        stdio: 'pipe',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    });
}

function buildProjectWithModes(project) {
    const inputDir = join(INPUT_BASE, project);
    const results = [];

    log(`\nProcessing project: ${project}`, colors.cyan);
    log(`Input: ${inputDir}`, colors.blue);

    for (const mode of BUILD_MODES) {
        const mdDir = join(OUTPUT_BASE, project, `md-${mode.name}`);
        const htmlDir = join(OUTPUT_BASE, project, `html-${mode.name}`);

        cleanDir(htmlDir);

        const stepResult = {
            mode: mode.name,
            mdDir: mode.md_args ? mdDir : null,
            htmlDir,
            mdSuccess: false,
            mdSkipped: !mode.md_args,
            htmlSuccess: false,
            mdDuration: 0,
            htmlDuration: 0,
            mdSize: 0,
            htmlSize: 0,
            success: false,
            outputDir: null,
            error: null,
        };

        // ---- md2md step (optional) ----
        let htmlInputDir = inputDir;
        if (mode.md_args) {
            cleanDir(mdDir);
            log(`Building MD with mode: ${mode.name}`, colors.yellow);
            const mdStart = Date.now();
            try {
                buildProject(inputDir, mdDir, ['-f', 'md', ...mode.md_args]);
                stepResult.mdDuration = Date.now() - mdStart;
                stepResult.mdSuccess = true;
                stepResult.mdSize = getDirSize(mdDir);
                htmlInputDir = mdDir;
                log(
                    `  ✓ MD ${mode.name} [${formatDuration(stepResult.mdDuration)}, ${formatBytes(stepResult.mdSize)} / ${formatBytesFull(stepResult.mdSize)}]`,
                    colors.green,
                );
            } catch (error) {
                stepResult.mdDuration = Date.now() - mdStart;
                stepResult.error = error.message;
                results.push(stepResult);
                log(
                    `  ✗ MD ${mode.name} [${formatDuration(stepResult.mdDuration)}]: ${error.message}`,
                    colors.red,
                );
                continue;
            }
        } else {
            log(`Skipping MD step for mode: ${mode.name} (direct md2html)`, colors.gray);
        }

        // ---- md2html step ----
        log(`Building HTML with mode: ${mode.name}`, colors.yellow);
        const htmlStart = Date.now();
        try {
            buildProject(htmlInputDir, htmlDir, mode.html_args);
            stepResult.htmlDuration = Date.now() - htmlStart;
            stepResult.htmlSuccess = true;
            stepResult.htmlSize = getDirSize(htmlDir);
            stepResult.success = true;
            stepResult.outputDir = htmlDir;
            log(
                `  ✓ HTML ${mode.name} [${formatDuration(stepResult.htmlDuration)}, ${formatBytes(stepResult.htmlSize)} / ${formatBytesFull(stepResult.htmlSize)}]`,
                colors.green,
            );
        } catch (error) {
            stepResult.htmlDuration = Date.now() - htmlStart;
            stepResult.error = error.message;
            log(
                `  ✗ HTML ${mode.name} [${formatDuration(stepResult.htmlDuration)}]: ${error.message}`,
                colors.red,
            );
        }

        results.push(stepResult);
    }

    return results;
}

// ---------------------------------------------------------------------------
// Meld integration
// ---------------------------------------------------------------------------

function detectMeldCommand() {
    const candidates = ['meld', '/Applications/Meld.app/Contents/MacOS/Meld'];
    for (const cmd of candidates) {
        try {
            execSync(`command -v ${cmd} >/dev/null 2>&1 || test -x ${cmd}`, {stdio: 'ignore'});
            return cmd;
        } catch {
            // continue
        }
    }
    // macOS: also detect installed .app bundle that can be launched via `open -a`
    if (process.platform === 'darwin' && existsSync('/Applications/Meld.app')) {
        return 'open-app:Meld';
    }
    return null;
}

const MELD_CMD = detectMeldCommand();

function buildMeldHint(dir1, dir2) {
    if (!dir1 || !dir2) return null;
    if (MELD_CMD === 'open-app:Meld') {
        return `open -na Meld --args "${dir1}" "${dir2}"`;
    }
    const cmd = MELD_CMD || 'meld';
    return `${cmd} "${dir1}" "${dir2}"`;
}

/**
 * Launch Meld in a new, detached window. We use spawn() with detached:true and
 * ignored stdio so the GUI is fully decoupled from this Node process.
 */
function tryOpenMeld(dir1, dir2) {
    if (!MELD_CMD) return false;
    try {
        let child;
        if (MELD_CMD === 'open-app:Meld') {
            // `open -na Meld --args ...` launches a new instance bound to a new GUI window
            child = spawn('open', ['-na', 'Meld', '--args', dir1, dir2], {
                detached: true,
                stdio: 'ignore',
            });
        } else {
            child = spawn(MELD_CMD, [dir1, dir2], {
                detached: true,
                stdio: 'ignore',
            });
        }
        child.unref();
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function padEnd(str, len) {
    const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
    if (visible.length >= len) return str;
    return str + ' '.repeat(len - visible.length);
}

function printSummaryTable(allResults) {
    log('\n=== Summary Table ===', colors.cyan);

    const headers = [
        'Project',
        'Status',
        ...BUILD_MODES.flatMap((m) => [
            `${m.name} MD time`,
            `${m.name} MD size`,
            `${m.name} HTML time`,
            `${m.name} HTML size`,
        ]),
        'Mismatches',
    ];

    const rows = [headers];

    for (const result of allResults) {
        const row = [result.project];
        const hasError = result.buildResults.some((r) => !r.success);
        const hasDelta = result.comparison && !result.comparison.matches;
        const status = !hasError && !hasDelta ? '✓' : hasError ? '✗ ERR' : '≠ DIFF';
        row.push(status);

        for (const mode of BUILD_MODES) {
            const r = result.buildResults.find((b) => b.mode === mode.name);
            if (!r) {
                row.push('-', '-', '-', '-');
                continue;
            }
            if (r.mdSkipped) {
                row.push('skip', '-');
            } else {
                row.push(r.mdSuccess ? formatDuration(r.mdDuration) : 'FAIL');
                row.push(r.mdSuccess ? formatBytes(r.mdSize) : '-');
            }
            row.push(
                r.htmlSuccess
                    ? formatDuration(r.htmlDuration)
                    : r.mdSuccess || r.mdSkipped
                      ? 'FAIL'
                      : '-',
            );
            row.push(r.htmlSuccess ? formatBytes(r.htmlSize) : '-');
        }

        const mismatchCount = result.comparison
            ? result.comparison.mismatches.length
            : hasError
              ? 'n/a'
              : '0';
        row.push(String(mismatchCount));
        rows.push(row);
    }

    const widths = headers.map((_, i) => Math.max(...rows.map((r) => String(r[i] ?? '').length)));

    const renderRow = (row, color = colors.reset) => {
        const cells = row.map((c, i) => padEnd(String(c ?? ''), widths[i]));
        log(`  ${cells.join(' │ ')}`, color);
    };

    renderRow(headers, colors.cyan);
    log('  ' + widths.map((w) => '─'.repeat(w)).join('─┼─'), colors.gray);

    for (let i = 1; i < rows.length; i++) {
        const result = allResults[i - 1];
        const hasError = result.buildResults.some((r) => !r.success);
        const hasDelta = result.comparison && !result.comparison.matches;
        const color = hasError ? colors.red : hasDelta ? colors.yellow : colors.green;
        renderRow(rows[i], color);
    }
}

function printMeldHints(allResults) {
    const problematic = allResults.filter(
        (r) => r.buildResults.some((b) => !b.success) || (r.comparison && !r.comparison.matches),
    );

    if (problematic.length === 0) return;

    log('\n=== Meld diff suggestions ===', colors.cyan);
    if (!MELD_CMD) {
        log(
            '  (meld not found in PATH or /Applications; commands below assume meld is installed)',
            colors.gray,
        );
    }

    for (const result of problematic) {
        const successful = result.buildResults.filter((b) => b.outputDir);
        log(`\n  • ${result.project}`, colors.magenta);

        if (successful.length >= 2) {
            const sizeA = successful[0].htmlSize;
            const sizeB = successful[1].htmlSize;
            log(
                `    HTML sizes: A=${formatBytes(sizeA)} (${formatBytesFull(sizeA)}), B=${formatBytes(sizeB)} (${formatBytesFull(sizeB)})`,
                colors.gray,
            );
            const hint = buildMeldHint(successful[0].outputDir, successful[1].outputDir);
            log(`    HTML: ${hint}`, colors.blue);
        }
    }
}

function generateReport(allResults) {
    const report = [];
    const timestamp = new Date().toISOString();

    report.push('# Build Options Test Report');
    report.push(`\n**Generated:** ${timestamp}`);
    report.push(`\n**Config:** \`${CONFIG_PATH}\``);
    report.push(`\n## Configuration`);
    report.push(`- Projects: ${PROJECTS.join(', ')}`);
    report.push(`- Build modes: ${BUILD_MODES.map((m) => m.name).join(', ')}`);

    report.push(`\n## Summary Table`);
    const headerCells = ['Project', 'Status'];
    for (const mode of BUILD_MODES) {
        headerCells.push(
            `${mode.name} MD time`,
            `${mode.name} MD size`,
            `${mode.name} MD size (bytes)`,
            `${mode.name} HTML time`,
            `${mode.name} HTML size`,
            `${mode.name} HTML size (bytes)`,
        );
    }
    headerCells.push('Mismatches');

    report.push(`\n| ${headerCells.join(' | ')} |`);
    report.push(`| ${headerCells.map(() => '---').join(' | ')} |`);

    for (const result of allResults) {
        const hasError = result.buildResults.some((r) => !r.success);
        const hasDelta = result.comparison && !result.comparison.matches;
        const status = !hasError && !hasDelta ? '✓ PASSED' : hasError ? '✗ FAILED' : '≠ DIFF';
        const row = [result.project, status];
        for (const mode of BUILD_MODES) {
            const r = result.buildResults.find((b) => b.mode === mode.name);
            if (!r) {
                row.push('-', '-', '-', '-', '-', '-');
                continue;
            }
            if (r.mdSkipped) {
                row.push('skip', '-', '-');
            } else {
                row.push(r.mdSuccess ? formatDuration(r.mdDuration) : 'FAIL');
                row.push(r.mdSuccess ? formatBytes(r.mdSize) : '-');
                row.push(r.mdSuccess ? formatBytesFull(r.mdSize) : '-');
            }
            row.push(
                r.htmlSuccess
                    ? formatDuration(r.htmlDuration)
                    : r.mdSuccess || r.mdSkipped
                      ? 'FAIL'
                      : '-',
            );
            row.push(r.htmlSuccess ? formatBytes(r.htmlSize) : '-');
            row.push(r.htmlSuccess ? formatBytesFull(r.htmlSize) : '-');
        }
        const mismatchCount = result.comparison
            ? result.comparison.mismatches.length
            : hasError
              ? 'n/a'
              : '0';
        row.push(String(mismatchCount));
        report.push(`| ${row.join(' | ')} |`);
    }

    report.push(`\n## Details by Project`);

    for (const result of allResults) {
        report.push(`\n### ${result.project}`);
        const hasError = result.buildResults.some((r) => !r.success);
        const hasDelta = result.comparison && !result.comparison.matches;
        report.push(
            `- Status: ${!hasError && !hasDelta ? '✓ PASSED' : hasError ? '✗ FAILED' : '≠ DIFF'}`,
        );

        for (const r of result.buildResults) {
            report.push(`- **${r.mode}**:`);
            if (r.mdSkipped) {
                report.push(`  - MD: ⊘ skipped (direct md2html)`);
            } else {
                report.push(
                    `  - MD: ${r.mdSuccess ? '✓' : '✗'} ${formatDuration(r.mdDuration)}, ` +
                        `${r.mdSuccess ? `${formatBytes(r.mdSize)} (${formatBytesFull(r.mdSize)})` : 'n/a'}`,
                );
            }
            report.push(
                `  - HTML: ${r.htmlSuccess ? '✓' : '✗'} ${formatDuration(r.htmlDuration)}, ` +
                    `${r.htmlSuccess ? `${formatBytes(r.htmlSize)} (${formatBytesFull(r.htmlSize)})` : 'n/a'}`,
            );
            if (r.error) {
                report.push(`  - Error: \`${r.error.split('\n')[0]}\``);
            }
        }

        if (hasError || hasDelta) {
            const successful = result.buildResults.filter((b) => b.outputDir);
            if (successful.length >= 2) {
                const sizeA = successful[0].htmlSize;
                const sizeB = successful[1].htmlSize;
                report.push(`- Meld:`);
                report.push(
                    `  - HTML sizes: A = ${formatBytes(sizeA)} (${formatBytesFull(sizeA)}), B = ${formatBytes(sizeB)} (${formatBytesFull(sizeB)})`,
                );
                report.push(
                    `  - HTML: \`${buildMeldHint(successful[0].outputDir, successful[1].outputDir)}\``,
                );
            }
        }

        if (result.comparison && result.comparison.mismatches.length > 0) {
            report.push(`\n#### Mismatches (${result.comparison.mismatches.length})`);

            for (const mismatch of result.comparison.mismatches.slice(0, 20)) {
                if (mismatch.type === 'path') {
                    report.push(`\n**Path mismatch:**`);
                    report.push(`- File1: ${mismatch.file1}`);
                    report.push(`- File2: ${mismatch.file2}`);
                } else if (mismatch.type === 'content') {
                    report.push(`\n**Content mismatch:** ${mismatch.path}`);
                    report.push(`- Reason: ${mismatch.reason}`);
                }
            }

            if (result.comparison.mismatches.length > 20) {
                report.push(
                    `\n... and ${result.comparison.mismatches.length - 20} more mismatches`,
                );
            }
        }
    }

    const passedProjects = allResults.filter((r) => r.allMatched).length;
    const failedProjects = allResults.filter((r) => !r.allMatched).length;

    report.push(`\n## Overall Summary`);
    report.push(`- Total projects: ${allResults.length}`);
    report.push(`- Passed: ${passedProjects}`);
    report.push(`- Failed: ${failedProjects}`);

    return report.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function runTest() {
    const totalStart = Date.now();
    log('\n=== Build Options Test ===', colors.cyan);
    log(`Config: ${CONFIG_PATH}`, colors.gray);
    const projectsLog =
        PROJECTS.length < 10
            ? `Projects: ${PROJECTS.length} (${PROJECTS.join(', ')})`
            : `Projects: ${PROJECTS.length}`;
    log(projectsLog, colors.blue);
    log(`Build modes: ${BUILD_MODES.map((m) => m.name).join(', ')}`, colors.blue);
    log(
        `Meld: ${MELD_CMD ? MELD_CMD : 'not detected'}${OPEN_MELD ? ' (auto-open enabled)' : ''}`,
        colors.blue,
    );
    log('================================\n', colors.cyan);

    if (BUILD_MODES.length === 0) {
        log('No modes configured', colors.red);
        process.exit(1);
    }
    if (PROJECTS.length === 0) {
        log('No projects configured', colors.red);
        process.exit(1);
    }

    const allResults = [];

    for (const project of PROJECTS) {
        const projectStart = Date.now();
        const buildResults = buildProjectWithModes(project);
        const projectDuration = Date.now() - projectStart;

        let comparison = null;
        if (buildResults.length >= 2 && buildResults.every((r) => r.success)) {
            const dir1 = buildResults[0].outputDir;
            const dir2 = buildResults[1].outputDir;
            comparison = compareHtmlDirs(dir1, dir2);

            if (comparison.matches) {
                log(`  ✓ All diplodoc states match`, colors.green);
            } else {
                log(`  ✗ Found ${comparison.mismatches.length} mismatches`, colors.red);
            }
        }

        const allMatched = comparison ? comparison.matches : false;
        allResults.push({project, buildResults, comparison, allMatched, projectDuration});

        log(`  ⏱  Project total: ${formatDuration(projectDuration)}`, colors.gray);

        const hasError = buildResults.some((r) => !r.success);
        const hasDelta = comparison && !comparison.matches;
        if (hasError || hasDelta) {
            const successful = buildResults.filter((b) => b.outputDir);
            if (successful.length >= 2) {
                const sizeA = successful[0].htmlSize;
                const sizeB = successful[1].htmlSize;
                log(
                    `  📏 HTML sizes: A=${formatBytes(sizeA)} (${formatBytesFull(sizeA)}), B=${formatBytes(sizeB)} (${formatBytesFull(sizeB)})`,
                    colors.gray,
                );
                log(
                    `  🔍 Meld HTML: ${buildMeldHint(successful[0].outputDir, successful[1].outputDir)}`,
                    colors.magenta,
                );

                if (OPEN_MELD) {
                    const opened = tryOpenMeld(successful[0].outputDir, successful[1].outputDir);
                    if (opened) {
                        log(`  🚀 Opened Meld for HTML diff (new window)`, colors.magenta);
                    } else {
                        log(`  ⚠  Failed to launch Meld automatically`, colors.yellow);
                    }
                }
            }
        }
    }

    printSummaryTable(allResults);
    printMeldHints(allResults);

    log('\n=== Overall Summary ===', colors.cyan);
    const passedProjects = allResults.filter((r) => r.allMatched).length;
    const failedProjects = allResults.filter((r) => !r.allMatched).length;
    log(
        `Total: ${passedProjects}/${allResults.length} passed`,
        failedProjects === 0 ? colors.green : colors.red,
    );
    log(`Total time: ${formatDuration(Date.now() - totalStart)}`, colors.gray);

    if (failedProjects > 0) {
        log('\n=== Project Status Summary ===', colors.cyan);
        for (const result of allResults) {
            const status = result.allMatched ? '✓' : '✗';
            const color = result.allMatched ? colors.green : colors.red;
            log(`  ${status} ${result.project} (${formatDuration(result.projectDuration)})`, color);
        }
    }

    if (CONFIG.saveReport) {
        const reportPath = join(OUTPUT_BASE, 'build-options-test-report.md');
        const report = generateReport(allResults);
        writeFileSync(reportPath, report, 'utf8');
        log(`\nReport saved to: ${reportPath}`, colors.cyan);
    }

    if (failedProjects === 0) {
        log('\n✓ All tests passed!', colors.green);
    } else {
        log('\n✗ Some tests failed!', colors.red);
    }
}

runTest().catch((error) => {
    log(`\n✗ Test failed with error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
});
