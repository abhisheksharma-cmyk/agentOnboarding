import { JsonOutputParser, StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { getLlmProfile } from "../registry/agentRegistry";
import { AgentOutput } from "../types/types";
import { llmProviderRegistry } from "./llmProviderRegistry";
import { AgentExecutionRequest, LangChainAgentConfig, LlmProfileConfig } from "./types";

const DEFAULT_SYSTEM_PROMPT =
  "You are a banking risk/compliance decision assistant. " +
  "Return only JSON and follow the output schema exactly.";

const DEFAULT_USER_PROMPT = [
  "Slot: {slot}",
  "Customer ID: {customer_id}",
  "Application ID: {application_id}",
  "Context JSON:",
  "{context_json}",
  "",
  "Payload JSON:",
  "{payload_json}",
  "",
  "{output_format_instructions}",
].join("\n");

const OUTPUT_FORMAT_INSTRUCTIONS = [
  "Return a JSON object with this exact shape:",
  "{",
  '  "proposal": "approve" | "deny" | "escalate",',
  '  "confidence": number between 0 and 1,',
  '  "reasons": string[],',
  '  "policy_refs": string[],',
  '  "flags": { [key: string]: boolean }',
  "}",
  "No markdown code fences. No additional keys.",
].join("\n");

const AgentExecutorState = Annotation.Root({
  promptInputs: Annotation<Record<string, string>>,
  rawOutput: Annotation<string | undefined>,
  output: Annotation<AgentOutput | undefined>,
  error: Annotation<string | undefined>,
});

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractJsonCandidate(text: string): string {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : text;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeFlags(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const flags: Record<string, boolean> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    flags[key] = Boolean(raw);
  }
  return flags;
}

function normalizeProposal(value: unknown): "approve" | "deny" | "escalate" {
  if (value === "approve" || value === "deny" || value === "escalate") {
    return value;
  }
  return "escalate";
}

function getRuntimeConfig(req: AgentExecutionRequest): LangChainAgentConfig {
  const cfg = req.config.langgraph || req.config.langchain;
  if (!cfg) {
    throw new Error(
      `Agent ${req.agentId} must define either config.langgraph or config.langchain`
    );
  }
  return cfg;
}

function resolveLlmProfile(
  req: AgentExecutionRequest,
  runtimeCfg: LangChainAgentConfig
): LlmProfileConfig {
  if (runtimeCfg.llm) {
    return runtimeCfg.llm;
  }

  if (!runtimeCfg.llm_profile) {
    throw new Error(
      `Agent ${req.agentId} must define llm or llm_profile for LangGraph runtime`
    );
  }

  const profile = getLlmProfile(runtimeCfg.llm_profile);
  if (!profile) {
    throw new Error(
      `LLM profile "${runtimeCfg.llm_profile}" was not found for agent ${req.agentId}`
    );
  }
  return profile;
}

function buildPromptInputs(req: AgentExecutionRequest): Record<string, string> {
  return {
    slot: req.slot,
    customer_id: req.ctx.customerId,
    application_id: req.ctx.applicationId,
    context_json: JSON.stringify(req.ctx, null, 2),
    payload_json: JSON.stringify(req.ctx.payload ?? {}, null, 2),
    output_format_instructions: OUTPUT_FORMAT_INSTRUCTIONS,
  };
}

function normalizeAgentOutput(
  candidate: Record<string, unknown>,
  req: AgentExecutionRequest,
  profile: LlmProfileConfig
): AgentOutput {
  const proposal = normalizeProposal(candidate.proposal);
  const confidence = Math.max(0, Math.min(1, toNumber(candidate.confidence, 0.5)));
  const reasons = normalizeStringArray(candidate.reasons, [
    "LangGraph execution completed without explicit reasons",
  ]);
  const policyRefs = normalizeStringArray(candidate.policy_refs, []);
  const flags = normalizeFlags(candidate.flags);

  return {
    proposal,
    confidence,
    reasons,
    policy_refs: policyRefs,
    flags,
    metadata: {
      agent_name: req.agentId,
      slot: req.slot,
      provider: profile.provider,
      model: profile.model,
      runtime: "langgraph",
      timestamp: new Date().toISOString(),
    },
  };
}

export async function runLangGraphAgent(
  req: AgentExecutionRequest
): Promise<AgentOutput> {
  const runtimeCfg = getRuntimeConfig(req);
  const profile = resolveLlmProfile(req, runtimeCfg);
  const model = llmProviderRegistry.create(profile);
  const parser = new JsonOutputParser<Record<string, unknown>>();
  const promptInputs = buildPromptInputs(req);

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", runtimeCfg.prompt.system_prompt || DEFAULT_SYSTEM_PROMPT],
    ["human", runtimeCfg.prompt.user_prompt_template || DEFAULT_USER_PROMPT],
  ]);
  const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);

  const attempts = Math.max(runtimeCfg.retry?.max_attempts ?? 1, 1);
  const backoffMs = Math.max(runtimeCfg.retry?.backoff_ms ?? 250, 0);

  const invokeModelNode = async () => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const raw = await chain.invoke(promptInputs);
        return { rawOutput: raw, error: undefined };
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await wait(backoffMs * attempt);
        }
      }
    }

    return {
      rawOutput: undefined,
      error:
        lastError instanceof Error
          ? lastError.message
          : "LangGraph LLM invocation failed for unknown reason",
    };
  };

  const normalizeOutputNode = async (
    state: typeof AgentExecutorState.State
  ): Promise<Partial<typeof AgentExecutorState.State>> => {
    if (state.error) {
      return {
        output: {
          proposal: "escalate",
          confidence: 0.2,
          reasons: [state.error],
          policy_refs: [],
          flags: { missing_data: true },
          metadata: {
            agent_name: req.agentId,
            slot: req.slot,
            provider: profile.provider,
            model: profile.model,
            runtime: "langgraph",
            error: state.error,
          },
        },
      };
    }

    try {
      const parsed = await parser.parse(extractJsonCandidate(state.rawOutput || ""));
      return { output: normalizeAgentOutput(parsed, req, profile) };
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : "Failed to parse LangGraph model output";
      return {
        output: {
          proposal: "escalate",
          confidence: 0.2,
          reasons: [reason],
          policy_refs: [],
          flags: { missing_data: true },
          metadata: {
            agent_name: req.agentId,
            slot: req.slot,
            provider: profile.provider,
            model: profile.model,
            runtime: "langgraph",
            error: reason,
          },
        },
      };
    }
  };

  const graph = new StateGraph(AgentExecutorState)
    .addNode("invoke_model", invokeModelNode)
    .addNode("normalize_output", normalizeOutputNode)
    .addEdge(START, "invoke_model")
    .addEdge("invoke_model", "normalize_output")
    .addEdge("normalize_output", END)
    .compile();

  const finalState = await graph.invoke({
    promptInputs,
    rawOutput: undefined,
    output: undefined,
    error: undefined,
  });

  if (finalState.output) {
    return finalState.output;
  }

  return {
    proposal: "escalate",
    confidence: 0.2,
    reasons: ["LangGraph execution completed without output"],
    policy_refs: [],
    flags: { missing_data: true },
    metadata: {
      agent_name: req.agentId,
      slot: req.slot,
      provider: profile.provider,
      model: profile.model,
      runtime: "langgraph",
    },
  };
}
