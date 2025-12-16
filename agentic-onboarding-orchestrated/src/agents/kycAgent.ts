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
    try {
      const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
      out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "KYC" };
      return out;
    } catch (err) {
      // Graceful degradation if HTTP agent is down/unreachable.
      return {
        proposal: "escalate",
        confidence: 0.4,
        reasons: [`KYC HTTP agent unreachable: ${(err as Error)?.message || err}`],
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
