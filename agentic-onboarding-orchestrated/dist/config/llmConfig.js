"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmConfig = void 0;
// src/config/llmConfig.ts
exports.llmConfig = {
    groq: {
        apiKey: process.env.GROQ_API_KEY || '',
        defaultModel: 'mixtral-8x7b-32768',
        baseURL: 'https://api.groq.com/openai/v1',
        temperature: 0.7,
        maxTokens: 2000
    }
};
