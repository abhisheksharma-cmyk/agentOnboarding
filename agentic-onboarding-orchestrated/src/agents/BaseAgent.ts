import { llmConfig } from '../config/llmConfig';

export interface AgentResponse {
    status: 'success' | 'error';
    message: string;
    data?: {
        nextAction?: string;
        [key: string]: any;
    };
    nextAction?: string;
    suggestions?: string[];
    actions?: string[];
    error?: any;
};

export type UserInput = {
    type: string;
    data: any;
};

export type AgentContext = {
    sessionId?: string;
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
            error: error?.message || error
        };
    }
}
