import OpenAI from 'openai';
import { llmConfig } from '../config/llmConfig';

export function createLLMClient() {
    return new OpenAI({
        apiKey: llmConfig.groq.apiKey,
        baseURL: llmConfig.groq.baseURL,
    });
}

export const llmClient = createLLMClient();
