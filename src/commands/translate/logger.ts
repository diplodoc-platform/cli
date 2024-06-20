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
        for (const [reason, file] of skipped) {
            this._skipped('[' + reason + ' filter]', file);
        }
    }
}
