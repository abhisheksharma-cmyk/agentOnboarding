"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
const llmConfig_1 = require("../config/llmConfig");
class BaseAgent {
    constructor() {
        this.llmConfig = llmConfig_1.llmConfig;
    }
    createSuccessResponse(message, data) {
        return {
            status: 'success',
            message,
            data
        };
    }
    createErrorResponse(message, error) {
        return {
            status: 'error',
            message,
            data: error
        };
    }
}
exports.BaseAgent = BaseAgent;
