import { llmConfig } from '../config/llmConfig';

export type AgentResponse = {
    status: 'success' | 'error';
    message: string;
    data?: {
        nextAction?: string;
        [key: string]: any;
    };
    suggestions?: string[];
    actions?: string[];
};

export type UserInput = {
    type: string;
    data: any;
};

export type AgentContext = {
    sessionId: string;
    userData?: any;
    [key: string]: any;
};

export abstract class BaseAgent {
    protected llmConfig = llmConfig;
    abstract handle(input: UserInput, context: AgentContext): Promise<AgentResponse>;

    protected createSuccessResponse(message: string, data?: any): AgentResponse {
        return {
            status: 'success',
            message,
            data
        };
    }

    protected createErrorResponse(message: string, error?: any): AgentResponse {
        return {
            status: 'error',
            message,
            data: error
        };
    }
}
