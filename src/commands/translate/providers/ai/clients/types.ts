export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
    role: ChatRole;
    content: string;
};

export type CompletionOptions = {
    /** Left out of the request when undefined. */
    temperature?: number;
    maxTokens: number;
};

export type CompletionUsage = {
    inputTokens: number;
    outputTokens: number;
};

export type CompletionResult = {
    text: string;
    usage?: CompletionUsage;
};

export interface LLMClient {
    readonly name: string;
    /** True after the API refused `temperature` and the client stopped sending it. */
    readonly temperatureDropped?: boolean;
    complete(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult>;
}
