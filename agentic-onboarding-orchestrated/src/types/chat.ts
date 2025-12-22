
export interface ChatMessage {
    id: string;
    content: string;
    sender: 'user' | 'assistant' | 'system';
    type: 'text' | 'question' | 'input' | 'document' | 'suggestion';
    field?: string;  // Which field this message is related to
    options?: string[];  // For multiple choice options
    timestamp: Date;
}