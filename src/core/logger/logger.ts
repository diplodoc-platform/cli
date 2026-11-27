import type {LogConsumer, LogRecord} from './types';

import {green, red, yellow} from 'chalk';
import {pick} from 'lodash';

import {getHooks, withHooks} from './hooks';

export const LogLevel = {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    DEPRECATION: 'deprecation',
} as const;

export type LogLevels = (typeof LogLevel)[keyof typeof LogLevel];

const INFO = Symbol.for(LogLevel.INFO);

const WARN = Symbol.for(LogLevel.WARN);

const ERROR = Symbol.for(LogLevel.ERROR);

const DEPRECATION = Symbol.for(LogLevel.DEPRECATION);

export type StandardLogLevelsAccess = typeof INFO | typeof WARN | typeof ERROR;
export type LogLevelsAccess = StandardLogLevelsAccess | typeof DEPRECATION;

type LoggerOptions = Readonly<{
    colors: boolean;
    quiet: boolean;
    deprecationWarnings: boolean;
}>;

type Color = typeof red;

type Observable = {
    subscribe(handler: (record: LogRecord) => void): void;
};

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
        const message = msgs.join(' ');
        logger[Write](level, message);

        const hook = (
            {info: 'Info', warn: 'Warn', error: 'Error', deprecation: 'Deprecation'} as const
        )[level];
        getHooks(logger)[hook].call(message);
    };

    writer.count = 0;

    return writer;
}

const colors = {
    [LogLevel.INFO]: green,
    [LogLevel.WARN]: yellow,
    [LogLevel.ERROR]: red,
    [LogLevel.DEPRECATION]: yellow,
};

/**
 * Deprecations use a separate channel so strict builds can count actionable warnings.
 * There are also many topics that use one of these channels.
 *
 * The built-in topics are info, warn, deprecation and error.
 * Custom topics use one of these channels.
 *
 * Loggers are also pipeable.
 * In this mode, only the channel is passed along.
 * Topics processing from the parent logger are ignored.
 */
@withHooks
export class Logger implements LogConsumer {
    [INFO] = writer(this, LogLevel.INFO);

    [WARN] = writer(this, LogLevel.WARN);

    [ERROR] = writer(this, LogLevel.ERROR);

    [DEPRECATION] = writer(this, LogLevel.DEPRECATION);

    info = this.topic(LogLevel.INFO, 'INFO');

    warn = this.topic(LogLevel.WARN, 'WARN');

    deprecation = this.topic(LogLevel.DEPRECATION, 'WARN');

    error = this.topic(LogLevel.ERROR, 'ERR');

    private options: LoggerOptions = {
        colors: true,
        quiet: false,
        deprecationWarnings: true,
    };

    private consumer: LogConsumer | null = null;

    private filters: ((level: LogLevels, message: string) => string)[];

    constructor(
        options: Partial<Pick<LoggerOptions, 'quiet' | 'deprecationWarnings'>> = {},
        filters: ((level: LogLevels, message: string) => string)[] = [],
    ) {
        this.filters = filters;
        this.setup(options);
        this.reset();
    }

    get deprecationWarnings() {
        return this.options.deprecationWarnings !== false;
    }

    setup(options: Partial<LoggerOptions> = {}) {
        this.options = Object.assign(this.options, pick(options, ['quiet', 'deprecationWarnings']));

        return this;
    }

    /**
     * Pipe local log channels to parent log channels.
     * This doesn't pipe topics processing.
     * So if child and parent has the same topic with name 'proc',
     * only local topic will be applied to message.
     * Message will be decorated by local topic and will be passed to parent as raw string.
     *
     * @param {LogConsumer} consumer - parent logger
     * @returns {Logger}
     */
    pipe(consumer: LogConsumer) {
        if (this.consumer && this.consumer !== consumer) {
            throw new Error('This log already piped to another consumer.');
        }

        this.consumer = consumer;

        return this;
    }

    subscribe(subject: Observable) {
        subject.subscribe((record) => {
            this[Symbol.for(record.level) as LogLevelsAccess](record.message);
        });
    }

    /**
     * Defines new write decorator to one of defined log channeld.
     * Each decorator adds colored prefix to messages and apply preconfigured filters.
     *
     * @param {LogLevels} level
     * @param {string} prefix - any bounded text prefix, which will be colored
     * @param {Color} [color] - prefix color
     * @returns new topic
     */
    topic(level: LogLevels, prefix: string, color?: Color) {
        const channel = Symbol.for(level) as keyof LogConsumer;
        const _writer = this[channel];
        const _color = color || colors[level];

        const topic = (...messages: unknown[]) => {
            if (level === LogLevel.DEPRECATION && !this.deprecationWarnings) {
                return;
            }

            messages = messages.map(extractMessage);

            const message = this.filters.reduce((message, filter) => {
                return filter(level, message);
            }, messages.join(' '));

            if (!message) {
                return;
            }

            topic.count++;

            if (this.options.quiet && [INFO].includes(channel)) {
                return;
            }

            _writer((this.options.colors ? _color(prefix) : prefix) + ' ' + message);
        };

        topic.count = 0;

        return topic;
    }

    reset() {
        for (const level of Object.values(LogLevel)) {
            this[Symbol.for(level) as LogLevelsAccess].count = 0;
        }

        return this;
    }

    [Write](level: LogLevels, message: string) {
        if (this.consumer) {
            const sink = this.consumer;
            const channel = Symbol.for(level) as LogLevelsAccess;
            // Older piped consumers receive the warning through their existing channel.
            (sink[channel] ?? sink[WARN]).call(sink, message);
        } else {
            // eslint-disable-next-line no-console
            console[level === LogLevel.DEPRECATION ? 'warn' : level](message);
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

export function stats(logger: Logger) {
    return {
        [LogLevel.INFO]: logger[INFO].count,
        [LogLevel.WARN]: logger[WARN].count,
        [LogLevel.ERROR]: logger[ERROR].count,
    };
}
