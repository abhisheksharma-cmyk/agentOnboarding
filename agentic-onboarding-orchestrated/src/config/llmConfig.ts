// src/config/llmConfig.ts
export const llmConfig = {
    groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        defaultModel: 'mixtral-8x7b-32768',
        baseURL: 'https://api.groq.com/openai/v1',
        temperature: 0.7,
        maxTokens: 2000
    }
} as const;

export type LLMConfig = typeof llmConfig;
