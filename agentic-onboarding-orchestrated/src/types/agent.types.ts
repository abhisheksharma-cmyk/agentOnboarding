export type AgentType = 'documentValidator' | 'userDetails' | 'loanDecider';

export interface AgentContext {
    userData?: {
        documents?: Array<{ type: string }>;
        [key: string]: any;
    };
    [key: string]: any;
}

export interface UserInput {
    type: string;
    content: any;
    [key: string]: any;
}

export interface AgentResponse {
    success: boolean;
    message: string;
    data?: any;
    nextAction?: string;
    suggestions?: string[];
    actions?: string[];
}

export interface Agent {
    handle(input: UserInput, context: AgentContext): Promise<AgentResponse>;
    setNextAgent(agent: Agent): void;
}
