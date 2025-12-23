"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAddressAgent = runAddressAgent;
const agentRegistry_1 = require("../registry/agentRegistry");
const httpHelper_1 = require("../utils/httpHelper");
// Log levels for consistent logging
var LogLevel;
(function (LogLevel) {
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
    LogLevel["DEBUG"] = "DEBUG";
})(LogLevel || (LogLevel = {}));
// Enhanced logger function for the agent
function logAgent(level, message, context, data = {}) {
    const requestId = context.requestId || 'unknown-request';
    const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        service: 'address-agent',
        agent: 'address-verification',
        requestId,
        message,
        ...(Object.keys(data).length > 0 && { data })
    };
    // In production, you might want to send this to a centralized logging service
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](JSON.stringify(logEntry, null, 2));
}
/**
 * Creates a standardized error response
 * @param errorType Type of the error
 * @param message Error message
 * @param slot The slot being processed
 * @param requestId Optional request ID for tracking
 * @returns Formatted error response
 */
function createErrorResponse(errorType, message, slot, requestId) {
    return {
        proposal: 'escalate',
        confidence: 0.1,
        reasons: [message],
        policy_refs: ['ADDRESS_VERIFICATION_POLICY'],
        flags: {
            verification_error: true,
            error_type: errorType
        },
        metadata: {
            agent_name: 'address_verification',
            slot,
            request_id: requestId || `req-${Date.now()}`,
            timestamp: new Date().toISOString(),
            error: {
                type: errorType,
                message: message
            }
        }
    };
}
async function runAddressAgent(context) {
    const startTime = Date.now();
    const requestId = context.requestId || `addr-${Date.now()}`;
    logAgent(LogLevel.INFO, 'Starting address verification', context, {
        slot: context.slot,
        haspayload: !!context.payload?.payload
    });
    try {
        const agentInfo = (0, agentRegistry_1.getAgentConfig)('ADDRESS_VERIFICATION');
        if (!agentInfo) {
            const error = 'No ADDRESS_VERIFICATION agent configuration found';
            logAgent(LogLevel.ERROR, error, context);
            return createErrorResponse('configuration_error', error, context.slot);
        }
        const { agentId, config: agentConfig } = agentInfo;
        if (agentConfig.type !== 'http') {
            const error = 'Unsupported agent type';
            logAgent(LogLevel.WARN, error, context, { type: agentConfig.type });
            return {
                proposal: 'escalate',
                confidence: 0.1,
                reasons: [error],
                policy_refs: ['address_verification_policy'],
                flags: { unsupported_agent_type: true },
                metadata: {
                    agent_name: 'address_verification',
                    slot: context.slot,
                    timestamp: new Date().toISOString(),
                    requestId
                }
            };
        }
        // Extract address from the context
        const addressData = extractAddressFromContext(context);
        logAgent(LogLevel.DEBUG, 'Extracted address data', context, {
            hasAddress: !!addressData,
            fields: addressData ? Object.keys(addressData) : []
        });
        if (!addressData) {
            const error = 'No address found in the request context';
            logAgent(LogLevel.WARN, error, context);
            return createErrorResponse('validation_error', 'No address found in the request context', context.slot, context.requestId);
        }
        logAgent(LogLevel.INFO, 'Calling address verification service', context, {
            endpoint: agentConfig.endpoint,
            timeout: agentConfig.timeout_ms
        });
        // Call the standalone address verification service
        const response = await (0, httpHelper_1.callHttpAgent)(agentConfig.endpoint, {
            ...addressData,
            customerId: context.customerId,
            applicationId: context.applicationId,
            slot: context.slot,
            sessionId: context.sessionId ?? '', // Add this line
            payload: {
                ...addressData,
                metadata: {
                    requestId,
                    timestamp: new Date().toISOString(),
                    source: 'address-agent'
                }
            }
        }, agentConfig.timeout_ms);
        const responseTime = Date.now() - startTime;
        if (!response) {
            const error = 'No response from address verification service';
            logAgent(LogLevel.ERROR, error, context, { responseTime });
            return createErrorResponse('service_unavailable', error, context.slot, requestId);
        }
        logAgent(LogLevel.INFO, 'Address verification completed', context, {
            responseTime: `${responseTime}ms`,
            hasSuggestions: response.data?.suggestions?.length > 0,
            isValid: response.success
        });
        // Map the response to the expected format
        return mapAddressVerificationResponse(response, 'address_verification', context.slot, requestId);
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during address verification';
        logAgent(LogLevel.ERROR, 'Address verification failed', context, {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            responseTime: `${Date.now() - startTime}ms`
        });
        console.error('Error in address verification agent:', {
            error: errorMessage,
            context: {
                payload: context.payload,
                slot: context.slot
            }
        });
        return createErrorResponse('unknown_error', errorMessage, context.slot, requestId);
    }
}
/**
 * Extracts and validates address data from the agent context
 * @param context The agent context containing user data
 * @returns Object containing address information
 */
function extractAddressFromContext(context) {
    try {
        console.log('Extracting address from context:', JSON.stringify(context, null, 2));
        if (!context || !context.payload) {
            console.log('No payload in context');
            return null;
        }
        const { payload } = context;
        console.log('Payload content:', JSON.stringify(payload, null, 2));
        // Extract address from different possible locations in the payload
        const address = payload.address || payload.line1 ? {
            line1: payload.line1 || payload.address,
            city: payload.city,
            state: payload.state,
            postalCode: payload.postalCode || payload.zip,
            country: payload.country
        } : null;
        console.log('Extracted address:', JSON.stringify(address, null, 2));
        return address;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        const errorStack = error instanceof Error ? error.stack : undefined;
        logAgent(LogLevel.ERROR, 'Error extracting address data', context, {
            error: errorMessage,
            stack: errorStack
        });
        return {};
    }
}
/**
 * Maps the verification service response to the agent output format
 * @param response Response from the verification service
 * @param agentId ID of the agent
 * @param slot The slot being processed
 * @param requestId Request ID for tracking
 * @returns Formatted agent output
 */
function mapAddressVerificationResponse(response, agentId, slot, requestId) {
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
            ...(data.metadata || {}),
            agent_name: agentId,
            slot,
            request_id: requestId,
            verification_timestamp: new Date().toISOString()
        }
    };
}
