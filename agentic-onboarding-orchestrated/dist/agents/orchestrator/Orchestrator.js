"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Orchestrator = void 0;
const UserDetailsAgent_1 = require("../userDetails/UserDetailsAgent");
const DocumentValidatorAgent_1 = require("../documentValidator/DocumentValidatorAgent");
const LoanDeciderAgent_1 = require("../loanDecider/LoanDeciderAgent");
class Orchestrator {
    constructor() {
        this.currentAgent = null;
        this.context = { sessionId: 'default-session' };
        this.userDetailsAgent = new UserDetailsAgent_1.UserDetailsAgent();
        this.documentValidatorAgent = new DocumentValidatorAgent_1.DocumentValidatorAgent();
        this.loanDeciderAgent = new LoanDeciderAgent_1.LoanDeciderAgent();
        this.initializeAgents();
    }
    initializeAgents() {
        // Set up the chain of responsibility
        this.userDetailsAgent.setNextAgent(this.documentValidatorAgent);
        this.documentValidatorAgent.setNextAgent(this.loanDeciderAgent);
        // Start with the user details agent
        this.currentAgent = this.userDetailsAgent;
    }
    async process(input) {
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
        }
        catch (error) {
            console.error('Error processing request:', error);
            return {
                status: 'error',
                message: 'An error occurred while processing your request',
                data: { error: error instanceof Error ? error.message : 'Unknown error' }
            };
        }
    }
    transitionTo(agentType) {
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
exports.Orchestrator = Orchestrator;
