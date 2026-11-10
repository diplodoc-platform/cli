import {Command} from '~/core/config';
import {BaseProgram} from '~/core/program';

import {Metadata} from './metadata';

export class Generate extends BaseProgram {
    readonly name = 'Generate';

    readonly command = new Command('generate').description('Generate documentation content');

    readonly options = [];

    readonly metadata = new Metadata();

    protected readonly modules = [this.metadata];

    async action() {
        this.command.outputHelp();
    }
}
