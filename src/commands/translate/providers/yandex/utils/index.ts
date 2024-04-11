export {LimitExceed, RequestError, AuthError} from './errors';

export class Defer<T = string> {
    resolve!: (text: T) => void;

    reject!: (error: any) => void;

    promise: Promise<T>;

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }
}

export function bytes(texts: string[]) {
    return texts.reduce((sum, text) => sum + text.length, 0);
}
