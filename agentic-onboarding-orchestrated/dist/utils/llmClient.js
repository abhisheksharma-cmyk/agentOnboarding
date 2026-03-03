"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmClient = void 0;
exports.createLLMClient = createLLMClient;
const openai_1 = __importDefault(require("openai"));
const llmConfig_1 = require("../config/llmConfig");
function createLLMClient() {
    return new openai_1.default({
        apiKey: llmConfig_1.llmConfig.groq.apiKey,
        baseURL: llmConfig_1.llmConfig.groq.baseURL,
    });
}
exports.llmClient = createLLMClient();
