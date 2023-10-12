import {extract} from './extract';
import {compose} from './compose';

import {Argv} from 'yargs';

const command = 'xliff';

const description =
    'extract xliff and skeleton from documentation files\ncompose xliff and skeleton into documentation';

const xliff = {
    command,
    description,
    handler: () => {},
    builder,
};

function builder<T>(argv: Argv<T>) {
    return argv
        .command(extract)
        .command(compose)
        .demandCommand(
            1,
            `provide one of the folowing ${command} commands: ${extract.command}, ${compose.command}`,
        );
}

export {xliff};

export default {xliff};
