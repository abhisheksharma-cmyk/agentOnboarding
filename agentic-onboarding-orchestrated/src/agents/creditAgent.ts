import { AgentContext, AgentOutput } from "../types/types";
import { resolveAgent } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";

/**
 * Credit Assessment agent wrapper.
 */
export async function runCreditAgent(ctx: AgentContext): Promise<AgentOutput> {
  const { agentId, config } = resolveAgent("CREDIT");
  if (config.type === "http") {
    try {
      const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
      out.metadata = { ...(out.metadata || {}), agent_name: agentId, slot: "CREDIT" };
      return out;
    } catch (err) {
      return {
        proposal: "escalate",
        confidence: 0.5,
        reasons: [`Credit HTTP agent unreachable: ${(err as Error)?.message || err}`],
        policy_refs: [],
        flags: { missing_data: true, contradictory_signals: true },
        metadata: { agent_name: agentId, slot: "CREDIT" },
      };
    }
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
