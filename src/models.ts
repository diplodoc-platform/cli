export type Audience = 'internal'|'external';

export type YfmPreset = Record<string, string>;

export interface YfmOptions {
    allowHTML: boolean;
}

export interface YfmConfig {
    audience: Audience;
    options: YfmOptions,
    plugins: string[];
    ignore: string[];
    outputFormat: string;
    vars: Record<string, string>;
}

export interface YfmArgv extends YfmConfig {
    input: string;
    output: string;
}

export interface DocPreset {
    default: YfmPreset;
    [audience: string]: YfmPreset;
}
