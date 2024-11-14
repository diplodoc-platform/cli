import {green, red, yellow} from 'chalk';
import {pick} from 'lodash';

export const LogLevel = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
} as const;

type LogLevels = (typeof LogLevel)[keyof typeof LogLevel];

const INFO = Symbol.for(LogLevel.INFO);

const WARN = Symbol.for(LogLevel.WARN);

const ERROR = Symbol.for(LogLevel.ERROR);

interface LogConsumer {
    [INFO]: Writer;
    [WARN]: Writer;
    [ERROR]: Writer;
}

type LogBuffer = {
    [prop in LogLevels]: string[];
};

type LoggerOptions = Readonly<{
    colors: boolean;
    quiet: boolean;
}>;

type MessageInfo = {
    level: LogLevels;
    message: string;
};

type Color = typeof red;

const Write = Symbol('write');

function writer(
    logger: Logger,
    level: LogLevels,
): {
    (...msgs: string[]): void;
    count: number;
} {
    const writer = function (...msgs: string[]) {
        writer.count++;
        logger[Write](level, msgs.join(' '));
    };

    writer.count = 0;

    return writer;
}

export type Writer = ReturnType<typeof writer>;

const colors = {
    [LogLevel.INFO]: green,
    [LogLevel.WARN]: yellow,
    [LogLevel.ERROR]: red,
};


/**
 * Logger has three logging channels: info, warning, and error.
 * There are also many topics that use one of these channels.
 *
 * By default, the logger has three topics named after the logging channels.
 * New topics should always use one of defined channel.
 *
 * Loggers are also pipeable.
 * In this mode, only the channel is passed along.
 * Topics processing from the parent logger are ignored.
 */
export class Logger implements LogConsumer {
    [INFO] = writer(this, LogLevel.INFO);

    [WARN] = writer(this, LogLevel.WARN);

    [ERROR] = writer(this, LogLevel.ERROR);

    info = this.topic(LogLevel.INFO, 'INFO');

    warn = this.topic(LogLevel.WARN, 'WARN');

    error = this.topic(LogLevel.ERROR, 'ERR');

    private options: LoggerOptions = {
        colors: true,
        quiet: false,
    };

    private consumer: LogConsumer | null = null;

    private buffer: MessageInfo[] = [];

    private filters: ((level: LogLevels, message: string) => string)[];

    constructor(
        options: {quiet?: boolean} = {},
        filters: ((level: LogLevels, message: string) => string)[] = [],
    ) {
        this.filters = filters;
        this.setup(options);
        this.reset();
    }

    setup(options: {quiet?: boolean} = {}) {
        this.options = Object.assign(this.options, pick(options, ['quiet']));

        return this;
    }

    /**
     * Pipe local log channels to parent log channels.
     * This doesn't pipe topics processing.
     * So if child and parent has the same topic with name 'proc',
     * only local topic will be applied to message.
     * Message will be decorated by local topic and will be passed to parent as raw string.
     */
    pipe(consumer: LogConsumer) {
        if (this.consumer && this.consumer !== consumer) {
            throw new Error('This log already piped to another consumer.');
        }

        this.consumer = consumer;

        for (const {level, message} of this.buffer) {
            this.consumer[Symbol.for(level) as keyof LogConsumer](message);
        }

        this.buffer.length = 0;

        return this;
    }

    /**
     * Defines new write decorator to one of defined log channeld.
     * Each decorator adds colored prefix to messages and apply preconfigured filters.
     */
    topic(level: LogLevels, prefix: string, color?: Color) {
        const channel = Symbol.for(level) as keyof LogConsumer;
        const _writer = this[channel];
        const _color = color || colors[level];

        const topic = (...messages: unknown[]) => {
            messages = messages.map(extractMessage);

            const message = this.filters.reduce((message, filter) => {
                return filter(level, message);
            }, messages.join(' '));

            if (!message) {
                return;
            }

            topic.count++;

            _writer((this.options.colors ? _color(prefix) : prefix) + ' ' + message);
        };

        topic.count = 0;

        return topic;
    }

    add(buffers: LogBuffer) {
        for (const [level, buffer] of Object.entries(buffers) as [LogLevels, string[]][]) {
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

    stat(): Record<LogLevels, number> {
        return {
            [LogLevel.INFO]: this[INFO].count,
            [LogLevel.WARN]: this[WARN].count,
            [LogLevel.ERROR]: this[ERROR].count,
        }
    }

    [Write](level: LogLevels, message: string) {
        if (this.options.quiet) {
            return;
        }

        if (this.consumer) {
            this.consumer[Symbol.for(level) as keyof LogConsumer](message);
        } else {
            console[level](message);
        }
    }
}

function extractMessage(error: unknown): string {
    if (!error) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }

    return String(error);
}
