"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAddressAgent = runAddressAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
async function runAddressAgent(context) {
    const agentConfig = (0, agentRegistry_1.getAgentConfig)('ADDRESS_VERIFICATION');
    if (!agentConfig) {
        throw new Error('No ADDRESS_VERIFICATION agent configuration found');
    }
    try {
        if (agentConfig.type !== 'http') {
            return {
                proposal: 'escalate',
                confidence: 0.1,
                reasons: ['Unsupported agent type'],
                policy_refs: ['address_verification_policy'],
                flags: { unsupported_agent_type: true },
                metadata: {
                    agent_name: 'address_verification',
                    slot: context.slot
                }
            };
        }
        // Extract address from the context
        const addressData = extractAddressFromContext(context);
        console.log('Sending address verification request:', addressData);
        // Call the standalone address verification service
        const response = await (0, httpHelper_1.callHttpAgent)(agentConfig.endpoint, // Should be http://localhost:5000/api/v1/verify
        addressData, agentConfig.timeout_ms);
        console.log('Received response from address service:', JSON.stringify(response, null, 2));
        if (!response) {
            throw new Error('No response from address verification service');
        }
        // Map the response to the expected format
        return mapAddressVerificationResponse(response, 'address_verification', context.slot);
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
                agent_name: 'address_verification',
                slot: context.slot,
                error: errorMessage,
                timestamp: new Date().toISOString()
            }
        };
    }
}
/**
 * Extracts address data from the agent context
 */
function extractAddressFromContext(context) {
    // Check if address is directly in the payload
    if (context.payload.address) {
        return context.payload.address;
    }
    // Check if the payload itself is the address
    if (context.payload.line1 || context.payload.postalCode) {
        return context.payload;
    }
    // Try to extract from a customer object
    if (context.payload.customer?.address) {
        return context.payload.customer.address;
    }
    // Fallback to the entire payload
    return context.payload;
}
/**
 * Maps the address verification response to the expected format
 */
function mapAddressVerificationResponse(response, agentId, slot) {
    // Handle error response
    if (!response.success) {
        return {
            proposal: 'deny',
            confidence: 0.9,
            reasons: response.error ? [response.error] : ['Address verification failed'],
            policy_refs: ['ADDRESS_VERIFICATION_FAILED'],
            flags: {
                address_verified: false,
                verification_error: true
            },
            metadata: {
                agent_name: agentId,
                slot,
                error: response.error || 'Unknown error',
                timestamp: new Date().toISOString()
            }
        };
    }
    // Handle successful verification
    const data = response.data || response;
    const isVerified = data.verificationStatus === 'valid' || data.standardized === true;
    return {
        proposal: isVerified ? 'approve' : 'deny',
        confidence: data.confidenceScore || (isVerified ? 0.9 : 0.1),
        reasons: data.issues && data.issues.length > 0
            ? data.issues
            : [isVerified ? 'Address verified successfully' : 'Address verification failed'],
        policy_refs: ['ADDRESS_VERIFICATION_POLICY'],
        flags: {
            address_verified: isVerified,
            verification_score: data.confidenceScore || (isVerified ? 0.9 : 0.1)
        },
        metadata: {
            ...data.metadata,
            agent_name: agentId,
            slot,
            verification_timestamp: new Date().toISOString(),
            verified_address: data.verified_address ||
                `${data.line1}, ${data.city}, ${data.state} ${data.postalCode}, ${data.country}`
        }
    };
}
