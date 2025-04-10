import type {BaseArgs, ICallable} from '~/core/program';

import {
    BaseProgram,
    getHooks as getBaseHooks,
    withConfigDefaults,
    withConfigScope,
} from '~/core/program';
import {Command} from '~/core/config';

import {DESCRIPTION, NAME} from './config';
import {Index} from './commands/index';
import {getHooks, withHooks} from './hooks';

export {getHooks};

export type AlgoliaArgs = BaseArgs & {
    input: string;
};

export type AlgoliaCommandConfig = Pick<BaseArgs, 'input' | 'strict' | 'quiet'>;

@withHooks
@withConfigScope(NAME, {strict: true})
@withConfigDefaults(() => ({}))
export class Algolia extends BaseProgram<AlgoliaCommandConfig, AlgoliaArgs> {
    readonly name = 'Algolia';

    readonly command = new Command(NAME)
        .description(DESCRIPTION)
        .helpOption(false)
        .allowUnknownOption(true);

    readonly index = new Index();

    readonly options = []

    protected readonly modules: ICallable[] = [this.index];

    apply(program?: BaseProgram) {
        super.apply(program);

        getBaseHooks(this).Config.tap('Algolia', (config, args) => {
            const {input, quiet, strict} = args;

            return Object.assign(config, {
                input,
                quiet,
                strict,
            });
        });
    }

    async action() {
        console.log('Algolia command initialized');
        // The actual indexing action is handled by the Index subcommand
        // This is just a parent command that sets up shared configuration
        // and delegates to subcommands
    }
} 