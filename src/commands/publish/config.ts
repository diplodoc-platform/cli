import {options as globalOptions} from '~/commands/config';
import {option, toArray} from '~/core/config';

const endpoint = option({
    flags: '--endpoint <value>',
    defaultInfo: 'https://s3.amazonaws.com',
    desc: 'Endpoint of S3 storage.',
});

const bucket = option({
    flags: '--bucket <value>',
    desc: 'Bucket name of S3 storage.',
});

const prefix = option({
    flags: '--prefix <value>',
    desc: 'Bucket internal scope of S3 storage.',
});

const accessKeyId = option({
    flags: '--access-key-id <value>',
    desc: 'Key Id of S3 storage.',
    required: true,
});

const secretAccessKey = option({
    flags: '--secret-access-key <value>',
    desc: 'Secret key of S3 storage.',
    required: true,
});

const region = option({
    flags: '--region <value>',
    desc: 'Region of S3 storage.',
    defaultInfo: 'eu-central-1',
});

const hidden = option({
    flags: '--hidden <glob>',
    desc: `
        Do not upload paths matched by glob.

        Example:
            {{PROGRAM}} -i ./input --hidden *.bad.md
    `,
    parser: toArray,
});

export const options = {
    input: globalOptions.input,
    config: globalOptions.config,
    endpoint,
    bucket,
    prefix,
    accessKeyId,
    secretAccessKey,
    region,
    hidden,
};
