import {option} from '~/config';

const changelogs = option({
    flags: '--changelogs',
    desc: 'Beta functionality: Toggle processing of experimental changelogs syntax',
});

export const options = {
    changelogs,
};