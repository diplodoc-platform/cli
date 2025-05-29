export type Report = {
    code: number;
    warns: string[];
    errors: string[];
}

export interface Runner {
    runYfmDocs(argv: string[]): Promise<Report>;
}

