"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentConfig = getAgentConfig;
exports.registerAgentEndpoints = registerAgentEndpoints;
exports.loadAgentsConfig = loadAgentsConfig;
exports.getActiveAgents = getActiveAgents;
exports.getLlmProfile = getLlmProfile;
// src/registry/agentRegistry.ts
require("../bootstrap/loadEnv");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
function resolveEnvPlaceholders(value) {
    if (typeof value === "string") {
        const match = value.match(/^\$\{([A-Z0-9_]+)\}$/i);
        if (!match)
            return value;
        return (process.env[match[1]] ?? value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => resolveEnvPlaceholders(item));
    }
    if (value && typeof value === "object") {
        const out = {};
        for (const [key, raw] of Object.entries(value)) {
            out[key] = resolveEnvPlaceholders(raw);
        }
        return out;
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
function getAgentConfig(slot, version) {
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
function registerAgentEndpoints(app, agent) {
    if (!agent.endpoints)
        return;
    agent.endpoints.forEach((endpoint) => {
        const { method, path, handler } = endpoint;
        const handlers = Array.isArray(handler) ? handler : [handler];
        app[method.toLowerCase()](path, ...handlers);
    });
}
let agentsConfig = null;
let registryConfig = null;
function loadAgentsConfig(configPath) {
    if (agentsConfig)
        return agentsConfig;
    try {
        const configFile = configPath ||
            process.env.AGENTS_CONFIG_PATH ||
            path_1.default.join(process.cwd(), "config", "agents.yaml");
        const fileContents = fs_1.default.readFileSync(configFile, 'utf8');
        const yamlContent = resolveEnvPlaceholders(js_yaml_1.default.load(fileContents));
        if (yamlContent && yamlContent.agents) {
            registryConfig = yamlContent;
            agentsConfig = registryConfig.agents;
        }
        else {
            agentsConfig = yamlContent;
            registryConfig = { agents: agentsConfig, llm_profiles: {} };
        }
        if (!agentsConfig || typeof agentsConfig !== 'object') {
            throw new Error('Invalid agents configuration');
        }
        return agentsConfig;
    }
    catch (error) {
        console.error('Failed to load agents configuration:', error);
        throw new Error('Failed to load agents configuration');
    }
}
function getActiveAgents() {
    if (!agentsConfig) {
        loadAgentsConfig();
    }
    const activeAgents = {};
    for (const [slot] of Object.entries(agentsConfig || {})) {
        const agentInfo = getAgentConfig(slot);
        if (agentInfo) {
            activeAgents[slot] = agentInfo;
        }
    }
    return activeAgents;
}
function getLlmProfile(profileName) {
    if (!agentsConfig) {
        loadAgentsConfig();
    }
    if (!registryConfig?.llm_profiles) {
        return null;
    }
    return registryConfig.llm_profiles[profileName] || null;
}
