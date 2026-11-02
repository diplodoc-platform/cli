/* eslint-disable no-console */
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {randomUUID} = require('node:crypto');
const {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {setTimeout: sleep} = require('node:timers/promises');

const PACKAGE = '@diplodoc/cli';

/**
 * Accept only an exact stable version, never a tag, range or install option.
 * @param {string} value - Requested version.
 * @returns {string} Validated version.
 */
function stableVersion(value) {
    assert.match(value || '', /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    assert.equal(value, value.trim());
    return value;
}

/**
 * Resolve the version from the publishing SHA, including manual stable releases.
 * @param {object} options - GitHub API client and Actions context.
 * @returns {Promise<object|null>} Published version and source, or a skipped publication.
 */
async function resolveRelease({github, context}) {
    if (context.eventName === 'workflow_dispatch') {
        return {version: stableVersion(context.payload.inputs.version), source: ''};
    }

    const run = context.payload.workflow_run;
    if (
        run.conclusion !== 'success' ||
        run.head_repository?.full_name !== `${context.repo.owner}/${context.repo.repo}`
    ) {
        return null;
    }

    // workflow_dispatch inputs are absent from workflow_run. Inspect this
    // attempt's steps to distinguish stable publish from prerelease/deprecate.
    const jobs = await github.paginate(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt_number}/jobs',
        {...context.repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100},
    );
    const published = jobs.some((job) =>
        job.steps?.some(
            (step) => step.name === 'Publish stable to npm' && step.conclusion === 'success',
        ),
    );
    if (!published) {
        return null;
    }

    const {data} = await github.rest.repos.getContent({
        ...context.repo,
        path: 'package.json',
        ref: run.head_sha,
    });
    const manifest = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
    assert.equal(manifest.name, PACKAGE);
    return {version: stableVersion(manifest.version), source: run.html_url};
}

/**
 * Registry propagation and transport failures may recover without a new release.
 * @param {object} error - Failed npm process with captured output.
 * @returns {boolean} Whether another installation attempt is useful.
 */
function retryableInstall(error) {
    const output = `${error.stdout || ''}\n${error.stderr || ''}`;
    return /\b(E404|ETARGET|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENETUNREACH|E502|E503|E504)\b/.test(
        output,
    );
}

/**
 * Install as a clean consumer and start the installed binary, without a build.
 * @param {string} version - Exact stable version to install.
 * @param {object} [options] - Process and delay adapters for tests.
 * @returns {Promise<void>} Resolves after successful installation and startup.
 */
async function verifyRelease(version, {execute = execFileSync, delay = sleep} = {}) {
    stableVersion(version);
    const directory = mkdtempSync(join(tmpdir(), 'cli-npm-release-'));
    // Keep lifecycle scripts enabled, but do not pass runner tokens or npmrc files.
    const env = {
        PATH: process.env.PATH,
        HOME: join(directory, 'home'),
        CI: 'true',
        npm_config_cache: join(directory, 'cache'),
        npm_config_userconfig: join(directory, 'npmrc'),
        npm_config_registry: 'https://registry.npmjs.org',
        npm_config_fetch_retries: '1',
        npm_config_fetch_timeout: '30000',
    };
    mkdirSync(env.HOME);
    writeFileSync(env.npm_config_userconfig, '');
    // Treat all npm/lifecycle output as log text, not GitHub workflow commands.
    const logToken = randomUUID();
    console.log(`::stop-commands::${logToken}`);
    try {
        for (let attempt = 1; attempt <= 3; attempt++) {
            const consumer = join(directory, `consumer-${attempt}`);
            mkdirSync(consumer);
            writeFileSync(join(consumer, 'package.json'), '{"private":true}');
            console.log(`Installing ${PACKAGE}@${version} (attempt ${attempt}/3)`);
            try {
                const output = execute(
                    'npm',
                    ['install', `${PACKAGE}@${version}`, '--no-audit', '--no-fund'],
                    {
                        cwd: consumer,
                        env,
                        encoding: 'utf8',
                        timeout: 180000,
                        maxBuffer: 10 * 1024 * 1024,
                    },
                );
                console.log(output);
            } catch (error) {
                console.error(String(error.stdout || ''), String(error.stderr || ''));
                if (attempt === 3 || !retryableInstall(error)) {
                    throw error;
                }
                await delay(attempt * 15000);
                continue;
            }

            const manifest = JSON.parse(
                readFileSync(join(consumer, 'node_modules', PACKAGE, 'package.json'), 'utf8'),
            );
            assert.equal(
                manifest.version,
                version,
                'Installed CLI version differs from the release',
            );
            console.log(
                execute(join(consumer, 'node_modules/.bin/yfm'), ['--version'], {
                    cwd: consumer,
                    env,
                    encoding: 'utf8',
                    timeout: 30000,
                }),
            );
            return;
        }
    } finally {
        console.log(`::${logToken}::`);
        rmSync(directory, {recursive: true, force: true});
    }
}

/**
 * Keep one bot-owned issue per version; successful rechecks close that issue.
 * @param {object} options - API client, Actions context and verification result.
 * @returns {Promise<void>} Resolves after recording the result, or skipping a stale result.
 */
async function reportRelease({github, context, version, source, result, attempt, started}) {
    stableVersion(version);
    assert.ok(['success', 'failure'].includes(result));
    assert.ok(Number.isSafeInteger(started) && started > 0);
    const marker = `<!-- npm-release-check:${version} -->`;
    const issues = await github.paginate(github.rest.issues.listForRepo, {
        ...context.repo,
        state: 'all',
        creator: 'github-actions[bot]',
        per_page: 100,
    });
    const issue = issues.find(
        (item) =>
            !item.pull_request &&
            item.user?.login === 'github-actions[bot]' &&
            item.body?.includes(marker),
    );
    if (!issue && result === 'success') {
        return;
    }

    // A slower, older run must not overwrite the result of a newer recheck.
    // Use the check's start time: re-running an old workflow keeps its run ID.
    const previous = issue?.body?.match(/<!-- npm-release-check-started:(\d+) -->/);
    if (previous && Number(previous[1]) > started) {
        return;
    }
    const base = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}`;
    const checkUrl = `${base}/actions/runs/${context.runId}/attempts/${attempt}`;
    const body = [
        marker,
        `<!-- npm-release-check-started:${started} -->`,
        `Published package: **${PACKAGE}@${version}**`,
        '',
        result === 'success'
            ? 'The same version installed successfully and `yfm --version` completed on recheck.'
            : 'The background installation/startup check failed. Inspect the log to distinguish a package failure from registry or runner errors.',
        '',
        `[Verification log](${checkUrl})`,
        source
            ? `[Publication workflow](${source})`
            : 'Source: manual verification of an exact version.',
        '',
        'Environment: Ubuntu, Node.js 24, a clean consumer directory, public npm registry.',
        'The release and release train are not blocked by this check.',
        '',
        `To recheck, run [Verify published CLI](${base}/actions/workflows/verify-npm-release.yml) with version \`${version}\`. A successful recheck closes this issue automatically.`,
    ].join('\n');

    if (!issue) {
        await github.rest.issues.create({
            ...context.repo,
            title: `CLI ${version}: npm installation/startup check failed`,
            body,
        });
        return;
    }
    await github.rest.issues.update({
        ...context.repo,
        issue_number: issue.number,
        body,
        state: result === 'success' ? 'closed' : 'open',
        state_reason: result === 'success' ? 'completed' : 'reopened',
    });
}

module.exports = {stableVersion, resolveRelease, retryableInstall, verifyRelease, reportRelease};

if (require.main === module) {
    verifyRelease(process.argv[2]).catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
