import {option, toArray} from '~/config';

const endpoint = option({
    flags: '--endpoint <value>',
    default: 'https://s3.amazonaws.com',
    desc: 'Endpoint of S3 storage.',
});

const bucket = option({
    flags: '--bucket <value>',
    desc: 'Bucket name of S3 storage.',
    required: true,
});

const prefix = option({
    flags: '--prefix <value>',
    desc: 'Bucket internal scope of S3 storage.',
    default: '',
});

const accessKeyId = option({
    flags: '--access-key-id <value>',
    desc: 'Key Id of S3 storage.',
    required: true,
});

const secreAccessKey = option({
    flags: '--secret-access-key <value>',
    desc: 'Secret key of S3 storage.',
    required: true,
});

const region = option({
    flags: '--storage-secret-key <value>',
    desc: 'Region of S3 storage.',
    default: 'eu-central-1',
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
    endpoint,
    bucket,
    prefix,
    accessKeyId,
    secreAccessKey,
    region,
    hidden,
};
