import {option} from '~/config';

const folderId = option({
    flags: '--folder-id <value>',
    desc: 'Yandex Cloud folder id.',
});

const oauthToken = option({
    flags: '--oauth-token <value>',
    desc: 'Yandex Cloud folder id.',
});

export const options = {
    folderId,
    oauthToken,
};
