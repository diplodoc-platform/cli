import type {FeedbackOptions} from './utils';

import {initSelection} from './forms/selection';
import {setFeedbackOptions} from './config';

declare global {
    interface Window {
        feedbackExtensionInit: (options: FeedbackOptions) => void;
        __feedbackInitialized__?: boolean;
    }
}

window.feedbackExtensionInit = (options) => {
    if (window.__feedbackInitialized__) return;
    window.__feedbackInitialized__ = true;

    setFeedbackOptions(options);
    initSelection(options);
};
