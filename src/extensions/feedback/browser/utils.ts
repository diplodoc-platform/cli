declare global {
    interface Window {
        ym?: (counterId: number, type: string, goal: string) => void;
    }
}

export type FeedbackMetrika = {
    counterId: number;
    goals?: {
        button?: string;
        submit?: string;
        cancel?: string;
    };
};

export type FeedbackOptions = {
    customFormEndpoint?: string;
    metrika?: FeedbackMetrika;
};

const DEFAULT_GOALS = {
    button: 'selection-feedback-button',
    submit: 'selection-submit',
    cancel: 'selection-cancel',
} as const;

export function reachGoal(options: FeedbackOptions, key: keyof typeof DEFAULT_GOALS): void {
    const metrika = options.metrika;
    if (!metrika?.counterId) return;
    const goal = metrika.goals?.[key] ?? DEFAULT_GOALS[key];
    window.ym?.(metrika.counterId, 'reachGoal', goal);
}

export async function sendData<T extends object>(endpoint: string, payload: T): Promise<Response> {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
    }

    return response;
}

export function sanitizeInput(text: unknown): string {
    if (typeof text !== 'string') return '';

    return text
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .substring(0, 5000);
}
