"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateDecision = evaluateDecision;
/**
 * Central place to enforce decision boundaries.
 * Agents can propose, but this function is the final authority.
 */
function evaluateDecision(out) {
    const flags = out.flags ?? {};
    // Global, conservative rules
    if (out.confidence < 0.8)
        return "ESCALATE";
    if (!out.flags)
        return "ESCALATE";
    if (flags.missing_data)
        return "ESCALATE";
    if (flags.policy_conflict)
        return "DENY";
    if (flags.provider_high_risk)
        return "DENY";
    if (flags.contradictory_signals)
        return "ESCALATE";
    // Default: follow proposal
    switch (out.proposal) {
        case "approve":
            return "APPROVE";
        case "deny":
            return "DENY";
        case "escalate":
        default:
            return "ESCALATE";
    }
}
