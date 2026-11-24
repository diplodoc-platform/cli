import type {BuildArgs, BuildConfig} from '~/commands/build';
import type {SearchRawConfig} from './index';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {Build} from '~/commands/build';
import {option, withConfigUtils} from '~/core/config';
import {getHooks} from '~/core/program';

import {Search} from './index';

function setupSearchExtension() {
    const build = new Build();
    new Search().apply(build);
    const extensionOption = option({
        flags: '--search-provider <name>',
        desc: 'Extension search provider',
        default: 'algolia',
        env: 'ALGOLIA_PROVIDER',
    });
    getHooks(build).Command.tap('Algolia', (command) => command.addOption(extensionOption));
    getHooks(build).Command.call(build.command, []);

    return {build, extensionOption};
}

async function configureSearch(search: SearchRawConfig['search'] | undefined, argv: string[] = []) {
    const {build} = setupSearchExtension();
    build.command.parse(argv, {from: 'user'});
    const config = await getHooks(build).Config.promise(
        withConfigUtils(null, {search} as BuildConfig),
        build.command.opts<BuildArgs>(),
    );

    return config.search;
}

describe('search extension compatibility', () => {
    beforeEach(() => vi.stubEnv('ALGOLIA_PROVIDER', undefined));
    afterEach(() => vi.unstubAllEnvs());

    it('reuses a search-provider flag registered by an extension after the core feature', () => {
        const {build, extensionOption} = setupSearchExtension();
        expect(build.command.options.filter((item) => item.long === '--search-provider')).toEqual([
            extensionOption,
        ]);
    });

    it.each([
        {
            name: 'a configured local provider',
            search: {provider: 'local'},
            expected: {enabled: true, provider: 'local'},
        },
        {
            name: 'a configured external provider',
            search: {provider: 'external', endpoint: '/query'},
            expected: {enabled: true, provider: 'external', endpoint: '/query'},
        },
        {
            name: 'legacy enabled search',
            search: true,
            expected: {enabled: true, provider: 'local'},
        },
        {
            name: 'explicitly disabled search',
            search: false,
            expected: {enabled: false, provider: 'local'},
        },
        {
            name: 'unconfigured search',
            search: undefined,
            expected: {enabled: false, provider: 'local'},
        },
    ])(
        'preserves $name when the extension provider comes from a default',
        async ({search, expected}) => {
            expect(await configureSearch(search)).toMatchObject(expected);
        },
    );

    it('lets an explicit CLI provider override the configured provider', async () => {
        expect(
            await configureSearch({provider: 'local'}, [
                '--search-provider',
                'external',
                '--search-endpoint',
                '/query',
            ]),
        ).toMatchObject({enabled: true, provider: 'external', endpoint: '/query'});
    });

    it('lets an environment provider override the configured provider', async () => {
        vi.stubEnv('ALGOLIA_PROVIDER', 'external');
        expect(await configureSearch({provider: 'local', endpoint: '/query'})).toMatchObject({
            enabled: true,
            provider: 'external',
        });
    });

    it('lets an explicit CLI provider override the environment provider', async () => {
        vi.stubEnv('ALGOLIA_PROVIDER', 'external');
        expect(
            await configureSearch({provider: 'external', endpoint: '/query'}, [
                '--search-provider',
                'local',
            ]),
        ).toMatchObject({enabled: true, provider: 'local'});
    });
});
