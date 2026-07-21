import type {YaMakeParsed} from '@diplodoc/utils/ya-make';

import {dirname, win32} from 'node:path';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';

export function detectArcadiaRootFromAlias(): string | undefined {
    try {
        const output = execFileSync('/bin/bash', ['-ic', 'alias ya'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000,
        }).trim();

        const match = /(?:alias\s+)?ya=['"]?([^'"]+)['"]?/.exec(output);

        if (match?.[1]) {
            return dirname(match[1]);
        }
    } catch {}

    return undefined;
}

export function detectArcadiaRootFromArc(): string | undefined {
    try {
        const output = execFileSync('arc', ['root'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 3000,
        }).trim();

        if (output) {
            return output;
        }
    } catch {}

    return undefined;
}

export function detectArcadiaRootUnix(): string | undefined {
    return detectArcadiaRootFromAlias() ?? detectArcadiaRootFromArc();
}

export function detectArcadiaRootWindows(): string | undefined {
    try {
        const output = execFileSync(String.raw`C:\Windows\System32\where.exe`, ['ya'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        })
            .trim()
            .split('\n')[0]
            .trim();

        if (output) {
            return win32.dirname(output);
        }
    } catch {}

    return undefined;
}

export function detectArcadiaRoot(): string | undefined {
    if (process.platform === 'win32') {
        return detectArcadiaRootWindows();
    }

    return detectArcadiaRootUnix();
}

export function collectWatchPaths(parsed: YaMakeParsed): string[] {
    const paths: string[] = [];

    if (parsed.docsDir) {
        paths.push(parsed.docsDir);
    }

    if (parsed.docsConfig && !paths.includes(parsed.docsConfig) && existsSync(parsed.docsConfig)) {
        paths.push(parsed.docsConfig);
    }

    const candidates = [
        ...parsed.copyFiles.map(({from}) => from),
        ...parsed.includeSources,
        ...parsed.peerDirs,
        ...parsed.copyFileSingle.map(({src}) => src),
    ];

    for (const p of candidates) {
        if (!paths.includes(p) && existsSync(p)) {
            paths.push(p);
        }
    }

    return paths;
}
