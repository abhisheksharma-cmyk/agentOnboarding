"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoanDeciderAgent = void 0;
// src/agents/loanDecider/LoanDeciderAgent.ts
const BaseAgent_1 = require("../BaseAgent");
class RulesEngine {
    constructor(rules) {
        this.rules = rules;
    }
    async evaluate(data) {
        // Implement your rule evaluation logic here
        // This is a simplified example
        const creditScore = data.creditScore || 0;
        const income = data.income || 0;
        const loanAmount = data.loanAmount || 0;
        const reasons = [];
        if (creditScore <= 650) {
            reasons.push('Insufficient credit score (minimum 650 required)');
        }
        if (income <= 30000) {
            reasons.push('Income too low (minimum $30,000 required)');
        }
        if (loanAmount > (income * 5)) {
            reasons.push('Loan amount exceeds 5x annual income');
        }
        return {
            approved: reasons.length === 0,
            reasons
        };
    }
}
class LoanDeciderAgent extends BaseAgent_1.BaseAgent {
    constructor() {
        super();
        this.rulesEngine = new RulesEngine(this.loadRules());
    }
    async handle(input, context) {
        try {
            const userData = context.userData || {};
            const decision = await this.rulesEngine.evaluate(userData);
            const message = this.formatDecision(decision);
            const actions = decision.approved ? ['ACCEPT_OFFER', 'MODIFY_LOAN'] : ['REVIEW_REASONS', 'CONTACT_SUPPORT'];
            return this.createSuccessResponse(message, { actions });
        }
        catch (error) {
            return this.createErrorResponse('Failed to process loan decision', error);
        }
    }
    loadRules() {
        // Define your loan decision rules here
        // This is a simplified example - in a real application, these rules
        // might be loaded from a database or configuration file
        return {
            evaluate: (userData) => {
                // Example evaluation logic
                const creditScore = userData.creditScore || 0;
                const income = userData.income || 0;
                const loanAmount = userData.loanAmount || 0;
                const loanTerm = userData.loanTerm || 1;
                // Simple rule: Approve if credit score is good and debt-to-income ratio is reasonable
                const approved = creditScore >= 650 && (loanAmount / (income * loanTerm)) < 0.36;
                return {
                    approved,
                    approvedAmount: approved ? loanAmount : 0,
                    interestRate: this.calculateInterestRate(creditScore),
                    reasons: approved ? [] : ['Credit score too low or debt-to-income ratio too high']
                };
            }
        };
    }
    calculateInterestRate(creditScore) {
        // Simple interest rate calculation based on credit score
        if (creditScore >= 800)
            return 3.5;
        if (creditScore >= 750)
            return 4.0;
        if (creditScore >= 700)
            return 4.5;
        if (creditScore >= 650)
            return 5.0;
        return 0; // Not approved if credit score is below 650
    }
    formatDecision(decision) {
        if (decision.approved) {
            return `Congratulations! You're approved for a loan of ${decision.approvedAmount} at ${decision.interestRate}% interest.`;
        }
        else {
            return `We couldn't approve your loan at this time. Reasons: ${decision.reasons.join(', ')}`;
        }
    }
}
exports.LoanDeciderAgent = LoanDeciderAgent;
