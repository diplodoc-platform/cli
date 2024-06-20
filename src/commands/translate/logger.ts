import {LogLevel, Logger} from '~/logger';
import {gray} from 'chalk';

export class TranslateLogger extends Logger {
    readonly extract = this.topic(LogLevel.INFO, 'EXTRACT', gray);
    readonly compose = this.topic(LogLevel.INFO, 'COMPOSE', gray);
    readonly translate = this.topic(LogLevel.INFO, 'TRANSLATE', gray);
    readonly extracted = this.topic(LogLevel.INFO, 'EXTRACTED');
    readonly composed = this.topic(LogLevel.INFO, 'COMPOSED');
    readonly translated = this.topic(LogLevel.INFO, 'TRANSLATED');
    readonly stat = this.topic(LogLevel.INFO, 'PROCESSED');

    readonly _skipped = this.topic(LogLevel.INFO, 'SKIPPED', gray);
    skipped(skipped: [string, string][]) {
        const length =
            skipped.reduce((max, [reason]) => {
                return Math.max(max, reason.length);
            }, 0) + 2;
        const arrange = (string: string) => string + ' '.repeat(length - string.length);

        for (const [reason, file] of skipped) {
            this._skipped(arrange('[' + reason + ']'), file);
        }
    }
}
