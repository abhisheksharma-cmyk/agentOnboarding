import { callHttpAgent } from "../utils/httpHelper";
import { getAgentConfig } from "../registry/agentRegistry";
import { AgentContext, AgentOutput, SlotName } from "../types/types";
import { runLangGraphAgent } from "./langgraphAgentExecutor";
import { LocalFallback } from "./types";

export async function runConfiguredAgent(
  slot: SlotName,
  ctx: AgentContext,
  localFallback: LocalFallback
): Promise<AgentOutput> {
  const agentInfo = getAgentConfig(slot);
  if (!agentInfo) {
    throw new Error(`No ${slot} agent configuration found`);
  }

  const { agentId, config } = agentInfo;

  if (config.type === "http") {
    const out = await callHttpAgent(config.endpoint, ctx, config.timeout_ms);
    return {
      ...out,
      proposal: out?.proposal || "escalate",
      confidence: typeof out?.confidence === "number" ? out.confidence : 0.5,
      reasons: Array.isArray(out?.reasons) ? out.reasons : [out?.message || "HTTP agent response"],
      policy_refs: Array.isArray(out?.policy_refs) ? out.policy_refs : [],
      flags: out?.flags && typeof out.flags === "object" ? out.flags : {},
      metadata: { ...(out?.metadata || {}), agent_name: agentId, slot },
    };
  }

  if (config.type === "langgraph" || config.type === "langchain") {
    return runLangGraphAgent({
      slot,
      agentId,
      ctx,
      config,
    });
  }

  const fallbackOutput = await Promise.resolve(localFallback(ctx));
  return {
    ...fallbackOutput,
    metadata: { ...(fallbackOutput.metadata || {}), agent_name: agentId, slot },
  };
}
