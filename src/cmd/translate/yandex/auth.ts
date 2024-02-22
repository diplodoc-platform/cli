import {readFileSync} from 'fs';

type ServiceAccauntInfo = {
    id: string;
    service_account_id: string;
    public_key: string;
    private_key: string;
};

export type AuthInfo = ReturnType<typeof getYandexAuth>;

export function getYandexAuth(path: string) {
    if (path.startsWith('y0_')) {
        return {
            oauthToken: path,
        };
    }

    const data = readFileSync(path, 'utf8');
    try {
        const json = JSON.parse(data);

        if (isServeseAccount(json)) {
            return {
                serviceAccountJson: {
                    serviceAccountId: json.service_account_id,
                    accessKeyId: json.id,
                    privateKey: json.private_key,
                },
            };
        }
    } catch {}

    return {
        oauthToken: data,
    };
}

function isServeseAccount(json: any): json is ServiceAccauntInfo {
    return 'private_key' in json;
}
