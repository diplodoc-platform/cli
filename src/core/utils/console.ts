import {Console} from 'node:console';

class MutableConsole extends Console {
    log(...args: unknown[]) {
        this.write('log', args);
    }

    time(label: string) {
        if (process.env.NODE_ENV !== 'test') {
            super.time(label);
        }
    }

    timeEnd(label: string) {
        if (process.env.NODE_ENV !== 'test') {
            super.timeEnd(label);
        }
    }

    private write(level: 'log' | 'error' | 'warn', args: unknown[]) {
        if (process.env.NODE_ENV !== 'test') {
            super[level](...args);
        }
    }
}

const _console = new MutableConsole(process.stdout, process.stderr, false);

export {_console as console};
