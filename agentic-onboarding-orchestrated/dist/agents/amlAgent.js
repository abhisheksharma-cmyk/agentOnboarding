"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAmlAgent = runAmlAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
/**
 * AML / Fraud agent wrapper.
 */
async function runAmlAgent(ctx) {
    const { agentId, config } = (0, agentRegistry_1.resolveAgent)("AML");
    if (config.type === "http") {
        try {
            const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
            out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "AML" };
            return out;
        }
        catch (err) {
            return {
                proposal: "escalate",
                confidence: 0.5,
                reasons: [`AML HTTP agent unreachable: ${err?.message || err}`],
                policy_refs: [],
                flags: { provider_high_risk: false, contradictory_signals: true },
                metadata: { agent_name: agentId, slot: "AML" },
            };
        }
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
//# sourceMappingURL=amlAgent.js.map