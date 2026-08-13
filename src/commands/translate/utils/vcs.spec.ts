import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';

import {resolveVcsDiffFiles} from './vcs';

const dirs: string[] = [];

function makeDir(prefix: string) {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    dirs.push(dir);

    return dir;
}

function makeRepo() {
    const root = makeDir('yfm-vcs-git-');
    git(root, 'init', '-q', '-b', 'main');

    return root;
}

function git(cwd: string, ...args: string[]) {
    execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=test', ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function write(root: string, path: string, content: string) {
    mkdirSync(join(root, dirname(path)), {recursive: true});
    writeFileSync(join(root, path), content);
}

afterEach(() => {
    while (dirs.length) {
        rmSync(dirs.pop() as string, {recursive: true, force: true});
    }
});

describe('resolveVcsDiffFiles', () => {
    describe('git', () => {
        it('collects modified and untracked files', () => {
            const root = makeRepo();
            write(root, 'ru/index.md', 'old');
            git(root, 'add', '.');
            git(root, 'commit', '-qm', 'init');
            write(root, 'ru/index.md', 'new');
            write(root, 'ru/new.md', 'new file');

            const result = resolveVcsDiffFiles(root as AbsolutePath);

            expect(result.sort()).toEqual(['ru/index.md', 'ru/new.md']);
        });

        it('scopes result to input and rebases paths', () => {
            const root = makeRepo();
            write(root, 'docs/ru/index.md', 'old');
            write(root, 'other/readme.md', 'old');
            git(root, 'add', '.');
            git(root, 'commit', '-qm', 'init');
            write(root, 'docs/ru/index.md', 'new');
            write(root, 'other/readme.md', 'new');

            const result = resolveVcsDiffFiles(join(root, 'docs') as AbsolutePath);

            expect(result).toEqual(['ru/index.md']);
        });

        it('computes diff against passed ref', () => {
            const root = makeRepo();
            write(root, 'ru/index.md', 'old');
            git(root, 'add', '.');
            git(root, 'commit', '-qm', 'init');
            write(root, 'ru/index.md', 'new');
            git(root, 'add', '.');
            git(root, 'commit', '-qm', 'change');

            expect(resolveVcsDiffFiles(root as AbsolutePath)).toEqual([]);
            expect(resolveVcsDiffFiles(root as AbsolutePath, 'HEAD~1')).toEqual(['ru/index.md']);
        });

        it('throws when no repository found', () => {
            const dir = makeDir('yfm-vcs-none-');

            expect(() => resolveVcsDiffFiles(dir as AbsolutePath)).toThrow(/git or arc/);
        });
    });

    describe('arc', () => {
        function fakeArc(root: string, {diff = '', untracked = [] as string[]} = {}) {
            const calls: string[][] = [];
            const runner = (cmd: string, args: string[]) => {
                calls.push([cmd, ...args]);

                if (cmd === 'git') {
                    throw new Error('not a git repository');
                }

                if (args[0] === 'root') {
                    return root + '\n';
                }

                if (args[0] === 'diff') {
                    return diff;
                }

                if (args[0] === 'status') {
                    return JSON.stringify({
                        status: {
                            untracked: untracked.map((path) => ({
                                status: 'untracked',
                                type: 'file',
                                path,
                            })),
                        },
                    });
                }

                throw new Error(`Unexpected call: ${cmd} ${args.join(' ')}`);
            };

            return {calls, runner};
        }

        it('falls back to arc and collects diff with untracked files', () => {
            const {runner} = fakeArc('/repo', {
                diff: 'docs/ru/index.md\n',
                untracked: ['docs/ru/new.md'],
            });

            const result = resolveVcsDiffFiles('/repo/docs' as AbsolutePath, undefined, runner);

            expect(result.sort()).toEqual(['ru/index.md', 'ru/new.md']);
        });

        it('passes ref to arc diff', () => {
            const {calls, runner} = fakeArc('/repo');

            resolveVcsDiffFiles('/repo' as AbsolutePath, 'trunk', runner);

            expect(calls).toContainEqual(['arc', 'diff', '--name-only', 'trunk']);
        });
    });
});
