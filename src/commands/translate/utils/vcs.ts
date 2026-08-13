import {execFileSync} from 'node:child_process';
import {realpathSync} from 'node:fs';
import {isAbsolute, relative, resolve} from 'node:path';

import {normalizePath} from '~/core/utils';

export type VcsRunner = (cmd: string, args: string[], cwd: string) => string;

type VcsInfo = {
    type: 'git' | 'arc';
    root: AbsolutePath;
};

type ArcStatusEntry = {
    type?: string;
    path?: string;
};

const run: VcsRunner = (cmd, args, cwd) => {
    try {
        return execFileSync(cmd, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
    } catch (error) {
        const stderr = (error as {stderr?: string}).stderr;
        if (stderr) {
            (error as Error).message += '\n' + stderr.toString().trim();
        }

        throw error;
    }
};

function lines(output: string) {
    return output
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
}

function detectVcs(input: AbsolutePath, runner: VcsRunner): VcsInfo {
    try {
        const root = runner('git', ['rev-parse', '--show-toplevel'], input).trim();

        return {type: 'git', root: root as AbsolutePath};
    } catch {
        // Not a git repository, try arc below.
    }

    try {
        const root = runner('arc', ['root'], input).trim();

        return {type: 'arc', root: root as AbsolutePath};
    } catch {
        // Not an arc repository either.
    }

    throw new Error(`Unable to find git or arc repository for ${input}.`);
}

function gitChangedFiles(root: AbsolutePath, ref: string, runner: VcsRunner) {
    const quotepath = ['-c', 'core.quotepath=false'];
    const diff = runner('git', [...quotepath, 'diff', '--name-only', ref], root);
    const untracked = runner(
        'git',
        [...quotepath, 'ls-files', '--others', '--exclude-standard'],
        root,
    );

    return lines(diff).concat(lines(untracked));
}

/**
 * Arc silently returns an empty diff for git range syntax (a..b, a...b),
 * but supports the same semantics with positional commits:
 * `arc diff a b` and `arc diff -B a b` (merge-base).
 * Expand git-style ranges so the same ref value works for both VCS.
 * An open-ended side of a range means HEAD, as in git.
 */
function arcDiffArgs(ref: string) {
    for (const [separator, extra] of [
        ['...', ['-B']],
        ['..', []],
    ] as [string, string[]][]) {
        const parts = ref.split(separator);

        if (parts.length === 2) {
            return [...extra, ...parts.map((part) => part || 'HEAD')];
        }
    }

    return [ref];
}

function arcChangedFiles(root: AbsolutePath, ref: string, runner: VcsRunner) {
    const diff = runner('arc', ['diff', '--name-only', ...arcDiffArgs(ref)], root);
    const status = JSON.parse(runner('arc', ['status', '--json'], root));
    const untracked = ((status?.status?.untracked || []) as ArcStatusEntry[])
        .filter((entry) => entry.type === 'file' && entry.path)
        .map((entry) => entry.path as string);

    return lines(diff).concat(untracked);
}

function toRealPath(path: string): AbsolutePath {
    // On Windows git may report the repository root with 8.3 short names
    // (C:/Users/RUNNER~1/...), while the input path is expanded.
    // realpathSync.native resolves both short names and symlinks,
    // so both paths land in the same form and can be safely rebased.
    for (const resolver of [realpathSync.native, realpathSync]) {
        try {
            return resolver(path) as AbsolutePath;
        } catch {
            // Path may not exist - try the next resolver.
        }
    }

    return resolve(path) as AbsolutePath;
}

/**
 * Returns files changed in the current VCS working copy (git or arc),
 * relative to the input directory.
 *
 * Diff is computed against `ref` (HEAD by default).
 * Untracked files are always included.
 * Files outside the input directory are dropped.
 * Deleted files are not filtered here - they are naturally skipped later,
 * when the result is matched against really existing project files.
 */
export function resolveVcsDiffFiles(
    input: AbsolutePath,
    ref = 'HEAD',
    runner: VcsRunner = run,
): NormalizedPath[] {
    const {type, root} = detectVcs(input, runner);
    const files =
        type === 'git' ? gitChangedFiles(root, ref, runner) : arcChangedFiles(root, ref, runner);
    const scope = toRealPath(input);
    const base = toRealPath(root);

    const scoped = files
        .map((file) => relative(scope, resolve(base, file)))
        .filter((file) => file && !file.startsWith('..') && !isAbsolute(file))
        .map((file) => normalizePath(file as RelativePath));

    return [...new Set(scoped)];
}
