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
    const { agentId, config } = (0, agentRegistry_1.resolveAgent)("KYC");
    if (config.type === "http") {
        try {
            const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
            out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "KYC" };
            return out;
        }
        catch (err) {
            // Graceful degradation if HTTP agent is down/unreachable.
            return {
                proposal: "escalate",
                confidence: 0.4,
                reasons: [`KYC HTTP agent unreachable: ${err?.message || err}`],
                policy_refs: [],
                flags: { missing_data: true, contradictory_signals: true },
                metadata: { agent_name: agentId, slot: "KYC" },
            };
        }
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
//# sourceMappingURL=kycAgent.js.map