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
        warning.toString().includes("Can't parse text variable") ||
        warning.toString().includes('Unsupported css variable')
    ) {
        return true;
    }

    return originalStderrWrite.apply(process.stderr, [warning, ...(args as [])]);
};
