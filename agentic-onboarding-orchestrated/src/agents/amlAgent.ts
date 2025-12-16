import { AgentContext, AgentOutput } from "../types/types";
import { resolveAgent } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";

/**
 * AML / Fraud agent wrapper.
 */
export async function runAmlAgent(ctx: AgentContext): Promise<AgentOutput> {
  const { agentId, config } = resolveAgent("AML");
  if (config.type === "http") {
    try {
      const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
      out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "AML" };
      return out;
    } catch (err) {
      return {
        proposal: "escalate",
        confidence: 0.5,
        reasons: [`AML HTTP agent unreachable: ${(err as Error)?.message || err}`],
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
