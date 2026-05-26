import type {BuildConfig} from '../..';
import type {FullTap} from 'tapable';

import {describe, expect, it} from 'vitest';

import {getHooks as getBaseHooks} from '~/core/program';

import {Build} from '../..';

import {BuildContentMap} from './index';

describe('BuildContentMap', () => {
    describe('config wiring', () => {
        it('exposes --build-content option and normalizes config flag', async () => {
            const build = new Build();
            new BuildContentMap().apply(build);

            const tapByName = (taps: FullTap[], name: string) => {
                const tap = taps.find((t) => t.name === name);
                if (!tap) throw new Error(`tap ${name} not registered`);
                return tap.fn;
            };

            const commandTap = tapByName(getBaseHooks(build).Command.taps, 'BuildContentMap');
            const configTap = tapByName(getBaseHooks(build).Config.taps, 'BuildContentMap');

            // Command tap should add an option without throwing.
            const seenOptions: unknown[] = [];
            const fakeCommand = {addOption: (o: unknown) => seenOptions.push(o)};
            commandTap(fakeCommand);
            expect(seenOptions).toHaveLength(1);

            // Config tap should set buildContent=true when arg=true.
            const config = {} as BuildConfig;
            const result = await configTap(config, {buildContent: true});
            expect(result.buildContent).toBe(true);

            // And false when nothing is set.
            const config2 = {} as BuildConfig;
            const result2 = await configTap(config2, {});
            expect(result2.buildContent).toBe(false);
        });
    });
});
