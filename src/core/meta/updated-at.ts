const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME =
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/i;

export function normalizeUpdatedAt(value: unknown): string | undefined {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value.toISOString() : undefined;
    }

    if (typeof value !== 'string' || (!DATE_ONLY.test(value) && !DATE_TIME.test(value))) {
        return undefined;
    }

    const day = value.slice(0, 10);
    const date = new Date(day);

    if (
        Number.isFinite(date.getTime()) &&
        date.toISOString().startsWith(day + 'T') &&
        Number.isFinite(Date.parse(value))
    ) {
        return value;
    }

    return undefined;
}
