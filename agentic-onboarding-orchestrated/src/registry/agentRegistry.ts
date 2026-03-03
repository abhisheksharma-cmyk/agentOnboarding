// src/registry/agentRegistry.ts
import "../bootstrap/loadEnv";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { SlotName } from "../types/types";
import { LlmProfileConfig, RunnableAgentConfig } from "../composable/types";

export type AgentType = "http" | "local" | "langchain" | "langgraph";

export interface AgentConfig extends RunnableAgentConfig {}

export interface SlotConfig {
  active: string;
  versions: Record<string, AgentConfig>;
}

export interface AgentsConfig {
  [slot: string]: SlotConfig;
}

export interface AgentRegistryFile {
  agents: AgentsConfig;
  llm_profiles?: Record<string, LlmProfileConfig>;
}

function resolveEnvPlaceholders<T>(value: T): T {
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
    if (!match) return value;
    return (process.env[match[1]] ?? value) as unknown as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveEnvPlaceholders(item)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      out[key] = resolveEnvPlaceholders(raw);
    }
    return out as T;
  }

  return value;
}

// const agentConfigs: Record<string, AgentConfig> = {
//   KYC: {
//     agentId: 'kyc-verification',  // Add a unique identifier for this agent
//     type: 'http',
//     endpoint: '/api/kyc',
//     timeout_ms: 30000,
//     enabled: true
//   }
// };

export function getAgentConfig(slot: string, version?: string): { agentId: string; config: AgentConfig } | null {
  if (!agentsConfig) {
    loadAgentsConfig();
  }

  const slotConfig = agentsConfig?.[slot];
  if (!slotConfig) {
    console.warn(`No configuration found for slot: ${slot}`);
    return null;
  }

  const agentVersion = version || slotConfig.active;
  const config = slotConfig.versions[agentVersion];

  if (!config || !config.enabled) {
    console.warn(`No configuration found for ${slot} version: ${agentVersion} or Agent ${slot} version ${agentVersion} is disabled`);
    return null;
  }

  const agentId = `${slot.toLowerCase()}-${agentVersion}`;
  return { agentId, config };
}

export function registerAgentEndpoints(app: any, agent: any) {
  if (!agent.endpoints) return;
  agent.endpoints.forEach((endpoint: any) => {
    const { method, path, handler } = endpoint;
    const handlers = Array.isArray(handler) ? handler : [handler];
    app[method.toLowerCase()](path, ...handlers);
  });
}

let agentsConfig: AgentsConfig | null = null;
let registryConfig: AgentRegistryFile | null = null;

export function loadAgentsConfig(configPath?: string): AgentsConfig {
  if (agentsConfig) return agentsConfig;

  try {
    const configFile =
      configPath ||
      process.env.AGENTS_CONFIG_PATH ||
      path.join(process.cwd(), "config", "agents.yaml");
    const fileContents = fs.readFileSync(configFile, 'utf8');
    const yamlContent = resolveEnvPlaceholders(yaml.load(fileContents) as any);

    if (yamlContent && yamlContent.agents) {
      registryConfig = yamlContent as AgentRegistryFile;
      agentsConfig = registryConfig.agents;
    } else {
      agentsConfig = yamlContent;
      registryConfig = { agents: agentsConfig as AgentsConfig, llm_profiles: {} };
    }

    if (!agentsConfig || typeof agentsConfig !== 'object') {
      throw new Error('Invalid agents configuration');
    }

    return agentsConfig;
  } catch (error) {
    console.error('Failed to load agents configuration:', error);
    throw new Error('Failed to load agents configuration');
  }
}

export function getActiveAgents(): Record<string, { agentId: string; config: AgentConfig }> {
  if (!agentsConfig) {
    loadAgentsConfig();
  }

  const activeAgents: Record<string, { agentId: string; config: AgentConfig }> = {};

  for (const [slot] of Object.entries(agentsConfig || {})) {
    const agentInfo = getAgentConfig(slot);
    if (agentInfo) {
      activeAgents[slot] = agentInfo;
    }
  }

  return activeAgents;
}

export function getLlmProfile(profileName: string): LlmProfileConfig | null {
  if (!agentsConfig) {
    loadAgentsConfig();
  }

  if (!registryConfig?.llm_profiles) {
    return null;
  }

  return registryConfig.llm_profiles[profileName] || null;
}
