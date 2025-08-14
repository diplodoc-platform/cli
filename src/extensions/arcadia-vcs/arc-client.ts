import {relative} from 'node:path';
import {execa} from 'execa';
import {minimatch} from 'minimatch';
import {memoize, normalizePath} from '@diplodoc/cli/lib/utils';

import type {LogConfig} from './types';

export interface AuthorInfo {
    login: string;
    commit: string;
}

export class ArcClient {
    private config: LogConfig;

    private root: AbsolutePath;

    constructor(config: LogConfig, root: AbsolutePath) {
        this.config = config;
        this.root = root;
    }

    @memoize()
    async getBase() {
        const root = await arc('root');
        return normalizePath(relative(root, this.root)) || ('.' as NormalizedPath);
    }

    async getContributors() {
        const base = await this.getBase();
        const scopes = [base, ...(this.config.vcs.scopes || [])].map(normalizePath);
        const handled = new Set<string>();

        const result: Record<string, AuthorInfo[]> = {};

        for (const scope of scopes) {
            const commits = await this.parse(await this.log(scope));
            const ignore = this.config.contributors?.ignore || [];

            for (const commit of commits) {
                const skip = shouldBeIgnored(ignore, commit) || handled.has(commit.sha);
                handled.add(commit.sha);

                followPaths(
                    commit.paths,
                    result,
                    (prev) => {
                        return skip
                            ? prev
                            : (prev || []).concat({login: commit.login, commit: commit.sha});
                    },
                    {
                        include: new Set(['A', 'D', 'M', 'R']),
                    },
                );
            }
        }

        return result;
    }

    async getAuthors(): Promise<Record<string, {login: string; commit: string}>> {
        const base = await this.getBase();
        const scopes = [base, ...(this.config.vcs.scopes || [])].map(normalizePath);
        const handled = new Set<string>();

        const authors: Record<string, {login: string; commit: string}> = {};

        for (const scope of scopes) {
            const commits = await this.parse(await this.log(scope));

            const ignore = this.config.authors?.ignore || [];

            for (const commit of commits) {
                const skip =
                    shouldBeIgnored(ignore, {login: commit.login}) || handled.has(commit.sha);
                handled.add(commit.sha);

                followPaths(
                    commit.paths,
                    authors,
                    () => (skip ? undefined : {login: commit.login, commit: commit.sha}),
                    {include: new Set(['A', 'D', 'R'])},
                );
            }
        }

        return authors;
    }

    async getMTimes() {
        const base = await this.getBase();
        const scopes = [base, ...(this.config.vcs.scopes || [])].map(normalizePath);

        const result: Record<string, number> = {};

        for (const scope of scopes) {
            const commits = await this.parse(await this.log(scope));

            for (const commit of commits) {
                const unixtime = commit.unixtime;
                followPaths(commit.paths, result, () => unixtime, {
                    include: new Set(['A', 'D', 'M', 'R']),
                });
            }
        }

        return result;
    }

    private async parse(content: string) {
        const lines = content.split(/\r?\n/);

        type Commit = {sha: string; login: string; unixtime: number; paths: string[]};
        const commits: Commit[] = [];
        let currentCommit: Commit | null = null;
        let state: 'header' | 'message' | 'paths' = 'header';

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];

            if (line.startsWith('commit ')) {
                if (currentCommit) {
                    commits.push(currentCommit);
                }
                currentCommit = {
                    sha: line.slice(7).trim(),
                    login: '',
                    unixtime: 0,
                    paths: [],
                };
                state = 'header';
                continue;
            }

            if (!currentCommit) {
                continue;
            }

            if (state === 'header') {
                if (line.startsWith('author:')) {
                    currentCommit.login = line.slice('author:'.length).trim();
                } else if (line.startsWith('date:')) {
                    const iso = line.slice('date:'.length).trim();
                    const timestamp = Date.parse(iso);
                    currentCommit.unixtime = Math.floor(timestamp / 1000) || 0;
                } else if (line.trim() === '') {
                    state = 'message';
                }
                continue;
            }

            if (state === 'message') {
                // Switch to paths block on first status line like "<LETTER> <spaces> path"
                if (/^[ADMRT]\s+/.test(line)) {
                    state = 'paths';
                    // Don't continue, allow processing this line as a path
                } else {
                    continue;
                }
            }

            if (state === 'paths') {
                if (/^(commit\s)/.test(line)) {
                    // Next commit started
                    lineIndex--; // Reprocess this line as commit start on next iteration
                    state = 'header';
                    continue;
                }

                if (!line.trim()) {
                    continue;
                }

                // Lines like: "M   path" or "R   from   to" with multiple spaces or tabs
                if (/^[ADMRT](\s+)/.test(line)) {
                    currentCommit.paths.push(line);
                }
            }
        }

        if (currentCommit) {
            commits.push(currentCommit);
        }

        // Optionally trim by initialCommit: process commits from newest to oldest and stop at initialCommit (inclusive)
        if (this.config.vcs.initialCommit) {
            const commitIndex = commits.findIndex((commit) =>
                commit.sha.startsWith(this.config.vcs.initialCommit!),
            );
            if (commitIndex !== -1) {
                // Keep only commits from start to initialCommit (inclusive)
                // Log already goes from newest to oldest, so take from 0 to idx+1
                commits.splice(commitIndex + 1);
            }
        }

        // Convert to order from oldest to newest so the latest state is current
        commits.reverse();
        return commits;
    }

    private async lastCommit() {
        const record = await arc('log', '-n1', '--oneline');
        const [commit] = record.split(' ');
        return commit;
    }

    private async log(scope: RelativePath): Promise<string> {
        const filter: string[] = [scope];
        if (this.config.vcs.initialCommit) {
            filter.unshift(`${await this.lastCommit()}..${this.config.vcs.initialCommit}`);
        }
        return arc('log', '--name-status', ...filter);
    }
}

//

async function arc(...args: string[]) {
    const {stdout, stderr} = await execa('arc', args, {
        cwd: (await execa('arc', ['root'])).stdout,
        buffer: true,
        maxBuffer: 1024 * 1024 * 64,
    });

    if (stderr) {
        throw new Error(stderr);
    }

    return stdout || '';
}

function followPaths<T>(
    lines: string[],
    map: Record<string, T>,
    value: (prev: T) => T,
    opts?: {include?: Set<string>},
) {
    for (const rawLine of lines) {
        const line = rawLine.trim();
        // support both tabs and spaces between columns
        // groups: 1) status, 2) from, 3) to (opt.)
        const match = line.match(/^([ADMRT])\s+([^\s]+)(?:\s+([^\s]+))?$/);
        if (!match) {
            continue;
        }
        const status = match[1];
        const rawFrom = match[2];
        const rawTo = match[3];
        const from = normalizePath((rawFrom || '') as string);
        const to = normalizePath((rawTo || '') as string);

        if (!isUsefullPath(rawFrom) || (rawTo && !isUsefullPath(rawTo))) {
            continue;
        }

        if (opts?.include && !opts.include.has(status)) {
            continue;
        }

        if (status === 'R') {
            const val = value(map[from]);
            if (val) {
                map[to] = val;
            }
            delete map[from];
        } else if (status === 'D') {
            delete map[from];
        } else {
            const val = value(map[from]);
            if (val) {
                map[from] = val;
            }
        }
    }
}

function isUsefullPath(path: string) {
    return path && (path.endsWith('.md') || path.endsWith('.yaml'));
}

type ShouldAuthorBeIgnoredArgs = {
    login?: string;
};

function shouldBeIgnored(ignore: string[], {login}: ShouldAuthorBeIgnoredArgs) {
    if (!login) {
        return false;
    }

    if (!ignore.length) {
        return false;
    }

    for (const pattern of ignore) {
        if (minimatch(login, pattern)) {
            return true;
        }
    }

    return false;
}
