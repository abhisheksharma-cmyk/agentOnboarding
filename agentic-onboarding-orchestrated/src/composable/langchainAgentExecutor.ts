import { JsonOutputParser, StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { llmProviderRegistry } from "./llmProviderRegistry";
import { getLlmProfile } from "../registry/agentRegistry";
import { AgentExecutionRequest, LlmProfileConfig } from "./types";
import { AgentOutput } from "../types/types";

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

function normalizeAgentOutput(
  candidate: Record<string, unknown>,
  req: AgentExecutionRequest,
  profile: LlmProfileConfig
): AgentOutput {
  const proposal = normalizeProposal(candidate.proposal);
  const confidence = Math.max(0, Math.min(1, toNumber(candidate.confidence, 0.5)));
  const reasons = normalizeStringArray(candidate.reasons, [
    "LangChain execution completed without explicit reasons",
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
      runtime: "langchain",
      timestamp: new Date().toISOString(),
    },
  };
}

function resolveLlmProfile(req: AgentExecutionRequest): LlmProfileConfig {
  const chainCfg = req.config.langchain;
  if (!chainCfg) {
    throw new Error(`Agent ${req.agentId} is missing langchain configuration`);
  }

  if (chainCfg.llm) {
    return chainCfg.llm;
  }

  if (!chainCfg.llm_profile) {
    throw new Error(
      `Agent ${req.agentId} must define langchain.llm or langchain.llm_profile`
    );
  }

  const profile = getLlmProfile(chainCfg.llm_profile);
  if (!profile) {
    throw new Error(
      `LLM profile "${chainCfg.llm_profile}" was not found for agent ${req.agentId}`
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

export async function runLangChainAgent(
  req: AgentExecutionRequest
): Promise<AgentOutput> {
  const chainCfg = req.config.langchain;
  if (!chainCfg) {
    throw new Error(`Agent ${req.agentId} is not configured for langchain execution`);
  }

  const profile = resolveLlmProfile(req);
  const model = llmProviderRegistry.create(profile);
  const parser = new JsonOutputParser<Record<string, unknown>>();

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", chainCfg.prompt.system_prompt || DEFAULT_SYSTEM_PROMPT],
    ["human", chainCfg.prompt.user_prompt_template || DEFAULT_USER_PROMPT],
  ]);

  const chain = RunnableSequence.from([prompt, model, new StringOutputParser()]);
  const promptInputs = buildPromptInputs(req);
  const attempts = Math.max(chainCfg.retry?.max_attempts ?? 1, 1);
  const backoffMs = Math.max(chainCfg.retry?.backoff_ms ?? 250, 0);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const raw = await chain.invoke(promptInputs);
      const parsed = await parser.parse(extractJsonCandidate(raw));
      return normalizeAgentOutput(parsed, req, profile);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await wait(backoffMs * attempt);
      }
    }
  }

  const reason =
    lastError instanceof Error
      ? lastError.message
      : "LangChain execution failed for unknown reason";

  return {
    proposal: "escalate",
    confidence: 0.2,
    reasons: [reason],
    policy_refs: [],
    flags: { policy_conflict: false, missing_data: true },
    metadata: {
      agent_name: req.agentId,
      slot: req.slot,
      provider: profile.provider,
      model: profile.model,
      runtime: "langchain",
      error: reason,
    },
  };
}
