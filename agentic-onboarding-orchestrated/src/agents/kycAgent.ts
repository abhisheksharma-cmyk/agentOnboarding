import { AgentContext, AgentOutput } from "../types/types";
import { resolveAgent } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";

/**
 * KYC agent wrapper.
 * In production, this might call an external KYC LLM agent or vendor adapter.
 */
export async function runKycAgent(ctx: AgentContext): Promise<AgentOutput> {
  const { agentId, config } = resolveAgent("KYC");
  if (config.type === "http") {
    const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
    out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "KYC" };
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
