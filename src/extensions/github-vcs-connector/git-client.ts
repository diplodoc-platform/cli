import type {SimpleGitOptions} from 'simple-git';

import simpleGit from 'simple-git';
import {minimatch} from 'minimatch';
import {normalizePath} from '@diplodoc/cli/lib/utils';

export type GitConfig = {
    ignoreAuthorPatterns: string[];
    vcs: {
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

        try {
            await simpleGit(options).raw('worktree', 'add', '-b', branch, dir, 'origin/master');
        } catch {}

        return async () => {
            await simpleGit(options).raw('worktree', 'remove', dir);
            await simpleGit(options).raw('branch', '-d', branch);
        };
    }

    async getContributors(baseDir: AbsolutePath) {
        const contributors: Record<NormalizedPath, string[]> = {};
        const log = await simpleGit({baseDir}).raw(
            'log',
            `${this.config.vcs.initialCommit}..HEAD`,
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        );
        const parts = log.split(/\r?\n\r?\n/).filter(Boolean);

        for (const part of parts) {
            const [userData, ...rawPaths] = part.trim().split(/\r?\n/);
            const [email, name, hashCommit] = userData.split(';');

            if (shouldBeIgnored(this.config, {email, name})) {
                continue;
            }

            const paths = (rawPaths as RelativePath[]).filter(isUsefullPath).map(normalizePath);
            for (const path of paths) {
                contributors[path] = (contributors[path] || []).concat(hashCommit);
            }
        }

        return contributors;
    }

    async getAuthors(baseDir: AbsolutePath) {
        const authors: Record<NormalizedPath, string> = {};
        const log = await simpleGit({baseDir}).raw(
            'log',
            `${this.config.vcs.initialCommit}..HEAD`,
            '--diff-filter=A',
            '--pretty=format:%ae;%an;%H',
            '--name-only',
        );
        const parts = log.split(/\r?\n\r?\n/).filter(Boolean);

        for (const part of parts) {
            const [userData, ...rawPaths] = part.trim().split(/\r?\n/);
            const [email, name, hashCommit] = userData.split(';');

            if (shouldBeIgnored(this.config, {email, name})) {
                continue;
            }

            const paths = (rawPaths as RelativePath[]).filter(isUsefullPath).map(normalizePath);
            for (const path of paths) {
                authors[path] = hashCommit;
            }
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

            for (const line of lines) {
                const [status, rawFrom, rawTo] = line.trim().split(/\t/);
                const from = normalizePath((rawFrom || '') as RelativePath);
                const to = normalizePath((rawTo || '') as RelativePath);

                if (!isUsefullPath(rawFrom) || (rawTo && !isUsefullPath(rawTo))) {
                    continue;
                }

                switch (status[0]) {
                    case 'R': {
                        delete mtimes[from];
                        mtimes[to] = unixtime;
                        break;
                    }
                    case 'D': {
                        delete mtimes[from];
                        break;
                    }
                    default: {
                        mtimes[from] = unixtime;
                    }
                }
            }
        }

        return mtimes;
    }
}

type ShouldAuthorBeIgnoredArgs = {
    email?: string;
    name?: string;
};

function shouldBeIgnored(config: GitConfig, {email, name}: ShouldAuthorBeIgnoredArgs) {
    if (!(email || name)) {
        return false;
    }

    const {ignoreAuthorPatterns} = config;
    if (!ignoreAuthorPatterns.length) {
        return false;
    }

    for (const pattern of ignoreAuthorPatterns) {
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
