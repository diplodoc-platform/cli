export type MarkupViolation = {
    /** Violation kind, e.g. `fence-content`, `liquid-sequence`, `link-targets`. */
    type: string;
    /** Human-readable details: what diverged and where. */
    detail: string;
};

export type GlossaryViolation = {
    sourceText: string;
    translatedText: string;
    /** How many times the source term occurs in the source page. */
    sourceOccurrences: number;
};

export type UntranslatedLine = {
    /** 1-based line number in the translated page. */
    line: number;
    /** Trimmed line text, truncated for readability. */
    text: string;
};

export type PageResult = {
    /** Corpus-relative page path without the language prefix, e.g. `syntax/code.md`. */
    page: string;
    markupViolations: MarkupViolation[];
    glossaryViolations: GlossaryViolation[];
    untranslated: UntranslatedLine[];
    /** Token-level F1 similarity against the reference translation, 0..1. */
    similarity: number;
    /** Judge segments below the threshold that belong to this page. */
    judgeLow: number;
};

export type JudgeSummary = {
    /** Model that produced the scores. */
    model: string;
    threshold: number;
    scored: number;
    averageScore: number;
    low: number;
    skippedPairs: number;
};

export type EvalThresholds = {
    maxMarkupViolations: number;
    maxGlossaryViolations: number;
    maxUntranslated: number;
    /** Minimal acceptable judge average score, 0 disables the gate. */
    minJudgeScore: number;
    /** Minimal acceptable per-page similarity, 0 disables the gate. */
    minSimilarity: number;
};

export type EvalReport = {
    corpus: string;
    sourceLanguage: string;
    targetLanguage: string;
    mode: 'mock' | 'real';
    model: string;
    pages: PageResult[];
    judge: JudgeSummary | null;
    thresholds: EvalThresholds;
    /** Threshold failures; empty means the run passed. */
    failures: string[];
    passed: boolean;
};

export type GlossaryPair = {
    sourceText: string;
    translatedText: string;
};
