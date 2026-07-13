import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {join} from 'node:path';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

import {collectWatchPaths, detectArcadiaRootUnix, detectArcadiaRootWindows} from './utils';

vi.mock('node:child_process');

describe('detectArcadiaRootUnix', () => {
    beforeEach(() => vi.clearAllMocks());

    it('parses bash alias format with single quotes', () => {
        vi.mocked(execFileSync).mockReturnValue("alias ya='/Users/user/arcadia/ya'");
        expect(detectArcadiaRootUnix()).toBe('/Users/user/arcadia');
    });

    it('parses bash alias format with double quotes', () => {
        vi.mocked(execFileSync).mockReturnValue('alias ya="/Users/user/arcadia/ya"');
        expect(detectArcadiaRootUnix()).toBe('/Users/user/arcadia');
    });

    it('parses bare assignment format', () => {
        vi.mocked(execFileSync).mockReturnValue('ya=/Users/user/arcadia/ya');
        expect(detectArcadiaRootUnix()).toBe('/Users/user/arcadia');
    });

    it('returns undefined when bash throws', () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error('Command failed');
        });
        expect(detectArcadiaRootUnix()).toBeUndefined();
    });

    it('returns undefined when output does not contain ya alias', () => {
        vi.mocked(execFileSync).mockReturnValue('');
        expect(detectArcadiaRootUnix()).toBeUndefined();
    });
});

describe('detectArcadiaRootWindows', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns dirname of first where.exe result', () => {
        vi.mocked(execFileSync).mockReturnValue('C:\\Users\\user\\arcadia\\ya.exe\r\n');
        expect(detectArcadiaRootWindows()).toBe('C:\\Users\\user\\arcadia');
    });

    it('handles multiple results and picks the first line', () => {
        vi.mocked(execFileSync).mockReturnValue(
            'C:\\Users\\user\\arcadia\\ya.exe\r\nC:\\other\\ya.exe\r\n',
        );
        expect(detectArcadiaRootWindows()).toBe('C:\\Users\\user\\arcadia');
    });

    it('returns undefined when where.exe throws', () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error('Command failed');
        });
        expect(detectArcadiaRootWindows()).toBeUndefined();
    });
});

describe('collectWatchPaths', () => {
    let tmp: string;

    beforeEach(() => {
        tmp = join(tmpdir(), `ya-make-utils-${Date.now()}`);
        mkdirSync(tmp, {recursive: true});
    });

    afterEach(() => rmSync(tmp, {recursive: true, force: true}));

    it('includes existing docsDir', () => {
        const docsDir = join(tmp, 'docs');
        mkdirSync(docsDir);
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir,
            copyFiles: [],
            includeSources: [],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result).toContain(docsDir);
    });

    it('omits docsDir when undefined', () => {
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            copyFiles: [],
            includeSources: [],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result).toHaveLength(0);
    });

    it('excludes non-existent paths from candidates', () => {
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            copyFiles: [{from: join(tmp, 'missing'), namespace: 'ru', files: []}],
            includeSources: [join(tmp, 'also-missing')],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result).toHaveLength(0);
    });

    it('includes all existing candidate types', () => {
        const copyFrom = join(tmp, 'copy-from');
        const include = join(tmp, 'include');
        const peer = join(tmp, 'peer');
        const single = join(tmp, 'single');
        for (const d of [copyFrom, include, peer, single]) {
            mkdirSync(d);
        }

        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            copyFiles: [{from: copyFrom, namespace: 'ru', files: []}],
            includeSources: [include],
            peerDirs: [peer],
            copyFileSingle: [{src: single, dst: 'single.md'}],
        });
        expect(result).toEqual([copyFrom, include, peer, single]);
    });

    it('deduplicates repeated paths', () => {
        const dir = join(tmp, 'shared');
        mkdirSync(dir);
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            copyFiles: [{from: dir, namespace: 'ru', files: []}],
            includeSources: [dir],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result.filter((p) => p === dir)).toHaveLength(1);
    });

    it('includes existing docsConfig file', () => {
        const configFile = join(tmp, 'config.yml');
        writeFileSync(configFile, 'title: test');
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            docsConfig: configFile,
            copyFiles: [],
            includeSources: [],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result).toContain(configFile);
    });

    it('omits docsConfig when file does not exist', () => {
        const result = collectWatchPaths({
            arcadiaRoot: tmp,
            docsDir: undefined,
            docsConfig: join(tmp, 'missing-config.yml'),
            copyFiles: [],
            includeSources: [],
            peerDirs: [],
            copyFileSingle: [],
        });
        expect(result).toHaveLength(0);
    });
});
