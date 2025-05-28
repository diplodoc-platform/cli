import {option} from '~/core/config';

const hashIncludes = option({
    flags: '--hash-includes',
    hidden: true,
    desc: 'Toggle includes hashing.',
});

export const options = {
    hashIncludes,
};
