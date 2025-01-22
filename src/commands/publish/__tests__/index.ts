import type {Run} from '../run';
import type {Mock} from 'vitest';
import type {PublishConfig} from '..';

import {expect, it, vi} from 'vitest';
import {Publish} from '..';
import {upload as originalUpload} from '../upload';

export const upload = originalUpload as Mock;

// eslint-disable-next-line no-var
var resolveConfig: Mock;

vi.mock('../upload');
vi.mock('~/core/config', async (importOriginal) => {
    resolveConfig = vi.fn((_path, {defaults, fallback}) => {
        return defaults || fallback;
    });

    return {
        ...((await importOriginal()) as {}),
        resolveConfig,
    };
});

export async function runPublish(args: string) {
    const publish = new Publish();

    publish.apply();

    await publish.parse(['node', 'index'].concat(args.split(' ')));
}

type DeepPartial<T> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [P in keyof T]?: T[P] extends Record<any, any> ? DeepPartial<T[P]> : T[P];
};

export function testConfig(name: string, args: string, result: DeepPartial<PublishConfig>): void;
export function testConfig(name: string, args: string, result: Error | string): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<PublishConfig>,
    result: DeepPartial<PublishConfig>,
): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<PublishConfig>,
    result: Error | string,
): void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function testConfig(name: string, args: string, config: any, result?: any): void {
    it(name, async () => {
        if (!result) {
            result = config;
            config = {};
        }

        resolveConfig.mockImplementation((_path, {defaults}) => {
            return {
                ...defaults,
                ...config,
            };
        });

        upload.mockImplementation((run: Run) => {
            expect(run.config).toMatchObject(result as Partial<PublishConfig>);
        });

        try {
            await runPublish('--input ./input --access-key-id 1 --secret-access-key 1 ' + args);
            expect(upload).toBeCalled();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            const message = error.message || error;
            if (result instanceof Error) {
                expect(message).toEqual(result.message);
            } else if (typeof result === 'string') {
                expect(message).toEqual(result);
            } else {
                throw error;
            }
        }
    });
}
