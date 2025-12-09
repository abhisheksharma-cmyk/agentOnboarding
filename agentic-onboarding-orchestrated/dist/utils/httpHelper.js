"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callHttpAgent = callHttpAgent;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function callHttpAgent(endpoint, ctx, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await (0, node_fetch_1.default)(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: { context: ctx } }),
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new Error(`Agent HTTP error ${res.status}`);
        }
        const json = (await res.json());
        return json;
    }
    finally {
        clearTimeout(id);
    }
}
