const originalEmitWarning = process.emitWarning;

process.emitWarning = (warning, options) => {
    if (typeof warning === 'object' && warning.name === 'MaxListenersExceededWarning') {
        return;
    }

    return originalEmitWarning.call(process, warning, options as NodeJS.EmitWarningOptions);
};
