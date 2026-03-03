import "../bootstrap/loadEnv";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatAnthropic } from "@langchain/anthropic";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { LlmProfileConfig, SupportedLlmProvider } from "./types";

type ChatModelFactory = (profile: LlmProfileConfig) => BaseChatModel;

function maybeResolveEnvRef(value?: string): string | undefined {
  if (!value) return value;
  const envMatch = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
  if (!envMatch) return value;
  return process.env[envMatch[1]];
}

function resolveApiKey(
  profile: LlmProfileConfig,
  defaultEnvVar?: string
): string | undefined {
  if (profile.api_key) {
    return maybeResolveEnvRef(profile.api_key);
  }

  const envVar = profile.api_key_env || defaultEnvVar;
  if (!envVar) return undefined;
  return process.env[envVar];
}

class LlmProviderRegistry {
  private factories = new Map<SupportedLlmProvider, ChatModelFactory>();

  register(provider: SupportedLlmProvider, factory: ChatModelFactory): void {
    this.factories.set(provider, factory);
  }

  create(profile: LlmProfileConfig): BaseChatModel {
    const factory = this.factories.get(profile.provider);
    if (!factory) {
      throw new Error(
        `LLM provider "${profile.provider}" is not registered. ` +
          `Available providers: ${Array.from(this.factories.keys()).join(", ")}`
      );
    }
    return factory(profile);
  }
}

export const llmProviderRegistry = new LlmProviderRegistry();

llmProviderRegistry.register("openai", (profile) => {
  const apiKey = resolveApiKey(profile, "OPENAI_API_KEY");
  return new ChatOpenAI({
    model: profile.model,
    apiKey,
    temperature: profile.temperature ?? 0,
    maxTokens: profile.max_tokens,
    timeout: profile.timeout_ms,
    configuration: profile.base_url
      ? { baseURL: maybeResolveEnvRef(profile.base_url) }
      : undefined,
  });
});

llmProviderRegistry.register("openai_compatible", (profile) => {
  const apiKey = resolveApiKey(profile, "OPENAI_API_KEY");
  return new ChatOpenAI({
    model: profile.model,
    apiKey,
    temperature: profile.temperature ?? 0,
    maxTokens: profile.max_tokens,
    timeout: profile.timeout_ms,
    configuration: profile.base_url
      ? { baseURL: maybeResolveEnvRef(profile.base_url) }
      : undefined,
  });
});

llmProviderRegistry.register("groq", (profile) => {
  const apiKey = resolveApiKey(profile, "GROQ_API_KEY");
  return new ChatOpenAI({
    model: profile.model,
    apiKey,
    temperature: profile.temperature ?? 0,
    maxTokens: profile.max_tokens,
    timeout: profile.timeout_ms,
    configuration: {
      baseURL:
        maybeResolveEnvRef(profile.base_url) || "https://api.groq.com/openai/v1",
    },
  });
});

llmProviderRegistry.register("azure_openai", (profile) => {
  const apiKey = resolveApiKey(profile, "AZURE_OPENAI_KEY");
  return new AzureChatOpenAI({
    model: profile.model,
    temperature: profile.temperature ?? 0,
    maxTokens: profile.max_tokens,
    timeout: profile.timeout_ms,
    azureOpenAIApiKey: apiKey,
    azureOpenAIApiVersion:
      maybeResolveEnvRef(profile.api_version) ||
      process.env.AZURE_OPENAI_API_VERSION,
    azureOpenAIEndpoint:
      maybeResolveEnvRef(profile.base_url) || process.env.AZURE_OPENAI_ENDPOINT,
    deploymentName:
      maybeResolveEnvRef(profile.deployment_name) ||
      process.env.AZURE_OPENAI_DEPLOYMENT,
  });
});

llmProviderRegistry.register("anthropic", (profile) => {
  const apiKey = resolveApiKey(profile, "ANTHROPIC_API_KEY");
  return new ChatAnthropic({
    model: profile.model,
    apiKey,
    temperature: profile.temperature ?? 0,
    maxTokens: profile.max_tokens,
  });
});
