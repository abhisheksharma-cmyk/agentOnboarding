"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callHttpAgent = callHttpAgent;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function callHttpAgent(endpoint, ctx, timeoutMs = 30000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await (0, node_fetch_1.default)(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(ctx.payload), // Make sure this matches the expected format
            signal: controller.signal
        });
        clearTimeout(timeout);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.cause = errorData;
            throw error;
        }
        return await response.json();
    }
    catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}
//# sourceMappingURL=httpHelper.js.map