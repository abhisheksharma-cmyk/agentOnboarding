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
        agentsConfig = js_yaml_1.default.load(fileContents);
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
        console.warn(`Slot ${slot} not found in configuration`);
        return null;
    }
    const versionToUse = version || slotConfig.active;
    const agentConfig = slotConfig.versions[versionToUse];
    if (!agentConfig) {
        console.warn(`Version ${versionToUse} not found for slot ${slot}`);
        return null;
    }
    if (!agentConfig.enabled) {
        console.warn(`Agent ${slot} (${versionToUse}) is disabled`);
        return null;
    }
    return agentConfig;
}
function getActiveAgents() {
    if (!agentsConfig) {
        loadAgentsConfig();
    }
    const activeAgents = {};
    for (const [slot, slotConfig] of Object.entries(agentsConfig || {})) {
        const agentConfig = getAgentConfig(slot);
        if (agentConfig) {
            activeAgents[slot] = agentConfig;
        }
    }
    return activeAgents;
}
