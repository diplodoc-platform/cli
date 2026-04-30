export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = {
    role: ChatRole;
    content: string;
};

export type CompletionOptions = {
    temperature: number;
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
    complete(messages: ChatMessage[], options: CompletionOptions): Promise<CompletionResult>;
}
