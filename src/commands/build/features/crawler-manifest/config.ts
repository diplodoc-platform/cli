import {option} from '~/core/config';

const crawlerManifest = option({
    flags: '--crawler-manifest',
    desc: 'Output a crawler manifest file with external links per page.',
});

export const options = {
    crawlerManifest,
};
