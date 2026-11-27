import {afterEach, expect, it, vi} from 'vitest';

import {LogLevel, Logger, stats} from './logger';

afterEach(() => vi.restoreAllMocks());

it('forwards the category independently of the text through pipes and worker records', () => {
    const parent = new Logger();
    const child = new Logger().pipe(parent);
    const stderr = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const message = '[DEPRECATED EXAMPLE]';

    child.deprecation(message);
    child.warn(message);
    parent.subscribe({
        subscribe: (receive) => receive({level: LogLevel.DEPRECATION, message}),
    });

    expect(stderr).toHaveBeenCalledTimes(3);
    expect(stats(parent).warn).toBe(1);
    expect(stats(child).warn).toBe(1);
});

it('skips a muted deprecation before filters and keeps ordinary warnings', () => {
    const filter = vi.fn((_level, message: string) => message);
    const logger = new Logger({deprecationWarnings: false}, [filter]);
    const stderr = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.deprecation('legacy');
    expect(filter).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    logger.warn('[DEPRECATED EXAMPLE] from a plugin');
    expect(stats(logger).warn).toBe(1);
    expect(stderr).toHaveBeenCalledTimes(1);
});
