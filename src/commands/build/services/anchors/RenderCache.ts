import {createHash} from 'node:crypto';

/** Holds anchor-index renders until an ordinary renderer consumes their environment once. */
export class AnchorRenderCache<Env> {
    private readonly values = new Map<string, {result: readonly [string, Env]; bytes: number}>();

    private readonly references = new WeakMap<object, number>();

    private sequence = 0;

    private bytes = 0;

    private revision = -1;

    private readonly maxEntries: number;

    private readonly maxBytes: number;

    constructor(maxEntries = 32, maxBytes = 16 * 1024 * 1024) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
    }

    reset(revision: number) {
        if (revision !== this.revision) {
            this.values.clear();
            this.bytes = 0;
            this.revision = revision;
        }
    }

    get size() {
        return this.values.size;
    }

    signature(source: string, options: Record<string, unknown>, idGenerator: unknown) {
        const inputs = {
            ...options,
            generateID: idGenerator,
            // These callbacks are pure functions of the resolved assets and source paths.
            rawContent: undefined,
            calcPath: undefined,
            replaceImageSrc: undefined,
            // Project-sized collections are stable within a Markdown revision. Their identity
            // avoids serializing every project entry again for every rendered document.
            entries: this.reference(options.entries),
            entrySet: this.reference(options.entrySet),
            log: this.reference(options.log),
        };
        const serialized = JSON.stringify(inputs, (_key, value) =>
            typeof value === 'function' ? {functionId: this.reference(value)} : value,
        );

        return createHash('sha256').update(source).update('\0').update(serialized).digest('hex');
    }

    take(signature: string): readonly [string, Env] | undefined {
        const item = this.values.get(signature);
        if (!item) {
            return undefined;
        }

        this.values.delete(signature);
        this.bytes -= item.bytes;

        return item.result;
    }

    set(signature: string, result: readonly [string, Env]) {
        this.take(signature);
        const bytes = Buffer.byteLength(result[0]);
        if (bytes > this.maxBytes || this.maxEntries <= 0) {
            return;
        }

        this.values.set(signature, {result, bytes});
        this.bytes += bytes;

        while (this.values.size > this.maxEntries || this.bytes > this.maxBytes) {
            const oldest = this.values.keys().next().value;
            if (oldest === undefined) {
                break;
            }

            this.take(oldest);
        }
    }

    private reference(value: unknown) {
        if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
            return value;
        }

        if (!this.references.has(value)) {
            this.references.set(value, ++this.sequence);
        }

        return this.references.get(value);
    }
}
