import {option} from '~/core/config';

export const dryRun = option({
    flags: '--dry-run',
    desc: 'Run build discovery and validate the collection without creating the output directory.',
    default: false,
});
