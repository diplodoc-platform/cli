/* eslint-disable no-console */

class MutableConsole {
    log(...args: unknown[]) {
        this.write('log', args);
    }

    warn(...args: unknown[]) {
        console.warn(...args);
    }

    error(...args: unknown[]) {
        console.error(...args);
    }

    time(label: string) {
        if (process.env.NODE_ENV !== 'test') {
            console.time(label);
        }
    }

    timeEnd(label: string) {
        if (process.env.NODE_ENV !== 'test') {
            console.timeEnd(label);
        }
    }

    private write(level: 'log' | 'error' | 'warn', args: unknown[]) {
        if (process.env.NODE_ENV !== 'test') {
            console[level](...args);
        }
    }
}

const _console = new MutableConsole();

export {_console as console};
