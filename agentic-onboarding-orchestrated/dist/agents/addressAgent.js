"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAddressAgent = runAddressAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
async function runAddressAgent(context) {
    const { agentId, config: agentConfig } = (0, agentRegistry_1.resolveAgent)('ADDRESS_VERIFICATION');
    try {
        if (agentConfig.type !== 'http') {
            return {
                proposal: 'escalate',
                confidence: 0.1,
                reasons: ['Unsupported agent type'],
                policy_refs: ['address_verification_policy'],
                flags: { unsupported_agent_type: true },
                metadata: {
                    agent_name: agentId || 'address_verification',
                    slot: context.slot
                }
            };
        }
        console.log('Sending address verification request:', context.payload);
        const response = await (0, httpHelper_1.callHttpAgent)(agentConfig.endpoint, context, agentConfig.timeout_ms);
        console.log('Received response from address service:', JSON.stringify(response, null, 2));
        if (!response) {
            throw new Error('No response from address verification service');
        }
        return {
            proposal: response.success ? 'approve' : 'deny',
            confidence: response.confidence || 0.9,
            reasons: response.reasons || ['Address verification completed'],
            policy_refs: response.policy_refs || ['address_verification_policy'],
            flags: {
                address_verified: response.success || false
            },
            metadata: {
                ...response.metadata,
                agent_name: agentId,
                slot: context.slot,
                verification_timestamp: new Date().toISOString()
            }
        };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during address verification';
        console.error('Error in address verification agent:', {
            error: errorMessage,
            context: {
                payload: context.payload,
                slot: context.slot
            }
        });
        return {
            proposal: 'escalate',
            confidence: 0.1,
            reasons: [`Address verification failed: ${errorMessage}`],
            policy_refs: ['ADDRESS_VERIFICATION_ERROR'],
            flags: {
                address_verified: false,
                service_error: true
            },
            metadata: {
                agent_name: agentId,
                slot: context.slot,
                error: errorMessage,
                timestamp: new Date().toISOString()
            }
        };
    }
}
//# sourceMappingURL=addressAgent.js.map