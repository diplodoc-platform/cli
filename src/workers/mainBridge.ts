type EmitFn = (data: SendPayload) => void;
type Callback = (payload: ReceivePayload) => void;
type ReplyFn = (id: number, payload: ReceivePayload) => void;

export type SendPayload = {type: 'call'; id: number; method: string; args: unknown[]};
export type ReceivePayload = {
    result?: unknown;
    error?: {name: string; message: string; stack?: string};
};

export class MainBridge {
    static handleCall = async (
        worker: {reply: ReplyFn},
        data: SendPayload,
        scope: Record<string, unknown>,
    ) => {
        const {id, method, args} = data;
        let result;
        let error;
        try {
            result = await resolveMethod(scope, method)(...args);
        } catch (ex) {
            const {name, message, stack} = ex as Error;
            error = {name, message, stack};
        }
        worker.reply(id, {result, error});
    };

    private index = 0;
    private idCallback;
    private readonly emitFn;

    constructor(emitFn: EmitFn) {
        this.idCallback = new Map<number, Callback>();
        this.emitFn = emitFn;
    }

    createFn<T>(method: string): T {
        const wrappedFn = (...args: unknown[]) => {
            return this.remoteCall(method, args);
        };
        return wrappedFn as unknown as T;
    }

    handleReply(id: number, payload: ReceivePayload) {
        const cb = this.idCallback.get(id);
        if (cb) {
            this.idCallback.delete(id);
            cb(payload);
        }
        return;
    }

    private remoteCall(method: string, args: unknown[]) {
        return new Promise((resolve, reject) => {
            const id = ++this.index;
            this.idCallback.set(id, ({result, error}) => {
                if (error) {
                    const err = new Error(error.message);
                    Object.assign(err, error);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
            this.emitFn({type: 'call', id, method, args});
        });
    }
}

function resolveMethod(scope: Record<string, unknown>, method: string) {
    let fn;
    let fnProto;
    let root = scope;
    const parts = method.split('.');
    while (parts.length) {
        fnProto = root;
        fn = root[parts.shift() as string];
        root = fn as Record<string, unknown>;
    }
    return (fn as Function).bind(fnProto);
}
