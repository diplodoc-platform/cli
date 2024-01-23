import {green, red, yellow} from 'chalk';
import {pick} from 'lodash';

export enum LogLevel {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
}

type LogConsumer = {
    [prop in LogLevel]: (message: string) => void;
};

type LogBuffer = {
    [prop in LogLevel]: string[];
};

type LoggerOptions = Readonly<{
    colors: boolean;
    quiet: boolean;
}>;

type Color = typeof green | typeof red | typeof yellow;

type MessageInfo = {
    level: LogLevel;
    message: string;
};

export type Writer = ReturnType<typeof writer>;

function writer(
    logger: Logger,
    level: LogLevel,
    prefix: string,
    color: Color,
): {
    (...msgs: string[]): void;
    count: number;
} {
    const writer = function (...msgs: string[]) {
        logger[Write](level, prefix, color, msgs.join(' '));
    };

    writer.count = 0;

    return writer;
}

const Write = Symbol('write');

const colors = {
    [LogLevel.INFO]: green,
    [LogLevel.WARN]: yellow,
    [LogLevel.ERROR]: red,
};

export class Logger {
    [LogLevel.INFO] = this.topic(LogLevel.INFO, 'INFO');

    [LogLevel.WARN] = this.topic(LogLevel.WARN, 'WARN');

    [LogLevel.ERROR] = this.topic(LogLevel.ERROR, 'ERR');

    private options: LoggerOptions = {
        colors: true,
        quiet: false,
    };

    private consumer: LogConsumer | null = null;

    private buffer: MessageInfo[] = [];

    constructor(
        options: {quiet?: boolean} = {},
        private filters: ((level: LogLevel, message: string) => string)[] = [],
    ) {
        this.setup(options);
        this.reset();
    }

    setup(options: {quiet?: boolean} = {}) {
        this.options = Object.assign(this.options, pick(options, ['quiet']));

        return this;
    }

    pipe(consumer: LogConsumer) {
        if (this.consumer) {
            throw new Error('This log already piped to another consumer.');
        }

        this.consumer = consumer;

        for (const {level, message} of this.buffer) {
            this.consumer[level](message);
        }

        this.buffer.length = 0;

        return this;
    }

    topic(level: LogLevel, prefix: string) {
        return writer(this, level, prefix, colors[level]);
    }

    add(buffers: LogBuffer) {
        for (const [level, buffer] of Object.entries(buffers) as [LogLevel, string[]][]) {
            for (const message of buffer) {
                this[level](message);
            }
        }

        return this;
    }

    clear() {
        this.buffer.length = 0;

        return this;
    }

    reset() {
        this.clear();
        for (const level of Object.values(LogLevel)) {
            this[level].count = 0;
        }

        return this;
    }

    [Write](level: LogLevel, prefix: string, color: Color, message: string) {
        message = this.filters.reduce((message, filter) => {
            return filter(level, message);
        }, message);

        if (!message) {
            return;
        }

        this[level].count++;

        if (this.options.quiet) {
            return;
        }

        if (this.consumer) {
            this.consumer[level](message);
        } else {
            if (this.options.colors) {
                prefix = color(prefix);
            }

            console[level](prefix + ' ' + message);
        }
    }
}
