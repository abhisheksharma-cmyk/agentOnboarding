import { AgentContext, AgentOutput } from "../types/types";
import { resolveAgent } from "../registry/agentRegistry";
import { callHttpAgent } from "../utils/httpHelper";
export async function runAddressAgent(
    context: AgentContext
): Promise<AgentOutput> {
    const { agentId, config: agentConfig } = resolveAgent('ADDRESS_VERIFICATION');

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

        const response = await callHttpAgent(agentConfig.endpoint, context, agentConfig.timeout_ms);

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

    } catch (error: unknown) {
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