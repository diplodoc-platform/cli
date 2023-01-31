export type FormValueState = {
    path: Record<string, string>;
    search: Record<string, string>;
    headers: Record<string, string>;
    body: string | undefined;
};

export type ResponseState = {
    status: number;
    url: string;
    responseString?: string;
    file?: {
        name: string;
        url: string;
    };
};

export type ErrorState = {
    message: string;
};

export type ParamType = 'path' | 'search' | 'headers';
