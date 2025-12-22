"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runKycAgent = runKycAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
/**
 * KYC agent wrapper.
 * In production, this might call an external KYC LLM agent or vendor adapter.
 */
async function runKycAgent(ctx) {
    const config = (0, agentRegistry_1.getAgentConfig)("KYC");
    if (!config) {
        throw new Error('No KYC agent configuration found');
    }
    if (config.type === "http") {
        const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
        out.metadata = { ...(out.metadata || {}), agent_name: 'KYC', slot: "KYC" };
        return out;
    }
    // Fallback local behavior
    return {
        proposal: "escalate",
        confidence: 0.5,
        reasons: ["KYC local fallback - no HTTP agent configured"],
        policy_refs: [],
        flags: { missing_data: true },
        metadata: { agent_name: "kyc_local_fallback", slot: "KYC" },
    };
}
