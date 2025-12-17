"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRegistry = loadRegistry;
exports.resolveAgent = resolveAgent;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const js_yaml_1 = __importDefault(require("js-yaml"));
let cache = null;
function loadRegistry() {
    if (cache)
        return cache;
    const file = path_1.default.join(process.cwd(), "config", "agents.yaml");
    const raw = fs_1.default.readFileSync(file, "utf-8");
    const parsed = js_yaml_1.default.load(raw);
    cache = parsed;
    return parsed;
}
function resolveAgent(slot) {
    const registry = loadRegistry();
    const slotConfig = registry.agents[slot];
    if (!slotConfig) {
        throw new Error(`No agent slot configured for ${slot}`);
    }
    // Handle direct configuration (without versions)
    if ('endpoint' in slotConfig) {
        return {
            agentId: slot,
            config: slotConfig
        };
    }
    // Handle versioned configuration
    const activeId = slotConfig.active;
    const agentCfg = slotConfig.versions[activeId];
    if (!agentCfg || !agentCfg.enabled) {
        throw new Error(`Active agent '${activeId}' for slot '${slot}' is not enabled or missing`);
    }
    return { agentId: activeId, config: agentCfg };
}
//# sourceMappingURL=agentRegistry.js.map