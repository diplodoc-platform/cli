export class InsecureAccessError extends Error {
    readonly realpath: AbsolutePath;

    readonly realstack: AbsolutePath[];

    constructor(file: AbsolutePath, stack?: AbsolutePath[]) {
        const message = [
            `Requested file '${file}' is out of project scope.`,
            stack && 'File resolution stack:\n\t' + stack.join('\n\t'),
        ]
            .filter(Boolean)
            .join('\n');

        super(message);

        this.realpath = file;
        this.realstack = stack || [];
    }
}