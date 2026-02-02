const originalEmitWarning = process.emitWarning;

process.emitWarning = (warning, options) => {
    if (typeof warning === 'object' && warning.name === 'MaxListenersExceededWarning') {
        return;
    }

    return originalEmitWarning.call(process, warning, options as NodeJS.EmitWarningOptions);
};

const originalStderrWrite = process.stderr.write;

process.stderr.write = (warning, ...args) => {
    if (
        warning
            .toString()
            .includes('React does not recognize the `fetchPriority` prop on a DOM element.') ||
        // We need to hide warnings from Gravity UI themer
        // because uikit-themer doesn't support some variables
        // For example:
        // --g-text-accent-font-weight
        // --g-text-body-1-font
        // --g-text-body-short-font
        // --g-text-caption-1-font
        // --g-text-display-1-font
        // --g-text-code-1-font
        // --g-spacing-base
        // --g-scrollbar-width
        warning.toString().includes("Can't parse text variable") ||
        warning.toString().includes('Unsupported css variable')
    ) {
        return true;
    }

    return originalStderrWrite.apply(process.stderr, [warning, ...(args as [])]);
};
