import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {join} from 'node:path';
import {existsSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';

import {
    collectWatchPaths,
    detectArcadiaRootFromArc,
    detectArcadiaRootUnix,
    detectArcadiaRootWindows,
} from './utils';

const {existsSync: realExistsSync} = await vi.importActual<{existsSync: typeof existsSync}>(
    'node:fs',
);

// Keep real fs behaviour but make existsSync controllable for arc-binary probing.
vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {...actual, existsSync: vi.fn(actual.existsSync as typeof existsSync)};
});

vi.mock('node:child_process');

describe('detectArcadiaRootUnix', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(existsSync).mockImplementation(realExistsSync);
    });

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

    it('falls back to `arc root` when alias is unavailable', () => {
        vi.mocked(existsSync).mockReturnValue(true);
        vi.mocked(execFileSync).mockImplementation((file) => {
            if (String(file).endsWith('/arc')) {
                return '/codenv/arcadia\n';
            }

            return '';
        });

        expect(detectArcadiaRootUnix()).toBe('/codenv/arcadia');
    });

    it('prefers the `ya` alias over `arc root`', () => {
        vi.mocked(execFileSync).mockImplementation((file) => {
            if (String(file).endsWith('/arc')) {
                throw new Error('arc should not be called');
            }

            return "alias ya='/Users/user/arcadia/ya'";
        });

        expect(detectArcadiaRootUnix()).toBe('/Users/user/arcadia');
    });
});

describe('detectArcadiaRootFromArc', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Pretend an `arc` binary is installed at every candidate location.
        vi.mocked(existsSync).mockReturnValue(true);
    });

    it('invokes `arc` by an absolute path, never a bare command name', () => {
        let capturedFile: unknown;
        vi.mocked(execFileSync).mockImplementation((file) => {
            capturedFile = file;
            return '/codenv/arcadia\n';
        });

        expect(detectArcadiaRootFromArc()).toBe('/codenv/arcadia');
        expect(String(capturedFile).startsWith('/')).toBe(true);
        expect(String(capturedFile).endsWith('/arc')).toBe(true);
    });

    it('returns trimmed `arc root` output', () => {
        vi.mocked(execFileSync).mockReturnValue('/codenv/arcadia\n');

        expect(detectArcadiaRootFromArc()).toBe('/codenv/arcadia');
    });

    it('returns undefined when arc throws', () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            throw new Error('arc: not found');
        });

        expect(detectArcadiaRootFromArc()).toBeUndefined();
    });

    it('returns undefined on empty output', () => {
        vi.mocked(execFileSync).mockReturnValue('   \n');

        expect(detectArcadiaRootFromArc()).toBeUndefined();
    });

    it('returns undefined without spawning anything when no arc binary exists', () => {
        vi.mocked(existsSync).mockReturnValue(false);

        expect(detectArcadiaRootFromArc()).toBeUndefined();
        expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
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
        vi.mocked(existsSync).mockImplementation(realExistsSync);
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
