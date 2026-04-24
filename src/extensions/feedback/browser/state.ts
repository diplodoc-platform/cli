const SUBMISSION_COOLDOWN = 7000;

let lastSubmissionTime = 0;

export function canSubmit(): boolean {
    return Date.now() - lastSubmissionTime >= SUBMISSION_COOLDOWN;
}

export function markSubmitted(): void {
    lastSubmissionTime = Date.now();
}
