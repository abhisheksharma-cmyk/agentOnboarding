import { AgentOutput } from "../types/types";
import { AgentContext } from "../types/types";
import { getAgentConfig } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";

// Log levels for consistent logging
enum LogLevel {
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    DEBUG = 'DEBUG'
}

// Logging interface
interface LogEntry {
    timestamp: string;
    level: LogLevel;
    service: string;
    agent: string;
    requestId?: string;
    message: string;
    data?: any;
}

// Enhanced logger function for the agent
function logAgent(level: LogLevel, message: string, context: AgentContext, data: any = {}): void {
    const requestId = context.requestId || 'unknown-request';
    const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        service: 'address-agent',
        agent: 'address-verification',
        requestId,
        message,
        ...(Object.keys(data).length > 0 && { data })
    };

    // In production, you might want to send this to a centralized logging service
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
        JSON.stringify(logEntry, null, 2)
    );
}

/**
 * Creates a standardized error response
 * @param errorType Type of the error
 * @param message Error message
 * @param slot The slot being processed
 * @param requestId Optional request ID for tracking
 * @returns Formatted error response
 */
function createErrorResponse(
    errorType: string,
    message: string,
    slot: string,
    requestId?: string
): AgentOutput {
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

export async function runAddressAgent(
    context: AgentContext
): Promise<AgentOutput> {
    const startTime = Date.now();
    const requestId = context.requestId || `addr-${Date.now()}`;

    logAgent(LogLevel.INFO, 'Starting address verification', context, {
        slot: context.slot,
        haspayload: !!context.payload?.payload
    });

    try {
        const agentInfo = getAgentConfig('ADDRESS_VERIFICATION');
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
            return createErrorResponse(
                'validation_error',
                'No address found in the request context',
                context.slot,
                context.requestId
            );
        }

        logAgent(LogLevel.INFO, 'Calling address verification service', context, {
            endpoint: agentConfig.endpoint,
            timeout: agentConfig.timeout_ms
        });

        // Call the standalone address verification service
        const response = await callHttpAgent(
            agentConfig.endpoint,
            {
                ...addressData,
                customerId: context.customerId,
                applicationId: context.applicationId,
                slot: context.slot,
                sessionId: context.sessionId ?? '',  // Add this line
                payload: {
                    ...addressData,
                    metadata: {
                        requestId,
                        timestamp: new Date().toISOString(),
                        source: 'address-agent'
                    }
                }
            },
            agentConfig.timeout_ms
        );

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
        return mapAddressVerificationResponse(
            response,
            'address_verification',
            context.slot,
            requestId
        );

    } catch (error: any) {
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
function extractAddressFromContext(context: AgentContext): Record<string, any> | null {
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
    } catch (error: unknown) {
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
// In agentic-onboarding-orchestrated/src/agents/addressAgent.ts
function mapAddressVerificationResponse(
    response: any,
    agentId: string,
    slot: string,
    requestId: string
): AgentOutput {
    const data = response.data || response;

    // Handle both the mock response format and the actual service response format
    const isVerified = data.verified === true ||
        data.verificationStatus === 'valid' ||
        data.standardized === true;

    // Extract confidence score with a default
    const confidence = data.confidence ||
        (data.flags && data.flags.verification_score) ||
        (isVerified ? 0.9 : 0.1);

    // Extract reasons from different possible locations in the response
    let reasons: string[] = [];
    if (data.reasons && Array.isArray(data.reasons)) {
        reasons = data.reasons;
    } else if (data.issues && Array.isArray(data.issues)) {
        reasons = data.issues;
    } else if (data.message) {
        reasons = [data.message];
    } else {
        reasons = [isVerified ? 'Address verified successfully' : 'Address verification failed'];
    }

    return {
        proposal: isVerified ? 'approve' : 'deny',
        confidence: confidence,
        reasons: reasons,
        policy_refs: ['ADDRESS_VERIFICATION_POLICY'],
        flags: {
            address_verified: isVerified,
            verification_score: confidence,
            ...(data.flags || {})
        },
        metadata: {
            ...(data.metadata || {}),
            agent_name: agentId,
            slot,
            request_id: requestId,
            verification_timestamp: new Date().toISOString(),
            verificationMethod: (data.metadata && data.metadata.verificationMethod) || 'standard'
        }
    };
}