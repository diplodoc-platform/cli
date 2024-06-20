export class TranslateError extends Error {
    code: string;

    fatal: boolean;

    constructor(message: string, code: string, fatal = false) {
        super(message);

        this.code = code;
        this.fatal = fatal;
    }
}

export class ExtractError extends TranslateError {
    constructor(error: Error) {
        super(error?.message || String(error), 'EXTRACT_ERROR');
    }
}

export class ComposeError extends TranslateError {
    constructor(error: Error) {
        super(error?.message || String(error), 'COMPOSE_ERROR');
    }
}

export class SkipTranslation extends TranslateError {
    reason: string;

    constructor(code: string, reason: string) {
        super('Skip file translation.', code);

        this.reason = reason;
    }
}

export class EmptyTokensError extends SkipTranslation {
    constructor() {
        super('EMPTY_TOKENS', 'notokens');
    }
}
