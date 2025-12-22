// src/agents/orchestrator/Orchestrator.ts
import { BaseAgent } from '../BaseAgent';
import { UserDetailsAgent } from '../userDetails/UserDetailsAgent';
import { DocumentValidatorAgent } from '../documentValidator/DocumentValidatorAgent';
import { LoanDeciderAgent } from '../loanDecider/LoanDeciderAgent';
import type { UserInput, AgentResponse, AgentContext } from '../BaseAgent';

export class Orchestrator {
    private currentAgent: BaseAgent | null = null;
    private context: AgentContext = { sessionId: 'default-session' };
    private userDetailsAgent: UserDetailsAgent;
    private documentValidatorAgent: DocumentValidatorAgent;
    private loanDeciderAgent: LoanDeciderAgent;

    constructor() {
        this.userDetailsAgent = new UserDetailsAgent();
        this.documentValidatorAgent = new DocumentValidatorAgent();
        this.loanDeciderAgent = new LoanDeciderAgent();

        this.initializeAgents();
    }

    private initializeAgents(): void {
        // Set up the chain of responsibility
        this.userDetailsAgent.setNextAgent(this.documentValidatorAgent);
        this.documentValidatorAgent.setNextAgent(this.loanDeciderAgent);

        // Start with the user details agent
        this.currentAgent = this.userDetailsAgent;
    }

    public async process(input: UserInput): Promise<AgentResponse> {
        try {
            if (!this.currentAgent) {
                // Initialize with the first agent if not set
                this.currentAgent = this.userDetailsAgent;
            }

            if (!this.currentAgent) {
                throw new Error('No agent available to handle the input');
            }

            const response = await this.currentAgent.handle(input, this.context);

            // Update context with any data from the response
            if (response.data) {
                this.context = { ...this.context, ...response.data };
            }

            // If there's a next action, transition to the appropriate agent
            if (response.data?.nextAction) {
                this.transitionTo(response.data.nextAction);
            }

            return response;
        } catch (error) {
            console.error('Error processing request:', error);
            return {
                status: 'error',
                message: 'An error occurred while processing your request',
                data: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }

    private transitionTo(agentType: string): void {
        switch (agentType) {
            case 'userDetails':
                this.currentAgent = this.userDetailsAgent;
                break;
            case 'documentValidator':
                this.currentAgent = this.documentValidatorAgent;
                break;
            case 'loanDecider':
                this.currentAgent = this.loanDeciderAgent;
                break;
            default:
                console.warn(`Unknown agent type: ${agentType}`);
        }
    }
}