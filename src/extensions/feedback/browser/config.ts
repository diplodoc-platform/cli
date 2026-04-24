import type {FeedbackOptions} from './utils';

let options: FeedbackOptions | null = null;

export function setFeedbackOptions(value: FeedbackOptions): void {
    options = value;
}

export function getFeedbackOptions(): FeedbackOptions {
    if (!options) {
        throw new Error('Feedback options are not initialized');
    }
    return options;
}
