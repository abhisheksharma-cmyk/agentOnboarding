"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserDetailsAgent = void 0;
const BaseAgent_1 = require("../BaseAgent");
class UserDetailsAgent extends BaseAgent_1.BaseAgent {
    setNextAgent(agent) {
        this.nextAgent = agent;
    }
    async handle(input, context) {
        // Implementation for handling user details
        return this.createSuccessResponse('User details processed', {
            nextAction: 'documentValidator'
        });
    }
}
exports.UserDetailsAgent = UserDetailsAgent;
