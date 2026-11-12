import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {load} from 'js-yaml';
import {describe, expect, it} from 'vitest';

type Step = {name?: string; run?: string};
type Workflow = {jobs: {verify: {steps: Step[]}}};

const workflow = load(
    readFileSync(join(process.cwd(), '.github/workflows/verify-npm-release.yml'), 'utf8'),
) as Workflow;

function runSteps(names: string[], overrides: Record<string, string> = {}) {
    const directory = mkdtempSync(join(tmpdir(), 'verify-npm-release-'));
    const scripts = names.map((name) => {
        const step = workflow.jobs.verify.steps.find((candidate) => candidate.name === name);
        if (!step?.run) {
            throw new Error(`Missing workflow script: ${name}`);
        }
        return step.run;
    });
    try {
        return spawnSync(
            'bash',
            [
                '-c',
                `
                npm() {
                    echo "npm:$*" >&2
                    if [[ "$1" == view ]]; then
                        if ((SECONDS < MOCK_READY_AFTER)); then return 1; fi
                        echo "$MOCK_VISIBLE_VERSION"
                        return 0
                    fi
                    if ((MOCK_INSTALL_EXIT != 0)); then return "$MOCK_INSTALL_EXIT"; fi
                    mkdir -p node_modules/.bin
                    printf '#!/usr/bin/env bash\nexit %s\n' "$MOCK_START_EXIT" > node_modules/.bin/yfm
                    chmod +x node_modules/.bin/yfm
                }
                sleep() { echo "sleep:$1"; SECONDS=$((SECONDS + $1)); }
                mktemp() { command mktemp -d "$MOCK_DIRECTORY/install.XXXXXX"; }
                SECONDS=0
                ${scripts.join('\n')}
                `,
            ],
            {
                cwd: directory,
                env: {
                    ...process.env,
                    CLI_VERSION: '5.67.0',
                    MOCK_VISIBLE_VERSION: '5.67.0',
                    MOCK_READY_AFTER: '0',
                    MOCK_INSTALL_EXIT: '0',
                    MOCK_START_EXIT: '0',
                    MOCK_DIRECTORY: directory,
                    ...overrides,
                },
                encoding: 'utf8',
                timeout: 10000,
            },
        );
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
}

const availability = 'Wait for published CLI availability';
const installation = 'Install and start published CLI';

describe.skipIf(process.platform === 'win32')('published CLI verification shell scripts', () => {
    it('installs immediately when the exact version is available', () => {
        const result = runSteps([availability, installation]);
        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain('sleep:');
        expect(result.stderr).toContain('npm:view @diplodoc/cli@5.67.0 version --prefer-online');
        expect(result.stderr).toContain('npm:install @diplodoc/cli@5.67.0 --prefer-online');
    });

    it('waits through a fourteen-minute scan before installing', () => {
        const result = runSteps([availability, installation], {MOCK_READY_AFTER: '840'});
        expect(result.status).toBe(0);
        expect(result.stdout.match(/sleep:30/g)).toHaveLength(28);
        expect(result.stderr).toContain('npm:install @diplodoc/cli@5.67.0');
    });

    it.each<Record<string, string>>([{MOCK_READY_AFTER: '1201'}, {MOCK_VISIBLE_VERSION: '5.66.1'}])(
        'fails after twenty minutes without installing an unavailable exact version: %j',
        (overrides) => {
            const result = runSteps([availability, installation], overrides);
            expect(result.status).toBe(1);
            expect(result.stdout.match(/sleep:30/g)).toHaveLength(40);
            expect(result.stdout).toContain(
                'did not become available in public npm within 20 minutes',
            );
            expect(result.stderr).not.toContain('npm:install');
        },
    );

    it('still fails after three unsuccessful installation attempts', () => {
        const result = runSteps([availability, installation], {MOCK_INSTALL_EXIT: '1'});
        expect(result.status).toBe(1);
        expect(result.stderr.match(/npm:install/g)).toHaveLength(3);
    });

    it('fails immediately when the installed CLI cannot start', () => {
        const result = runSteps([availability, installation], {MOCK_START_EXIT: '7'});
        expect(result.status).toBe(7);
        expect(result.stderr.match(/npm:install/g)).toHaveLength(1);
    });
});
