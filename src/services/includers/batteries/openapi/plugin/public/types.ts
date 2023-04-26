export interface Field<T = unknown, E = unknown> {
    validate(): Nullable<E>;
    value(): Nullable<T>;
}

export type FormState = {
    path: Record<string, string>;
    search: Record<string, string>;
    headers: Record<string, string>;
    body: string | undefined;
};

export type ResponseState = {
    url: string;
    status: number;
    text?: string;
    file?: {
        blob: Blob;
        name: string;
    };
};

export type ErrorState = {
    message: string;
};

export type Nullable<T> = T | null | undefined;
