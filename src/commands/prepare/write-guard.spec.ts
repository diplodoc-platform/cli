import fs from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {describe, expect, it} from 'vitest';

import {assertPrepareWrites, installWriteGuard, withPrepareWrites} from './write-guard';

describe('prepare source mutation guard', () => {
    it('rejects deletion, truncation, writable opens, streams and fd writes before changing originals', () => {
        const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'yfm-write-guard-')));
        const source = join(root, 'source');
        const work = join(root, 'work');
        fs.mkdirSync(source);
        fs.mkdirSync(work);
        const victim = join(source, 'victim.yaml');
        fs.writeFileSync(victim, 'valuable');
        fs.symlinkSync(source, join(work, 'alias'));
        const before = fs.rmSync;
        const restore = installWriteGuard(work);
        const captured = fs.writeFileSync;
        try {
            for (const path of [victim, join(work, 'alias/victim.yaml')]) {
                for (const action of [
                    () => fs.rmSync(path, {force: true}),
                    () => fs.unlinkSync(path),
                    () => fs.truncateSync(path, 0),
                    () => fs.openSync(path, 'w'),
                    () => fs.openSync(path, fs.constants.O_RDWR),
                    () => fs.createWriteStream(path),
                    () => fs.rm(path, {force: true}, () => {}),
                    () => fs.promises.rm(path, {force: true}),
                ])
                    expect(action).toThrow('cannot modify original sources');
            }
            expect(() => fs.rmdirSync(source)).toThrow('cannot modify original sources');
            const descriptor = fs.openSync(victim, 'r');
            try {
                expect(() => fs.writeSync(descriptor, 'modified')).toThrow(
                    'cannot modify original sources',
                );
                expect(() => fs.ftruncateSync(descriptor, 0)).toThrow(
                    'cannot modify original sources',
                );
            } finally {
                fs.closeSync(descriptor);
            }
            fs.writeFileSync(join(work, 'allowed'), 'temporary');
            withPrepareWrites(() =>
                fs.writeFileSync(join(source, 'collector-owned'), 'authorized'),
            );
            expect(assertPrepareWrites).toThrow('cannot modify original sources');
        } finally {
            restore();
        }
        expect(fs.rmSync).toBe(before);
        expect(assertPrepareWrites).not.toThrow();
        expect(fs.readFileSync(victim, 'utf8')).toBe('valuable');
        captured(victim, 'authorized after restoration');
        expect(fs.readFileSync(victim, 'utf8')).toBe('authorized after restoration');
        fs.rmSync(root, {recursive: true, force: true});
    });

    it('guards FileHandle writes and deactivates captured wrappers after restoration', async () => {
        const root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'yfm-write-handle-')));
        const victim = join(root, 'victim.yaml');
        fs.writeFileSync(victim, 'valuable');
        const restore = installWriteGuard(join(root, 'work'));
        try {
            const handle = await fs.promises.open(victim, 'r');
            for (const action of [
                () => handle.writeFile('modified'),
                () => handle.truncate(0),
                () => handle.createWriteStream(),
            ])
                expect(action).toThrow('cannot modify original sources');
            await handle.close();
        } finally {
            restore();
        }
        expect(fs.readFileSync(victim, 'utf8')).toBe('valuable');
        fs.rmSync(root, {recursive: true, force: true});
    });
});
