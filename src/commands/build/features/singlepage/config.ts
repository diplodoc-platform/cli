import {option} from '~/core/config';

const singlePage = option({
    flags: '--single-page',
    desc: 'Beta functionality: Build a single page in the output folder also.',
});

export const options = {
    singlePage,
};
