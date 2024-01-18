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
vi.mock('~/config', async (importOriginal) => {
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
    [P in keyof T]?: T[P] extends Record<any, any> ? DeepPartial<T[P]> : T[P];
};

export function testConfig(name: string, args: string, result: DeepPartial<PublishConfig>): void;
export function testConfig(
    name: string,
    args: string,
    config: DeepPartial<PublishConfig>,
    result: DeepPartial<PublishConfig>,
): void;
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

        await runPublish('--input ./input --output ./output ' + args);

        expect(upload).toBeCalled();
    });
}
