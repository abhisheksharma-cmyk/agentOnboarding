"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAmlAgent = runAmlAgent;
const runConfiguredAgent_1 = require("../composable/runConfiguredAgent");
/**
 * AML / Fraud agent wrapper.
 */
async function runAmlAgent(ctx) {
    return (0, runConfiguredAgent_1.runConfiguredAgent)("AML", ctx, async () => ({
        proposal: "escalate",
        confidence: 0.6,
        reasons: ["AML local fallback - manual review required"],
        policy_refs: [],
        flags: { contradictory_signals: true },
        metadata: { agent_name: "aml_local_fallback", slot: "AML" },
    }));
}
