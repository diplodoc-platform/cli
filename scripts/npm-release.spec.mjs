import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';

import release from './npm-release.cjs';

const {stableVersion, resolveRelease, verifyRelease, reportRelease} = release;
const repo = {owner: 'diplodoc-platform', repo: 'cli'};
const version = '5.64.1';

function api() {
    return {
        paginate: vi.fn().mockResolvedValue([]),
        rest: {
            repos: {
                getContent: vi.fn().mockResolvedValue({
                    data: {
                        content: Buffer.from(
                            JSON.stringify({name: '@diplodoc/cli', version}),
                        ).toString('base64'),
                    },
                }),
            },
            issues: {listForRepo: vi.fn(), create: vi.fn(), update: vi.fn()},
        },
    };
}

function publication() {
    return {
        repo,
        eventName: 'workflow_run',
        payload: {
            workflow_run: {
                id: 42,
                run_attempt: 2,
                conclusion: 'success',
                head_sha: 'publication-sha',
                head_repository: {full_name: 'diplodoc-platform/cli'},
                html_url: 'https://github.com/diplodoc-platform/cli/actions/runs/42',
            },
        },
    };
}

describe('published CLI version', () => {
    it.each(['latest', '^5.0.0', '5.1.0-rc.1', '--ignore-scripts', '01.2.3', '5.1.0\n'])(
        'rejects non-stable or ambiguous version %j',
        (value) => expect(() => stableVersion(value)).toThrow(),
    );

    it('uses the exact publishing SHA and current run attempt', async () => {
        const github = api();
        github.paginate.mockResolvedValue([
            {steps: [{name: 'Publish stable to npm', conclusion: 'success'}]},
        ]);
        const resolved = await resolveRelease({github, context: publication()});
        expect(resolved.version).toBe(version);
        expect(github.paginate.mock.calls[0][1]).toMatchObject({run_id: 42, attempt_number: 2});
        expect(github.rest.repos.getContent).toHaveBeenCalledWith({
            ...repo,
            path: 'package.json',
            ref: 'publication-sha',
        });
    });

    it.each(['Publish prerelease to npm', 'Deprecate version'])(
        'skips %s even though the Release workflow succeeded',
        async (name) => {
            const github = api();
            github.paginate.mockResolvedValue([
                {
                    steps: [
                        {name, conclusion: 'success'},
                        {name: 'Publish stable to npm', conclusion: 'skipped'},
                    ],
                },
            ]);
            expect(await resolveRelease({github, context: publication()})).toBeNull();
            expect(github.rest.repos.getContent).not.toHaveBeenCalled();
        },
    );

    it('skips a failed publication', async () => {
        const context = publication();
        context.payload.workflow_run.conclusion = 'failure';
        const github = api();
        expect(await resolveRelease({github, context})).toBeNull();
        expect(github.paginate).not.toHaveBeenCalled();
    });

    it('supports manual rechecks without looking up latest', async () => {
        const github = api();
        expect(
            await resolveRelease({
                github,
                context: {
                    eventName: 'workflow_dispatch',
                    payload: {inputs: {version}},
                },
            }),
        ).toEqual({version, source: ''});
        expect(github.paginate).not.toHaveBeenCalled();
    });
});

describe('clean installation', () => {
    function installed(command, args, options) {
        if (command === 'npm') {
            const packageDir = join(options.cwd, 'node_modules/@diplodoc/cli');
            mkdirSync(packageDir, {recursive: true});
            writeFileSync(join(packageDir, 'package.json'), JSON.stringify({version}));
        }
        return version;
    }

    it('installs an exact version, starts the installed binary and removes the fixture', async () => {
        const execute = vi.fn(installed);
        await verifyRelease(version, {execute});
        const [command, args, options] = execute.mock.calls[0];
        expect(command).toBe('npm');
        expect(args).toEqual(['install', `@diplodoc/cli@${version}`, '--no-audit', '--no-fund']);
        expect(options.env.GITHUB_TOKEN).toBeUndefined();
        expect(options.env.GITHUB_ENV).toBeUndefined();
        expect(execute.mock.calls[1][0]).toBe(join(options.cwd, 'node_modules/.bin/yfm'));
        expect(execute.mock.calls[1][1]).toEqual(['--version']);
        expect(existsSync(options.cwd)).toBe(false);
    });

    it('retries registry propagation in a fresh consumer directory', async () => {
        const execute = vi.fn(installed).mockImplementationOnce(() => {
            throw Object.assign(new Error('not propagated'), {stderr: 'npm error code E404'});
        });
        const delay = vi.fn();
        await verifyRelease(version, {execute, delay});
        expect(delay).toHaveBeenCalledWith(15000);
        expect(execute.mock.calls[0][2].cwd).not.toBe(execute.mock.calls[1][2].cwd);
    });

    it('bounds transient retries', async () => {
        const execute = vi.fn(() => {
            throw Object.assign(new Error('offline'), {stderr: 'npm error code ETIMEDOUT'});
        });
        await expect(verifyRelease(version, {execute, delay: vi.fn()})).rejects.toThrow('offline');
        expect(execute).toHaveBeenCalledTimes(3);
    });

    it('does not retry deterministic dependency failures', async () => {
        const execute = vi.fn(() => {
            throw Object.assign(new Error('peer conflict'), {stderr: 'npm error code ERESOLVE'});
        });
        await expect(verifyRelease(version, {execute})).rejects.toThrow('peer conflict');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('fails if the installed CLI cannot start', async () => {
        const execute = vi
            .fn(installed)
            .mockImplementationOnce(installed)
            .mockImplementationOnce(() => {
                throw new Error('MODULE_NOT_FOUND');
            });
        await expect(verifyRelease(version, {execute})).rejects.toThrow('MODULE_NOT_FOUND');
        expect(execute).toHaveBeenCalledTimes(2);
    });
});

describe('release issues', () => {
    const context = {repo, runId: 100, serverUrl: 'https://github.com'};
    const options = {context, version, result: 'failure', source: '', attempt: 1, started: 200};
    function existing(overrides = {}) {
        return {
            number: 12,
            state: 'open',
            user: {login: 'github-actions[bot]'},
            body: `<!-- npm-release-check:${version} -->`,
            ...overrides,
        };
    }

    it('creates an issue on failure and stays silent on initial success', async () => {
        const github = api();
        await reportRelease({...options, github, result: 'success'});
        expect(github.rest.issues.create).not.toHaveBeenCalled();
        await reportRelease({...options, github});
        expect(github.rest.issues.create).toHaveBeenCalledWith(
            expect.objectContaining({
                title: `CLI ${version}: npm installation/startup check failed`,
                body: expect.stringContaining('/actions/runs/100/attempts/1'),
            }),
        );
    });

    it('updates repeated failures without creating duplicate issues or comments', async () => {
        const github = api();
        github.paginate.mockResolvedValue([existing()]);
        await reportRelease({...options, github});
        expect(github.rest.issues.create).not.toHaveBeenCalled();
        expect(github.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({issue_number: 12, state: 'open'}),
        );
    });

    it('closes only the issue for the successfully rechecked version', async () => {
        const github = api();
        github.paginate.mockResolvedValue([
            existing({number: 11, body: '<!-- npm-release-check:5.64.0 -->'}),
            existing(),
        ]);
        await reportRelease({...options, github, result: 'success'});
        expect(github.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({issue_number: 12, state: 'closed'}),
        );
    });

    it('reopens the same issue on a new failure', async () => {
        const github = api();
        github.paginate.mockResolvedValue([existing({state: 'closed'})]);
        await reportRelease({...options, github});
        expect(github.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({state: 'open', state_reason: 'reopened'}),
        );
        expect(github.rest.issues.create).not.toHaveBeenCalled();
    });

    it('ignores a result older than the latest recorded check', async () => {
        const github = api();
        github.paginate.mockResolvedValue([
            existing({body: `${existing().body}\n<!-- npm-release-check-started:300 -->`}),
        ]);
        await reportRelease({...options, github});
        expect(github.rest.issues.update).not.toHaveBeenCalled();
    });

    it('allows a fresh recheck even when re-running an older workflow ID', async () => {
        const github = api();
        github.paginate.mockResolvedValue([
            existing({body: `${existing().body}\n<!-- npm-release-check-started:100 -->`}),
        ]);
        await reportRelease({
            ...options,
            github,
            context: {...context, runId: 50},
            result: 'success',
        });
        expect(github.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({issue_number: 12, state: 'closed'}),
        );
    });

    it('does not edit human-authored issues containing the marker', async () => {
        const github = api();
        github.paginate.mockResolvedValue([existing({user: {login: 'human'}})]);
        await reportRelease({...options, github});
        expect(github.rest.issues.update).not.toHaveBeenCalled();
        expect(github.rest.issues.create).toHaveBeenCalled();
    });
});
