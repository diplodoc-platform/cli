type Head<T extends any[]> = T extends [ ...infer Head, any ] ? Head : never;

type HeadParams<A extends Action> = Head<Parameters<A>>;

export function pargs<A extends Action>(
    action: A,
    ...args: HeadParams<A>
): Promise<any[]> {
    return new Promise((resolve, reject) => {
        action(...args, function(err?: null | Error, ...results: any[]) {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

export function utf8BufferToString(buf: Buffer) {
    const str = buf.toString('utf-8');
    if (str.charCodeAt(0) === 0xFEFF) {
        return str.slice(1);
    } else {
        return str;
    }
}

const PATH_QUERY_FRAGMENT_REGEXP = /^((?:\0.|[^?#\0])*)(\?(?:\0.|[^#\0])*)?(#.*)?$/;

export function parsePathQueryFragment(str: string) {
    const match = PATH_QUERY_FRAGMENT_REGEXP.exec(str) as RegExpExecArray;

    return {
        path: match[1].replace(/\0(.)/g, '$1'),
        query: match[2] ? match[2].replace(/\0(.)/g, '$1') : '',
        fragment: match[3] || ''
    };
}