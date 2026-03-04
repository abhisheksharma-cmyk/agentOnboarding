import { AgentContext, AgentOutput } from "../types/types";
import { runConfiguredAgent } from "../composable/runConfiguredAgent";

/**
 * Risk Assessment agent.
 * For demo purposes, implemented as a simple local heuristic.
 */
export async function runRiskAgent(ctx: AgentContext): Promise<AgentOutput> {
  return runConfiguredAgent("RISK", ctx, async (currentCtx) => {
    const riskProfile = currentCtx.payload?.riskProfile || "low";
    const kycResult = currentCtx.payload?.kycResult || {};
    const kycMatch = kycResult.flags?.data_match === true;

    const amlHigh = currentCtx.payload?.amlHighRisk === true ||
      currentCtx.payload?.amlResult?.flags?.provider_high_risk === true;
    const creditLow = currentCtx.payload?.creditScore < 600 ||
      (currentCtx.payload?.creditResult?.proposal === 'deny');

    // 1. High-level hard rejects first
    if (amlHigh) {
      return {
        proposal: "deny",
        confidence: 0.98,
        reasons: ["Critical AML Risk detected"],
        policy_refs: ["RISK-AML-1"],
        flags: { provider_high_risk: true },
        metadata: { agent_name: "risk_final", slot: "RISK" },
      };
    }

    // 2. Custom Business Logic for Scenario:
    // "when user selects High Risk and matches -> approve"
    // "if user selects low risk -> escalate"

    if (riskProfile.toLowerCase() === 'high') {
      if (kycMatch) {
        return {
          proposal: "approve",
          confidence: 0.95,
          reasons: ["High Risk Path: Full Identity Match confirmed"],
          policy_refs: ["RISK-HIGH-PATH-MATCH"],
          flags: { high_risk_fast_track: true },
          metadata: { agent_name: "risk_final", slot: "RISK" },
        };
      } else {
        return {
          proposal: "escalate",
          confidence: 0.8,
          reasons: ["High Risk Path: Identity Match failed, requires scrutiny"],
          policy_refs: ["RISK-HIGH-PATH-MISMATCH"],
          flags: { kyc_mismatch: true },
          metadata: { agent_name: "risk_final", slot: "RISK" },
        };
      }
    }

    if (riskProfile.toLowerCase() === 'low') {
      return {
        proposal: "escalate",
        confidence: 0.85,
        reasons: ["Low Risk Path selected: Triggering manual review as per policy"],
        policy_refs: ["RISK-LOW-PATH-MANUAL"],
        flags: { low_risk_manual_entry: true },
        metadata: { agent_name: "risk_final", slot: "RISK" },
      };
    }

    // Fallback logic
    if (creditLow) {
      return {
        proposal: "escalate",
        confidence: 0.85,
        reasons: ["Low credit score - grey zone"],
        policy_refs: ["RISK-CREDIT-1"],
        flags: { contradictory_signals: true },
        metadata: { agent_name: "risk_final", slot: "RISK" },
      };
    }

    return {
      proposal: "approve",
      confidence: 0.9,
      reasons: ["Standard path: No high-risk flags detected"],
      policy_refs: ["RISK-DEFAULT-1"],
      flags: {},
      metadata: { agent_name: "risk_final", slot: "RISK" },
    };
  });
}
