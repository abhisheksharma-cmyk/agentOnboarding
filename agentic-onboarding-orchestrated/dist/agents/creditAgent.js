"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCreditAgent = runCreditAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
/**
 * Credit Assessment agent wrapper.
 */
async function runCreditAgent(ctx) {
    const { agentId, config } = (0, agentRegistry_1.resolveAgent)("CREDIT");
    if (config.type === "http") {
        const out = await (0, httpHelper_1.callHttpAgent)(config.endpoint, ctx, config.timeout_ms);
        out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "CREDIT" };
        return out;
    }
    // Simple heuristic fallback
    const income = ctx.payload?.declaredIncome ?? 0;
    const proposedLimit = Math.min(income * 2, 200000);
    return {
        proposal: proposedLimit > 0 ? "approve" : "deny",
        confidence: 0.75,
        reasons: [`Heuristic limit proposal ${proposedLimit}`],
        policy_refs: ["CREDIT-HEURISTIC-1"],
        flags: { missing_data: income === 0 },
        metadata: { agent_name: "credit_local_heuristic", slot: "CREDIT" },
    };
}
