export type PopupType = 'info' | 'error';

export function showPopup(message: string, type: PopupType = 'info'): void {
    const existing = document.getElementById('simple-feedback-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'simple-feedback-popup';

    popup.innerHTML = `
        <div style="
            padding:15px;
            border-radius:8px;
            background:var(--g-color-base-background);
            box-shadow:0 4px 20px rgba(0,0,0,.15);
            min-width:250px;
            border:1px solid #ccc;">
            <div style="font-weight:bold;margin-bottom:8px">
                ${type === 'error' ? 'Ошибка' : 'Спасибо!'}
            </div>
            <div>${message}</div>
        </div>
    `;

    Object.assign(popup.style, {
        position: 'fixed',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%,-50%)',
        zIndex: '10001',
    });

    document.body.appendChild(popup);

    setTimeout(() => popup.remove(), 3000);
}
