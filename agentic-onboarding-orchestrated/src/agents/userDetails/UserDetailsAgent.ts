import { BaseAgent, type UserInput, type AgentContext, type AgentResponse } from '../BaseAgent';

export class UserDetailsAgent extends BaseAgent {
    private nextAgent?: BaseAgent;

    setNextAgent(agent: BaseAgent): void {
        this.nextAgent = agent;
    }

    async handle(input: UserInput, context: AgentContext): Promise<AgentResponse> {
        // Implementation for handling user details
        return this.createSuccessResponse('User details processed', {
            nextAction: 'documentValidator'
        });
    }
}
