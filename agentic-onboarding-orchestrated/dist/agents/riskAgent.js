"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runRiskAgent = runRiskAgent;
/**
 * Risk Assessment agent.
 * For demo purposes, implemented as a simple local heuristic.
 */
async function runRiskAgent(ctx) {
    const amlHigh = ctx.payload?.amlHighRisk === true;
    const creditLow = ctx.payload?.creditScore < 600;
    if (amlHigh) {
        return {
            proposal: "deny",
            confidence: 0.95,
            reasons: ["High AML risk"],
            policy_refs: ["RISK-AML-1"],
            flags: { provider_high_risk: true },
            metadata: { agent_name: "risk_local", slot: "RISK" },
        };
    }
    if (creditLow) {
        return {
            proposal: "escalate",
            confidence: 0.85,
            reasons: ["Low credit score - grey zone"],
            policy_refs: ["RISK-CREDIT-1"],
            flags: { contradictory_signals: true },
            metadata: { agent_name: "risk_local", slot: "RISK" },
        };
    }
    return {
        proposal: "approve",
        confidence: 0.9,
        reasons: ["No high-risk flags detected"],
        policy_refs: ["RISK-DEFAULT-1"],
        flags: {},
        metadata: { agent_name: "risk_local", slot: "RISK" },
    };
}
//# sourceMappingURL=riskAgent.js.map