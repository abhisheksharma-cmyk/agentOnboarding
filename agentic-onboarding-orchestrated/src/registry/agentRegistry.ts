import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { SlotName } from "../types/types";

export type AgentType = "http" | "local";

export interface AgentConfig {
  type: AgentType;
  endpoint: string;
  timeout_ms: number;
  enabled: boolean;
}

export interface SlotConfig {
  active: string;
  versions: Record<string, AgentConfig>;
}

export interface RegistryConfig {
  agents: Record<string, SlotConfig>;
}

let cache: RegistryConfig | null = null;

export function loadRegistry(): RegistryConfig {
  if (cache) return cache;
  const file = path.join(process.cwd(), "config", "agents.yaml");
  const raw = fs.readFileSync(file, "utf-8");
  const parsed = yaml.load(raw) as RegistryConfig;
  cache = parsed;
  return parsed;
}

export function resolveAgent(slot: SlotName): { agentId: string; config: AgentConfig } {
  const registry = loadRegistry();
  const slotConfig = registry.agents[slot];
  if (!slotConfig) {
    throw new Error(`No agent slot configured for ${slot}`);
  }
  const activeId = slotConfig.active;
  const agentCfg = slotConfig.versions[activeId];
  if (!agentCfg || !agentCfg.enabled) {
    throw new Error(`Active agent '${activeId}' for slot '${slot}' is not enabled or missing`);
  }
  return { agentId: activeId, config: agentCfg };
}
