import {describe, expect, it} from 'vitest';

import {Build} from '~/commands/build';
import {Command, option} from '~/core/config';
import {getHooks} from '~/core/program';

import {Search} from './index';

describe('search extension compatibility', () => {
    it('reuses a search-provider flag registered by an extension after the core feature', () => {
        const build = new Build();
        new Search().apply(build);
        const extensionOption = option({
            flags: '--search-provider <name>',
            desc: 'Extension search provider',
            default: 'algolia',
            env: 'ALGOLIA_PROVIDER',
        });
        getHooks(build).Command.tap('Algolia', (command) => command.addOption(extensionOption));
        const command = new Command();
        expect(() => getHooks(build).Command.call(command, [])).not.toThrow();
        expect(command.options.filter((item) => item.long === '--search-provider')).toEqual([
            extensionOption,
        ]);
    });
});
