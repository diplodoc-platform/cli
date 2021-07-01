import shell from 'shelljs';

export function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        shell.exec(command, {async: true}, (code: number, stdout: string, stderr: string) => {
            if (code === 1 || code === 0) {
                resolve(stdout);
            } else {
                reject(stderr);
            }
        });
    });
}
