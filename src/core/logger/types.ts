import type {LogLevels, LogLevelsAccess, StandardLogLevelsAccess} from './logger';

export type LogConsumer = Record<StandardLogLevelsAccess, Writer> &
    Partial<Record<LogLevelsAccess, Writer>>;

export type Writer = (...msgs: string[]) => void;

export type LogRecord = {
    level: LogLevels;
    message: string;
};
