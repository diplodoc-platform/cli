import {Arguments} from 'yargs';

const command = 'compose';

const description = 'compose xliff and skeleton into documentation';

const compose = {command, description, handler};

function handler(args: Arguments<any>) {
    console.log('handling xliff compose');
    console.log('xliff compose', JSON.stringify(args, null, 4));

    throw new Error('not implemented');
}

export {compose};

export default {compose};
