export class InsecureAccessError extends Error {
    readonly path: AbsolutePath;

    readonly realpath: AbsolutePath;

    constructor(file: AbsolutePath, realpath: AbsolutePath, scopes?: AbsolutePath[]) {
        const message = [
            `Requested file '${file}' is out of project scope.`,
            realpath && 'File resolved to:\n\t' + realpath,
            scopes && 'Allowed scopes:\n\t' + scopes.join('\n\t'),
        ]
            .filter(Boolean)
            .join('\n');

        super(message);

        this.path = file;
        this.realpath = realpath;
    }
}
