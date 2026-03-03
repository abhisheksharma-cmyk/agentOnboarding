"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.callHttpAgent = callHttpAgent;
const node_fetch_1 = __importDefault(require("node-fetch"));
async function callHttpAgent(endpoint, ctx, timeoutMs = 30000) {
    console.log("[HTTP Helper] callHttpAgent called");
    console.log("[HTTP Helper] Endpoint:", endpoint);
    console.log("[HTTP Helper] Context:", JSON.stringify(ctx, null, 2));
    console.log("[HTTP Helper] Timeout:", timeoutMs, "ms");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        // Determine request body based on endpoint
        let requestBody;
        if (endpoint.includes('/kyc') || endpoint.includes('/aml') || endpoint.includes('/credit')) {
            // For KYC/AML/Credit agents, send the full context in the expected format
            requestBody = {
                input: {
                    context: {
                        customerId: ctx.customerId,
                        applicationId: ctx.applicationId,
                        slot: ctx.slot,
                        payload: ctx.payload || {}
                    }
                }
            };
            console.log("[HTTP Helper] Sending KYC/AML/Credit format request");
        }
        else {
            // For address verification, extract address data
            const payload = ctx.payload?.payload || ctx.payload;
            const addressData = payload?.address || {
                line1: payload?.line1 || payload?.street,
                city: payload?.city,
                state: payload?.state,
                postalCode: payload?.postalCode || payload?.zipCode,
                country: payload?.country || 'US'
            };
            requestBody = { address: addressData };
            console.log("[HTTP Helper] Sending address verification format request");
        }
        console.log("[HTTP Helper] Request body:", JSON.stringify(requestBody, null, 2));
        console.log("[HTTP Helper] Making POST request to:", endpoint);
        const response = await (0, node_fetch_1.default)(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        clearTimeout(timeout);
        console.log("[HTTP Helper] Response status:", response.status, response.statusText);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("[HTTP Helper] Error response:", errorData);
            const error = new Error(`HTTP error! status: ${response.status}`);
            error.cause = errorData;
            throw error;
        }
        const result = await response.json();
        console.log("[HTTP Helper] Successfully received response");
        console.log("[HTTP Helper] Response:", JSON.stringify(result, null, 2));
        return result;
    }
    catch (error) {
        clearTimeout(timeout);
        console.error("[HTTP Helper] Request failed:", error instanceof Error ? error.message : String(error));
        throw error;
    }
}
//# sourceMappingURL=httpHelper.js.map