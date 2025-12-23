"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadAgentsConfig = loadAgentsConfig;
exports.getAgentConfig = getAgentConfig;
exports.getActiveAgents = getActiveAgents;
// src/registry/agentRegistry.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
let agentsConfig = null;
function loadAgentsConfig(configPath) {
    if (agentsConfig)
        return agentsConfig;
    try {
        const configFile = configPath || path_1.default.join(process.cwd(), 'config', 'agents.yaml');
        const fileContents = fs_1.default.readFileSync(configFile, 'utf8');
        const yamlContent = js_yaml_1.default.load(fileContents);
        // The YAML file has agents directly at the root level
        agentsConfig = yamlContent.agents || yamlContent;
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
    if (!config) {
        console.warn(`No configuration found for ${slot} version: ${agentVersion}`);
        return null;
    }
    if (!config.enabled) {
        console.warn(`Agent ${slot} version ${agentVersion} is disabled`);
        return null;
    }
    // The agent ID is in the format "slot-version"
    const agentId = `${slot.toLowerCase()}-${agentVersion}`;
    return { agentId, config };
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
