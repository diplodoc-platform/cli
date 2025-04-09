import type {SimpleGitOptions} from 'simple-git';

import simpleGit from 'simple-git';
import {minimatch} from 'minimatch';
import {normalizePath} from '@diplodoc/cli/lib/utils';

type AuthorInfo = {
    email: string;
    commit: string;
};

export type GitConfig = {
    authors?: {
        ignore: string[];
    };
    contributors?: {
        ignore: string[];
    };
    vcs: {
        branch?: string;
        initialCommit: string;
    };
};

export class GitClient {
    private config: GitConfig;

    constructor(config: GitConfig) {
        this.config = config;
    }

    async createMasterWorktree(baseDir: AbsolutePath, dir: RelativePath, branch: string) {
        const options: Partial<SimpleGitOptions> = {baseDir};
        const origin = this.config.vcs.branch || 'master';

        // TODO: this is cloud specific. We need extract this to isolated extension
        try {
            await simpleGit(options).raw('worktree', 'add', '-b', branch, dir, origin);
        } catch {}

        return async () => {
            await simpleGit(options).raw('worktree', 'remove', dir);
            await simpleGit(options).raw('branch', '-d', branch);
        };
    }

    async getContributors(baseDir: AbsolutePath) {
        const contributors: Record<NormalizedPath, AuthorInfo[]> = {};
        const log = await simpleGit({baseDir}).raw(
            'log',
            this.config.vcs.initialCommit
                ? `${this.config.vcs.initialCommit}..HEAD`
                : '--before=now',
            '--reverse',
            '--diff-filter=ADMR',
            '--pretty=format:%ae;%an;%H',
            '--name-status',
        );
        const parts = log.split(/\r?\n\r?\n/).filter(Boolean);

        for (const part of parts) {
            const [userData, ...paths] = part.trim().split(/\r?\n/);
            const [email, name, commit] = userData.split(';');

            followPaths(paths, contributors, (value) => {
                if (shouldBeIgnored(this.config.contributors?.ignore || [], {email, name})) {
                    return value;
                }

                return (value || []).concat({email, commit});
            });
        }

        return contributors;
    }

    async getAuthors(baseDir: AbsolutePath) {
        const authors: Record<NormalizedPath, AuthorInfo> = {};
        const log = await simpleGit({baseDir}).raw(
            'log',
            this.config.vcs.initialCommit
                ? `${this.config.vcs.initialCommit}..HEAD`
                : '--before=now',
            '--reverse',
            '--diff-filter=ADR',
            '--pretty=format:%ae;%an;%H',
            '--name-status',
        );
        const parts = log.split(/\r?\n\r?\n/).filter(Boolean);

        for (const part of parts) {
            const [userData, ...paths] = part.trim().split(/\r?\n/);
            const [email, name, commit] = userData.split(';');

            followPaths(paths, authors, (value) => {
                if (shouldBeIgnored(this.config.authors?.ignore || [], {email, name})) {
                    return value;
                }

                return value || {email, commit};
            });
        }

        return authors;
    }

    async getMTimes(baseDir: AbsolutePath) {
        const mtimes: Record<NormalizedPath, number> = {};

        const log = await simpleGit({baseDir}).raw(
            'log',
            '--reverse',
            '--before=now',
            '--diff-filter=ADMR',
            '--pretty=format:%ct',
            '--name-status',
        );

        const parts = log.split(/\r?\n\r?\n/).filter(Boolean);

        for (const part of parts) {
            const [date, ...lines] = part.trim().split(/\r?\n/);
            const unixtime = Number(date);

            followPaths(lines, mtimes, () => unixtime);
        }

        return mtimes;
    }
}

type ShouldAuthorBeIgnoredArgs = {
    email?: string;
    name?: string;
};

function followPaths<T>(lines: string[], map: Hash<T>, value: (prev: T) => T) {
    for (const line of lines) {
        const [status, rawFrom, rawTo] = line.trim().split(/\t/);
        const from = normalizePath((rawFrom || '') as RelativePath);
        const to = normalizePath((rawTo || '') as RelativePath);

        if (!isUsefullPath(rawFrom) || (rawTo && !isUsefullPath(rawTo))) {
            continue;
        }

        switch (status[0]) {
            case 'R': {
                map[to] = value(map[from]);
                delete map[from];
                break;
            }
            case 'D': {
                delete map[from];
                break;
            }
            default: {
                map[from] = value(map[from]);
            }
        }
    }
}

function shouldBeIgnored(ignore: string[], {email, name}: ShouldAuthorBeIgnoredArgs) {
    if (!(email || name)) {
        return false;
    }

    if (!ignore.length) {
        return false;
    }

    for (const pattern of ignore) {
        if (email && minimatch(email, pattern)) {
            return true;
        }

        if (name && minimatch(name, pattern)) {
            return true;
        }
    }

    return false;
}

function isUsefullPath(path: string) {
    return path && (path.endsWith('.md') || path.endsWith('.yaml'));
}
