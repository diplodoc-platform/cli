type Action = (...args: any[]) => any;

type Hash<V = unknown> = Record<string, V>;

type NodeCallback<R = any> = (error?: Error | null, result?: R) => void;

type SourceMap = {
    version: string;
};