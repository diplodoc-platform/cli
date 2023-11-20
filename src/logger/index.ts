import {green, yellow, red} from 'chalk';

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

export class Logger {
    private options: LoggerOptions;

    private consumer: LogConsumer | null = null;

    private buffer: LogBuffer = {
        [LogLevel.INFO]: [],
        [LogLevel.WARN]: [],
        [LogLevel.ERROR]: [],
    };

    constructor(
        options: Partial<LoggerOptions>,
        private filters: ((level: LogLevel, message: string) => string)[] = [],
    ) {
        this.options = Object.assign(
            {
                colors: true,
                quiet: false,
            },
            options,
        );

        this.reset();
    }

    pipe(consumer: LogConsumer) {
        this.consumer = consumer;

        for (const [level, buffer] of Object.entries(this.buffer) as [LogLevel, string[]][]) {
            for (const message of buffer) {
                this.consumer[level](message);
            }

            buffer.length = 0;
        }
    }

    add(buffers: LogBuffer) {
        for (const [level, buffer] of Object.entries(buffers) as [LogLevel, string[]][]) {
            for (const message of buffer) {
                this[level](message);
            }
        }
    }

    clear() {
        for (const buffer of Object.values(this.buffer)) {
            buffer.length = 0;
        }
    }

    reset() {
        this.clear();

        this[LogLevel.INFO].count = 0;
        this[LogLevel.WARN].count = 0;
        this[LogLevel.ERROR].count = 0;
    }

    [LogLevel.INFO](msg: string) {
        this.write(LogLevel.INFO, 'INFO', green, msg);
    }

    [LogLevel.WARN](msg: string) {
        this.write(LogLevel.WARN, 'WARN', yellow, msg);
    }

    [LogLevel.ERROR](msg: string) {
        this.write(LogLevel.ERROR, 'ERR', red, msg);
    }

    private write(level: LogLevel, prefix: string, color: (message: string) => string, message: string) {
        this[level].count++;

        if (this.options.colors) {
            prefix = color(prefix);
        }

        if (this.options.quiet) {
            return;
        }

        message = this.filters.reduce((message, filter) => {
            return filter(level, message);
        }, message);

        if (!message) {
            return;
        }

        if (this.consumer) {
            this.consumer[level](prefix + ' ' + message);
        } else {
            this.buffer[level].push(prefix + ' ' + message);
        }
    }
}
