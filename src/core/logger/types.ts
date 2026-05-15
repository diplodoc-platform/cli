import type {LogLevels, LogLevelsAccess} from './logger';

export type LogConsumer = Record<LogLevelsAccess, Writer>;

export type Writer = (...msgs: string[]) => void;

export type LogRecord = {
    level: LogLevels;
    message: string;
};
