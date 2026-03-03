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
    // Additional properties for KYC agent
    proposal?: 'approve' | 'deny' | 'escalate';
    confidence?: number;
    reasons?: string[];
    policy_refs?: string[];
    flags?: Record<string, boolean>;
    metadata?: Record<string, any>;
}

export interface Agent {
    name: string;
    description?: string;
    endpoints?: Array<{
        method: 'get' | 'post' | 'put' | 'delete' | 'patch';
        path: string;
        handler: Function | Function[];
    }>;
    handle(input: UserInput, context: AgentContext): Promise<AgentResponse>;
    setNextAgent?(agent: Agent): void;
}
