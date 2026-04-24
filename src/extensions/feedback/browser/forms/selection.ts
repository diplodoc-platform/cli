import type {FeedbackOptions} from '../utils';

import {reachGoal} from '../utils';
import {getFeedbackOptions} from '../config';

import {showSelectionForm} from './custom-form';

let currentSelectedText = '';
let isButtonVisible = false;
let buttonTimeout: number | null = null;
let feedbackButton: HTMLDivElement | null = null;

const buttonTemplate = `
<button type="button"
    title="Оставить отзыв о тексте"
    style="
        display:flex;
        align-items:center;
        justify-content:center;
        width:36px;
        height:36px;
        border-radius:50%;
        border:none;
        background:var(--g-color-base-brand,#027bf3);
        color:#fff;
        cursor:pointer;
        padding:0;
        box-shadow:0 2px 8px rgba(0,0,0,0.2);
    ">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
        <path fill-rule="evenodd" d="M10 9.5h.621l.44.44 1.51 1.51a.174.174 0 0 0 .295-.136l-.112-1.454-.062-.809.642-.495C14.037 8.016 14.5 7.211 14.5 6c0-1.214-.465-2.019-1.17-2.56-.754-.578-1.902-.94-3.33-.94s-2.576.362-3.33.94C5.966 3.98 5.5 4.786 5.5 6s.465 2.019 1.17 2.56c.754.578 1.902.94 3.33.94m.52 2.02.99.99a1.673 1.673 0 0 0 2.851-1.312l-.111-1.453C15.33 8.91 16 7.663 16 6c0-3.333-2.686-5-6-5-2.127 0-3.995.687-5.06 2.06C2.131 3.384 0 5.03 0 8c0 1.663.669 2.911 1.75 3.745l-.111 1.453A1.673 1.673 0 0 0 4.49 14.51L6 13c1.803 0 3.42-.493 4.52-1.48M4.143 4.736Q4.001 5.32 4 6c0 2.905 2.04 4.544 4.759 4.918-.717.366-1.654.582-2.759.582h-.621l-.44.44-1.51 1.51a.174.174 0 0 1-.295-.136l.112-1.454.062-.809-.642-.495C1.963 10.016 1.5 9.211 1.5 8c0-1.214.465-2.019 1.17-2.56.391-.3.887-.541 1.473-.704" clip-rule="evenodd"/>
    </svg>
</button>
`;

const buttonStyles: Record<string, string> = {
    position: 'fixed',
    padding: '0',
    zIndex: '10000',
    display: 'none',
    touchAction: 'manipulation',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
};

function clearButtonTimer() {
    if (buttonTimeout) {
        clearTimeout(buttonTimeout);
        buttonTimeout = null;
    }
}

function isSelectionInContentArea(selection: Selection): boolean {
    const contentArea = document.querySelector('.dc-doc-page__content');
    if (!contentArea || selection.rangeCount === 0) {
        return false;
    }

    const range = selection.getRangeAt(0);
    const selectedNode = range.commonAncestorContainer;

    return contentArea.contains(selectedNode);
}

function positionElementNearSelection(element: HTMLElement, isForm = false): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        Object.assign(element.style, {
            left: '50%',
            top: '40%',
            transform: 'translate(-50%, -50%)',
        });
        return;
    }

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
    };

    const elementWidth = isForm ? 350 : 40;
    const elementHeight = isForm ? 350 : 40;

    let left = rect.left + 5;
    let top = rect.bottom + 5;

    if (left + elementWidth > viewport.width) {
        left = Math.max(5, rect.left - elementWidth - 5);
    }

    if (top + elementHeight > viewport.height) {
        top = Math.max(5, rect.top - elementHeight - 5);
    }

    if (window.innerWidth <= 768) {
        if (isForm) {
            Object.assign(element.style, {
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
            });
            return;
        } else {
            top = Math.min(top, viewport.height - elementHeight - 10);
            left = Math.min(left, viewport.width - elementWidth - 10);
        }
    }

    Object.assign(element.style, {
        left: Math.max(5, Math.min(left, viewport.width - elementWidth - 5)) + 'px',
        top: Math.max(5, Math.min(top, viewport.height - elementHeight - 5)) + 'px',
        transform: 'none',
    });
}

function createButton(): HTMLDivElement {
    if (feedbackButton) return feedbackButton;

    const wrapper = document.createElement('div');
    wrapper.id = 'selection-feedback-button';
    Object.assign(wrapper.style, buttonStyles);
    wrapper.innerHTML = buttonTemplate;

    wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        reachGoal(getFeedbackOptions(), 'button');
        hideButton();
        showSelectionForm(currentSelectedText);
    });

    document.body.appendChild(wrapper);
    feedbackButton = wrapper;
    return wrapper;
}

function showButton(text: string) {
    if (!isSelectionInContentArea(window.getSelection()!)) {
        hideButton();
        return;
    }

    currentSelectedText = text;

    if (isButtonVisible) {
        positionElementNearSelection(feedbackButton!, false);
        return;
    }

    const btn = createButton();
    positionElementNearSelection(btn, false);
    btn.style.display = 'block';

    isButtonVisible = true;
    clearButtonTimer();

    buttonTimeout = window.setTimeout(hideButton, 5000);
}

function hideButton() {
    if (feedbackButton) {
        feedbackButton.style.display = 'none';
    }
    isButtonVisible = false;
    clearButtonTimer();
}

function isTouchDevice(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export function initSelection(_options: FeedbackOptions): void {
    let debounceTimer: number | null = null;
    let lastText = '';

    function handleSelection() {
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = window.setTimeout(
            () => {
                const sel = window.getSelection();
                const text = sel?.toString().trim() ?? '';

                if (!text || text.length < 5) {
                    lastText = '';
                    hideButton();
                    return;
                }

                if (text === lastText) return;
                lastText = text;

                showButton(text);
            },
            isTouchDevice() ? 80 : 0,
        );
    }

    document.addEventListener('mouseup', handleSelection);
    document.addEventListener('touchend', handleSelection);

    if (!isTouchDevice()) {
        document.addEventListener('selectionchange', handleSelection);
    }
}
