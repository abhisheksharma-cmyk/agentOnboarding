"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAmlAgent = runAmlAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
/**
 * AML / Fraud agent wrapper.
 */
async function runAmlAgent(ctx) {
    const config = (0, agentRegistry_1.getAgentConfig)("AML");
    if (!config) {
        throw new Error('No AML agent configuration found');
    }
    if (config.type === "http") {
        const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
        out.metadata = { ...(out.metadata || {}), agent_name: 'aml_verification', slot: "AML" };
        return out;
    }
    return {
        proposal: "escalate",
        confidence: 0.6,
        reasons: ["AML local fallback - manual review required"],
        policy_refs: [],
        flags: { contradictory_signals: true },
        metadata: { agent_name: "aml_local_fallback", slot: "AML" },
    };
}
