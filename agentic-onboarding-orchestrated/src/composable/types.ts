import { AgentContext, AgentOutput, SlotName } from "../types/types";

export type SupportedAgentType = "http" | "local" | "langchain" | "langgraph";

export type SupportedLlmProvider =
  | "openai"
  | "openai_compatible"
  | "groq"
  | "azure_openai"
  | "anthropic";

export interface LlmProfileConfig {
  provider: SupportedLlmProvider;
  model: string;
  api_key?: string;
  api_key_env?: string;
  base_url?: string;
  api_version?: string;
  deployment_name?: string;
  temperature?: number;
  max_tokens?: number;
  timeout_ms?: number;
}

export interface LangChainPromptConfig {
  system_prompt?: string;
  user_prompt_template: string;
}

export interface LangChainRetryConfig {
  max_attempts?: number;
  backoff_ms?: number;
}

export interface LangChainAgentConfig {
  llm_profile?: string;
  llm?: LlmProfileConfig;
  prompt: LangChainPromptConfig;
  retry?: LangChainRetryConfig;
}

export interface RunnableAgentConfig {
  agentId?: string;
  type: SupportedAgentType;
  endpoint: string;
  timeout_ms: number;
  enabled: boolean;
  documentation?: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  langchain?: LangChainAgentConfig;
  langgraph?: LangChainAgentConfig;
}

export type LocalFallback = (ctx: AgentContext) => Promise<AgentOutput> | AgentOutput;

export interface AgentExecutionRequest {
  slot: SlotName;
  agentId: string;
  ctx: AgentContext;
  config: RunnableAgentConfig;
}
