import type {SimpleGitOptions} from 'simple-git';

import {relative} from 'node:path';
import simpleGit from 'simple-git';
import {minimatch} from 'minimatch';

import {normalizePath as _normalizePath} from '@diplodoc/cli/lib/utils';

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

    private root: AbsolutePath;

    constructor(config: GitConfig, root: AbsolutePath) {
        this.config = config;
        this.root = root;
    }

    async createBranchWorktree(baseDir: AbsolutePath, dir: RelativePath, branch: string) {
        const options: Partial<SimpleGitOptions> = {baseDir};
        const origin = this.config.vcs.branch || 'master';
        const cleanup = async () => {
            await safe(simpleGit(options).raw('worktree', 'remove', dir, '-f'));
            await safe(simpleGit(options).raw('branch', '-D', branch));
        };

        try {
            await cleanup();
            await simpleGit(options).raw('worktree', 'add', '-b', branch, dir, origin);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
        }

        return cleanup;
    }

    /**
     * Returns difference between yfm project root and git project root.
     * Roots can be different if docs project is only small part of more complex product.
     */
    async getBase(baseDir: AbsolutePath) {
        const root = await simpleGit({baseDir}).raw('rev-parse', '--show-toplevel');
        return _normalizePath(relative(root.trim(), this.root)) || ('.' as NormalizedPath);
    }

    async getContributors(baseDir: AbsolutePath) {
        const base = await this.getBase(baseDir);
        const ignore = this.config.contributors?.ignore || [];
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
            const skip = shouldBeIgnored(ignore, {email, name});

            followPaths(
                paths,
                contributors,
                (value) => {
                    return skip ? value : (value || []).concat({email, commit});
                },
                base,
            );
        }

        return contributors;
    }

    async getAuthors(baseDir: AbsolutePath) {
        const base = await this.getBase(baseDir);
        const ignore = this.config.authors?.ignore || [];
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
            const skip = shouldBeIgnored(ignore, {email, name});

            followPaths(
                paths,
                authors,
                (value) => {
                    return skip ? value : value || {email, commit};
                },
                base,
            );
        }

        return authors;
    }

    async getMTimes(baseDir: AbsolutePath) {
        const base = await this.getBase(baseDir);
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

            followPaths(lines, mtimes, () => unixtime, base);
        }

        return mtimes;
    }
}

type ShouldAuthorBeIgnoredArgs = {
    email?: string;
    name?: string;
};

function normalizePath(path: RelativePath, base: NormalizedPath) {
    const result = _normalizePath(path);

    if (result.startsWith(base)) {
        return relative(base, path);
    }

    return result;
}

function followPaths<T>(
    lines: string[],
    map: Hash<T>,
    value: (prev: T) => T,
    base: NormalizedPath,
) {
    for (const line of lines) {
        const [status, rawFrom, rawTo] = line.trim().split(/\t/);
        const from = normalizePath((rawFrom || '') as RelativePath, base);
        const to = normalizePath((rawTo || '') as RelativePath, base);

        if (!isUsefullPath(rawFrom) || (rawTo && !isUsefullPath(rawTo))) {
            continue;
        }

        if (!isProjectPath(rawFrom, base) || (rawTo && !isProjectPath(rawTo, base))) {
            continue;
        }

        const val = value(map[from]);

        switch (status[0]) {
            case 'R': {
                if (val) {
                    map[to] = val;
                }
                delete map[from];
                break;
            }
            case 'D': {
                delete map[from];
                break;
            }
            default: {
                if (val) {
                    map[from] = val;
                }
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

function isProjectPath(path: string, base: string) {
    return base === '.' || path.startsWith(base);
}

async function safe(call: Promise<unknown> | undefined) {
    try {
        if (call) {
            await call;
        }
    } catch {}
}
