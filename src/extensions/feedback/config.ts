import {ok} from 'node:assert';

import {option} from '@diplodoc/cli/lib/config';

export const NAME = 'TextFeedback';

const textFeedback = option({
    flags: '--text-feedback <string>',
    desc: `
        Enable text selection feedback form.
        Provide an endpoint URL to receive feedback submissions.

        Example:
          {{PROGRAM}} build -i . -o ../build --text-feedback https://example.com/feedback
    `,
});

export const options = {
    textFeedback,
};

export type TextFeedbackMetrika = {
    /** Yandex Metrica counter ID */
    counterId: number;
    goals?: {
        /** Goal name fired when the floating feedback button is clicked. Default: 'selection-feedback-button' */
        button?: string;
        /** Goal name fired when the Submit button is clicked. Default: 'selection-submit' */
        submit?: string;
        /** Goal name fired when the Cancel button is clicked. Default: 'selection-cancel' */
        cancel?: string;
    };
};

export type TextFeedbackObject = {
    endpoint: string;
    metrika?: TextFeedbackMetrika;
};

/**
 * Short form  — just the endpoint URL:
 *   textFeedback: https://example.com/feedback
 *
 * Full form — with Yandex Metrica counters:
 *   textFeedback:
 *     endpoint: https://example.com/feedback
 *     metrika:
 *       counterId: 12345678
 *       goals:
 *         button: my-feedback-button
 *         submit: my-submit
 *         cancel: my-cancel
 */
export type Config = {
    textFeedback?: string | TextFeedbackObject;
};

export type Args = {
    textFeedback?: string;
};

/** Normalise any allowed config form into a resolved object */
export function resolveTextFeedback(
    value: string | TextFeedbackObject | undefined,
): TextFeedbackObject | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return {endpoint: value};
    return value;
}

/** Validate the resolved config object; throws AssertionError on invalid input */
export function validateConfig(value: string | TextFeedbackObject | undefined): void {
    const resolved = resolveTextFeedback(value);
    if (!resolved) return;

    ok(
        typeof resolved.endpoint === 'string' && resolved.endpoint.trim() !== '',
        '[TextFeedback] textFeedback.endpoint must be a non-empty string',
    );

    if (resolved.metrika !== undefined) {
        ok(
            typeof resolved.metrika.counterId === 'number' &&
                Number.isInteger(resolved.metrika.counterId) &&
                resolved.metrika.counterId > 0,
            '[TextFeedback] textFeedback.metrika.counterId must be a positive integer',
        );
    }
}
