import {showPopup} from '../popup';
import {canSubmit, markSubmitted} from '../state';
import {reachGoal, sanitizeInput, sendData} from '../utils';
import {getFeedbackOptions} from '../config';

import {CustomFormSuggestionEnum} from './enums';

let formEl: HTMLDivElement | null = null;
let selectedText = '';

const formStyles: Record<string, string> = {
    position: 'fixed',
    background: 'var(--g-color-base-background)',
    padding: '15px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    zIndex: '10000',
    minWidth: '300px',
    maxWidth: '400px',
    display: 'none',
    touchAction: 'manipulation',
};

/**
 * ===== PUBLIC API =====
 */
export function showSelectionForm(text: string): void {
    selectedText = text;

    if (!formEl) {
        formEl = createForm();
    }

    const textDisplay = formEl.querySelector('#selected-text-display') as HTMLElement | null;

    if (textDisplay) {
        textDisplay.textContent = `"${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`;
    }

    resetForm();
    positionForm();
    formEl.style.display = 'block';
}

/**
 * ===== INTERNALS =====
 */

function createForm(): HTMLDivElement {
    const form = document.createElement('div');
    form.id = 'selection-feedback-form';
    Object.assign(form.style, formStyles);

    form.innerHTML = `
        <p style="margin: 0 0 10px 0; font-size: 12px; background: var(--g-color-base-background); padding: 8px;">
            <strong>Обратная связь к тексту:</strong>
            <span id="selected-text-display"></span>
        </p>

        <div style="margin: 0 0 15px 0;">
            <div style="font-size: 12px; font-weight: bold; margin-bottom: 8px;">Проблема:</div>
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="issue" value="typo" style="margin: 0;">
                    <span>Опечатка в тексте</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="issue" value="non_relevant" style="margin: 0;">
                    <span>Некорректная/неактуальная информация</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="issue" value="no_example" style="margin: 0;">
                    <span>Не хватает примера</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="issue" value="bad_graphics" style="margin: 0;">
                    <span>Низкое качество графики</span>
                </label>
                <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                    <input type="radio" name="issue" value="another" style="margin: 0;">
                    <span>Другое</span>
                </label>
            </div>
        </div>

        <textarea id="selection-comment" placeholder="Комментарий..."
                style="width: 100%; height: 80px; margin: 8px 0 4px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
        <textarea id="selection-contact" placeholder="Контакт (Необязательное)"
                style="width: 100%; height: 30px; margin: 8px 0 4px 0; padding: 8px; border: 1px solid #ddd; border-radius: 4px; resize: vertical;"></textarea>
        <div id="comment-error" style="color: var(--g-color-base-brand); font-size: 12px; margin-bottom: 10px; min-height: 16px; display: none;"></div>
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button id="selection-cancel" type="button" class="g-button g-button_view_normal g-button_size_m g-button_pin_round-round">Отмена</button>
            <button id="selection-submit" type="button" class="g-button g-button_view_action g-button_size_m g-button_pin_round-round">Отправить</button>
        </div>
    `;

    form.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;

        if (target.id === 'selection-cancel' || target.closest('#selection-cancel')) {
            e.stopPropagation();
            reachGoal(getFeedbackOptions(), 'cancel');
            hideForm();
        } else if (target.id === 'selection-submit' || target.closest('#selection-submit')) {
            e.stopPropagation();
            reachGoal(getFeedbackOptions(), 'submit');
            handleSubmit().catch(() => {});
        }
    });

    form.addEventListener('input', (e) => {
        const target = e.target as HTMLTextAreaElement;
        if (target.id === 'selection-comment') {
            target.style.borderColor = '#ddd';
            target.placeholder = 'Комментарий...';

            const errorElement = document.getElementById('comment-error');
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }
        }
    });

    setTimeout(() => {
        document.addEventListener('click', (e) => {
            if (formEl && formEl.style.display === 'block' && !formEl.contains(e.target as Node)) {
                hideForm();
            }
        });
    }, 0);

    document.body.appendChild(form);
    return form;
}

async function handleSubmit(): Promise<void> {
    const options = getFeedbackOptions();

    if (!options.customFormEndpoint) {
        showPopup('Функция обратной связи для выделенного текста не настроена', 'error');
        return;
    }

    if (!canSubmit()) {
        showPopup('Пожалуйста, подождите перед повторной отправкой', 'error');
        return;
    }

    const issue = formEl!.querySelector<HTMLInputElement>('input[name="issue"]:checked');
    const commentEl = formEl!.querySelector<HTMLTextAreaElement>('#selection-comment');
    const contactEl = formEl!.querySelector<HTMLTextAreaElement>('#selection-contact');
    const errorEl = formEl!.querySelector<HTMLDivElement>('#comment-error');

    if (!issue) {
        showPopup('Пожалуйста, выберите вариант ответа', 'error');
        return;
    }

    const comment = sanitizeInput(commentEl?.value ?? '');
    const contact = sanitizeInput(contactEl?.value ?? '');
    const issueValue = issue.value as CustomFormSuggestionEnum;

    const requiresComment = [
        CustomFormSuggestionEnum.ANOTHER,
        CustomFormSuggestionEnum.NON_RELEVANT,
        CustomFormSuggestionEnum.NO_EXAMPLE,
    ].includes(issueValue);

    if (requiresComment && !comment) {
        if (errorEl) {
            errorEl.textContent = 'Пожалуйста, заполните это поле! *';
            errorEl.style.display = 'block';
        }
        if (commentEl) {
            commentEl.style.borderColor = 'var(--g-color-base-brand)';
            commentEl.style.boxShadow = '0 0 0 1px var(--g-color-base-brand)';
            commentEl.focus();
        }
        return;
    }

    if (comment && comment.length < 5) {
        if (errorEl) {
            errorEl.textContent = 'Комментарий должен содержать не менее 5 символов';
            errorEl.style.display = 'block';
        }
        if (commentEl) {
            commentEl.focus();
        }
        return;
    }

    try {
        await sendData(options.customFormEndpoint, {
            url: location.href,
            title: document.title,
            suggestion: issueValue,
            selected_text: sanitizeInput(selectedText),
            comment,
            contact,
        });

        markSubmitted();
        hideForm();
        showPopup('Спасибо за отзыв!');
    } catch {
        showPopup('Не удалось отправить отзыв', 'error');
    }
}

function resetForm(): void {
    if (!formEl) return;

    const commentEl = formEl.querySelector<HTMLTextAreaElement>('#selection-comment');
    const errorEl = formEl.querySelector<HTMLDivElement>('#comment-error');

    if (commentEl) {
        commentEl.value = '';
        commentEl.placeholder = 'Комментарий...';
        commentEl.style.borderColor = '#ddd';
        commentEl.style.boxShadow = 'none';
    }

    if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
    }

    formEl.querySelectorAll<HTMLInputElement>('input[name="issue"]').forEach((r) => {
        r.checked = false;
    });
}

function hideForm(): void {
    if (formEl) {
        formEl.style.display = 'none';
    }
    window.getSelection()?.removeAllRanges();
}

function positionForm(): void {
    if (!formEl) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
        Object.assign(formEl.style, {
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

    const elementWidth = 350;
    const elementHeight = 350;

    let left = rect.left + 5;
    let top = rect.bottom + 5;

    if (left + elementWidth > viewport.width) {
        left = Math.max(5, rect.left - elementWidth - 5);
    }

    if (top + elementHeight > viewport.height) {
        top = Math.max(5, rect.top - elementHeight - 5);
    }

    if (window.innerWidth <= 768) {
        Object.assign(formEl.style, {
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            minWidth: '280px',
            maxWidth: '90vw',
        });
        return;
    }

    Object.assign(formEl.style, {
        left: Math.max(5, Math.min(left, viewport.width - elementWidth - 5)) + 'px',
        top: Math.max(5, Math.min(top, viewport.height - elementHeight - 5)) + 'px',
        transform: 'none',
    });
}
