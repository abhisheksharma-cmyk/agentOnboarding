import { AgentContext, AgentOutput } from "../types/types";
import { runConfiguredAgent } from "../composable/runConfiguredAgent";

/**
 * AML / Fraud agent wrapper.
 */
export async function runAmlAgent(ctx: AgentContext): Promise<AgentOutput> {
  return runConfiguredAgent("AML", ctx, async () => ({
    proposal: "escalate",
    confidence: 0.6,
    reasons: ["AML local fallback - manual review required"],
    policy_refs: [],
    flags: { contradictory_signals: true },
    metadata: { agent_name: "aml_local_fallback", slot: "AML" },
  }));
}
