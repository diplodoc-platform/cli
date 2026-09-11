export type CandidateConfig = {
    /** Short name used in the table and in workdir paths. */
    name: string;
    provider: string;
    model?: string;
    apiBase?: string;
    /** Extra HTTP headers in "Name: value" format. */
    apiHeaders?: string[];
    folder?: string;
    systemPrompt?: string;
    userPrompt?: string;
    /** Name of the environment variable holding the API key. */
    authEnv?: string;
};

export type JudgeConfig = {
    model: string;
    apiBase: string;
    authEnv: string;
    /** Units per judge request. */
    batchSize?: number;
};

export type BenchConfig = {
    /** Name of the candidate every comparison is measured against. */
    baseline: string;
    judge: JudgeConfig | null;
    candidates: CandidateConfig[];
};

export type ResolvedCandidate = CandidateConfig & {auth?: string};

export type ResolvedBenchConfig = {
    baseline: string;
    judge: (JudgeConfig & {auth: string}) | null;
    candidates: ResolvedCandidate[];
};

export type VerdictCategory = 'accuracy' | 'terminology' | 'style' | 'markup';

export const VERDICT_CATEGORIES: VerdictCategory[] = ['accuracy', 'terminology', 'style', 'markup'];
