import { AgentContext, AgentOutput } from "../types/types";
import { getAgentConfig } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";

/**
 * AML / Fraud agent wrapper.
 */
export async function runAmlAgent(ctx: AgentContext): Promise<AgentOutput> {
  const agentInfo = getAgentConfig("AML");
  if (!agentInfo) {
    throw new Error('No AML agent configuration found');
  }
  const { agentId, config } = agentInfo;
  if (config.type === "http") {
    const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
    out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "AML" };
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
