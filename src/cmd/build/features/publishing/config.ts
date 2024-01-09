import {option} from '~/config';

const publish = option({
    flags: '--publish',
    desc: 'Should upload output files to S3 storage.',
    deprecated: 'Use separated publish command instead.',
});

const storageEndpoint = option({
    flags: '--storage-endpoint <value>',
    desc: 'Endpoint of S3 storage.',
    deprecated: 'Use separated publish command instead.',
    hidden: true,
});

const storageBucket = option({
    flags: '--storage-bucket <value>',
    desc: 'Bucket name of S3 storage.',
    deprecated: 'Use separated publish command instead.',
    hidden: true,
});

const storageKeyId = option({
    flags: '--storage-key-id <value>',
    desc: 'Key Id of S3 storage.',
    defaultInfo: process.env.YFM_STORAGE_KEY_ID,
    deprecated: 'Use separated publish command instead.',
    hidden: true,
});

const storageSecretKey = option({
    flags: '--storage-secret-key <value>',
    desc: 'Secret key of S3 storage.',
    defaultInfo: process.env.YFM_STORAGE_SECRET_KEY,
    deprecated: 'Use separated publish command instead.',
    hidden: true,
});

const storageRegion = option({
    flags: '--storage-secret-key <value>',
    desc: 'Region of S3 storage.',
    defaultInfo: 'eu-central-1',
    deprecated: 'Use separated publish command instead.',
    hidden: true,
});

export const options = {
    publish,
    storageEndpoint,
    storageBucket,
    storageKeyId,
    storageSecretKey,
    storageRegion,
};
