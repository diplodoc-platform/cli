export type FragmentWarning = {
    message: string;
};

export type SelectedFragment = {
    content: string;
    warnings: FragmentWarning[];
};

export class CodeRangeError extends Error {}

export function selectCodeFragment(source: string, lines?: string): SelectedFragment {
    const normalized = source.replace(/\r\n?/g, '\n');

    if (!lines) {
        return {content: normalized, warnings: []};
    }

    if (/^\d+(?:-\d+)?$/.test(lines)) {
        return selectNumericRange(normalized, lines);
    }

    return selectMarkerRange(normalized, lines);
}

export function removeCommonIndent(content: string) {
    const sourceLines = content.split('\n');
    const indents = sourceLines
        .filter((line) => line.trim().length > 0)
        .map((line) => /^\s*/.exec(line)?.[0].length || 0);
    const commonIndent = indents.length ? Math.min(...indents) : 0;

    if (!commonIndent) {
        return content;
    }

    return sourceLines
        .map((line) => (line.trim().length ? line.slice(commonIndent) : ''))
        .join('\n');
}

function selectNumericRange(source: string, range: string): SelectedFragment {
    const [rawStart, rawEnd = rawStart] = range.split('-');
    const start = Number(rawStart);
    const end = Number(rawEnd);
    const sourceLines = source.split('\n');
    const lineCount = source.endsWith('\n') ? sourceLines.length - 1 : sourceLines.length;

    if (start < 1 || end < start || end > lineCount) {
        throw new CodeRangeError(
            `invalid line range "${range}" for a file with ${lineCount} lines`,
        );
    }

    return {
        content: sourceLines.slice(start - 1, end).join('\n'),
        warnings: [],
    };
}

function selectMarkerRange(source: string, markers: string): SelectedFragment {
    const separator = markers.indexOf('-');
    const hasEndMarker = separator >= 0;
    const startMarker = hasEndMarker ? markers.slice(0, separator) : markers;
    const endMarker = hasEndMarker ? markers.slice(separator + 1) : '';
    const sourceLines = source.split('\n');
    const warnings: FragmentWarning[] = [];
    const startLine = sourceLines.findIndex((line) => line.includes(startMarker));

    if (startLine < 0) {
        warnings.push({
            message: `start marker "${startMarker}" was not found; using the beginning of the file`,
        });
    }

    // A single marker (no "-" separator) selects from the start marker to the
    // end of the file. Without this guard `line.includes("")` would match the
    // very first line and silently produce an empty fragment.
    if (!hasEndMarker) {
        const start = startLine < 0 ? 0 : startLine + 1;
        return {content: sourceLines.slice(start).join('\n'), warnings};
    }

    const endLine = sourceLines.findIndex((line) => line.includes(endMarker));

    if (endLine < 0) {
        warnings.push({
            message: `end marker "${endMarker}" was not found; using the end of the file`,
        });
    }
    if (startLine >= 0 && endLine >= 0 && endLine <= startLine) {
        warnings.push({
            message: `end marker "${endMarker}" occurs before start marker "${startMarker}"; the fragment is empty`,
        });
        return {content: '', warnings};
    }

    const start = startLine < 0 ? 0 : startLine + 1;
    const end = endLine < 0 ? sourceLines.length : endLine;

    return {
        content: sourceLines.slice(start, end).join('\n'),
        warnings,
    };
}
