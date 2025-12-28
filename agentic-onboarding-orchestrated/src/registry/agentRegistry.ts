// src/registry/agentRegistry.ts
import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { SlotName } from "../types/types";


export type AgentType = "http" | "local";

export interface AgentConfig {
 agentId: string;  // Add this line
  type: AgentType;
  endpoint: string;
  timeout_ms: number;
  enabled: boolean;
}

export interface SlotConfig {
  active: string;
  versions: Record<string, AgentConfig>;
}

export interface AgentsConfig {
  [slot: string]: SlotConfig;
}

const agentConfigs: Record<string, AgentConfig> = {
  KYC: {
    agentId: 'kyc-verification',  // Add a unique identifier for this agent
    type: 'http',
    endpoint: '/api/kyc',
    timeout_ms: 30000,
    enabled: true
  }
};

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

export function loadAgentsConfig(configPath?: string): AgentsConfig {
  if (agentsConfig) return agentsConfig;

  try {
    const configFile = configPath || path.join(process.cwd(), 'config', 'agents.yaml');
    const fileContents = fs.readFileSync(configFile, 'utf8');
    const yamlContent = yaml.load(fileContents) as any;

    agentsConfig = yamlContent.agents || yamlContent;

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