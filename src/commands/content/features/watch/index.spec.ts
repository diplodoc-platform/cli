import {beforeEach, describe, expect, it, vi} from 'vitest';

const watchMock = vi.fn();

vi.mock('chokidar', () => ({
    default: {
        watch: (...args: unknown[]) => watchMock(...args),
    },
}));

import {ContentWatcher} from './index';

type FakeWatcher = {
    on: ReturnType<typeof vi.fn>;
    add: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
};

function fakeWatcher(): FakeWatcher {
    return {
        on: vi.fn(),
        add: vi.fn(),
        close: vi.fn().mockResolvedValue(undefined),
    };
}

describe('ContentWatcher', () => {
    beforeEach(() => {
        watchMock.mockReset();
    });

    it('watches the provided paths and forwards change events to onChange', () => {
        const watcher = fakeWatcher();
        watchMock.mockReturnValue(watcher);

        const onChange = vi.fn();
        const paths = ['/root/index.md', '/root/presets.yaml'] as AbsolutePath[];

        const instance = new ContentWatcher(paths, onChange);

        expect(instance).toBeInstanceOf(ContentWatcher);
        expect(watchMock).toHaveBeenCalledWith(paths, {ignoreInitial: true});
        expect(watcher.on).toHaveBeenCalledWith('all', expect.any(Function));

        const handler = watcher.on.mock.calls[0][1] as (type: string, path: string) => void;
        handler('change', '/root/index.md');

        expect(onChange).toHaveBeenCalledWith('/root/index.md');
    });

    it('delegates add() and close() to the underlying watcher', async () => {
        const watcher = fakeWatcher();
        watchMock.mockReturnValue(watcher);

        const instance = new ContentWatcher([] as AbsolutePath[], vi.fn());

        const extra = ['/root/new.md'] as AbsolutePath[];
        instance.add(extra);
        expect(watcher.add).toHaveBeenCalledWith(extra);

        await instance.close();
        expect(watcher.close).toHaveBeenCalled();
    });
});
