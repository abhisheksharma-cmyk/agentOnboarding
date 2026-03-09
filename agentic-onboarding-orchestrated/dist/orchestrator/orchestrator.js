"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initOrchestrator = initOrchestrator;
const eventBus_1 = require("../eventBus/eventBus");
const kycAgent_1 = require("../agents/kycAgent");
const amlAgent_1 = require("../agents/amlAgent");
const creditAgent_1 = require("../agents/creditAgent");
const riskAgent_1 = require("../agents/riskAgent");
const addressAgent_1 = require("../agents/addressAgent");
const decisionGateway_1 = require("../decisionGateway/decisionGateway");
const audit_1 = require("../auditTracking/audit");
const stateMachine_1 = require("./stateMachine");
// Store state machines by traceId
const stateMachines = new Map();
// Store results of completed onboarding processes by traceId
const runResults = {};
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const withRetry = async (operation, operationName, traceId, maxRetries = MAX_RETRIES) => {
    let lastError = null;
    let attempt = 0;
    while (attempt <= maxRetries) {
        try {
            const result = await operation();
            if (attempt > 0) {
                console.log(`[${traceId}] Operation ${operationName} succeeded after ${attempt} retries`);
            }
            return result;
        }
        catch (error) {
            lastError = error;
            attempt++;
            if (attempt <= maxRetries) {
                const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
                console.warn(`[${traceId}] Attempt ${attempt}/${maxRetries} failed for ${operationName}. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    console.error(`[${traceId}] Operation ${operationName} failed after ${maxRetries} attempts`);
    throw lastError || new Error(`Operation ${operationName} failed`);
};
/**
 * Hybrid orchestration with state machine pattern:
 * - Uses a state machine to manage workflow state
 * - Implements retry logic with exponential backoff
 * - Provides detailed logging of state transitions
 * - Tracks operation history for debugging
 */
function initOrchestrator() {
    eventBus_1.eventBus.subscribe("onboarding.started", async ({ data, traceId }) => {
        try {
            const ctx = data;
            let stateMachine = (0, stateMachine_1.createStateMachine)(ctx, MAX_RETRIES);
            // Transition from INITIALIZED to KYC_STARTED
            stateMachine = (0, stateMachine_1.transitionState)(stateMachine, 'START', {});
            stateMachines.set(traceId, stateMachine);
            (0, audit_1.audit)(traceId, "onboarding.started", { ctx });
            (0, stateMachine_1.logStateTransition)(traceId, 'INITIALIZED', 'KYC_STARTED', 'START');
            // Start the KYC process
            eventBus_1.eventBus.publish("onboarding.kyc", { ...ctx, stateMachine }, traceId);
        }
        catch (error) {
            console.error(`[${traceId}] Error in onboarding.started:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'Unknown error',
                traceId,
                step: 'START'
            }, traceId);
        }
    });
    // KYC -> AML
    eventBus_1.eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "kyc.invoked", { ctx, stateMachine });
            // State machine should already be in KYC_STARTED from onboarding.started
            // But handle edge case where it might not be
            let currentMachine = stateMachine;
            if (currentMachine.currentState === 'INITIALIZED') {
                currentMachine = (0, stateMachine_1.transitionState)(currentMachine, 'START', {});
                stateMachines.set(traceId, currentMachine);
                (0, stateMachine_1.logStateTransition)(traceId, 'INITIALIZED', 'KYC_STARTED', 'START');
            }
            const response = await withRetry(() => (0, kycAgent_1.runKycAgent)(ctx), 'KYC_VERIFICATION', traceId);
            // Convert AgentResponse to AgentOutput
            const agentOutput = {
                ...response,
                proposal: response.proposal || 'escalate',
                confidence: response.confidence || 0,
                reasons: response.reasons || [],
                policy_refs: response.policy_refs || [],
                flags: response.flags || {}
            };
            const durationMs = Date.now() - new Date(currentMachine.history[currentMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(agentOutput);
            (0, audit_1.audit)(traceId, "kyc.completed", {
                agentOutput,
                finalDecision: final,
                durationMs
            });
            // Update state machine based on decision
            let updatedMachine;
            if (final === "APPROVE") {
                // Transition from KYC_STARTED to KYC_COMPLETED
                updatedMachine = (0, stateMachine_1.transitionState)(currentMachine, 'KYC_APPROVED', { agentOutput, durationMs });
                (0, stateMachine_1.logStateTransition)(traceId, currentMachine.currentState, updatedMachine.currentState, 'KYC_APPROVED');
                stateMachines.set(traceId, updatedMachine);
                eventBus_1.eventBus.publish("onboarding.kyc_complete", {
                    agentOutput,
                    final,
                    ctx,
                    durationMs
                }, traceId);
                // Move to next step
                const nextMachine = (0, stateMachine_1.transitionState)(updatedMachine, 'START', {});
                (0, stateMachine_1.logStateTransition)(traceId, updatedMachine.currentState, nextMachine.currentState, 'START');
                stateMachines.set(traceId, nextMachine);
                eventBus_1.eventBus.publish("onboarding.address_verification", { ...ctx, stateMachine: nextMachine }, traceId);
            }
            else {
                // For ESCALATE or DENY, transition from KYC_STARTED to COMPLETED
                updatedMachine = (0, stateMachine_1.transitionState)(currentMachine, 'KYC_REJECTED', { agentOutput, durationMs });
                (0, stateMachine_1.logStateTransition)(traceId, currentMachine.currentState, updatedMachine.currentState, 'KYC_REJECTED');
                stateMachines.set(traceId, updatedMachine);
                eventBus_1.eventBus.publish("onboarding.kyc_complete", {
                    agentOutput,
                    final,
                    ctx,
                    durationMs
                }, traceId);
                eventBus_1.eventBus.publish("onboarding.finished", { final, agentOutput }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in KYC process:`, error);
            // Get the latest state machine before handling error
            const latestMachine = stateMachines.get(traceId);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'KYC processing failed',
                traceId,
                step: 'KYC',
                currentState: latestMachine?.currentState
            }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.address_verification", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "address_verification.invoked", { ctx });
            const start = Date.now();
            const agentOutput = await (0, addressAgent_1.runAddressAgent)(ctx);
            const durationMs = Date.now() - start;
            const final = (0, decisionGateway_1.evaluateDecision)(agentOutput);
            (0, audit_1.audit)(traceId, "address_verification.completed", { agentOutput, finalDecision: final, durationMs });
            // Update state machine
            const event = final === "APPROVE" ? 'ADDRESS_VERIFIED' : 'ADDRESS_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { agentOutput, durationMs });
            stateMachines.set(traceId, updatedMachine);
            (0, stateMachine_1.logStateTransition)(traceId, stateMachine.currentState, updatedMachine.currentState, event);
            eventBus_1.eventBus.publish("onboarding.address_verification_complete", { agentOutput, final, ctx, durationMs }, traceId);
            if (final === "APPROVE") {
                const nextMachine = (0, stateMachine_1.transitionState)(updatedMachine, 'START', {});
                (0, stateMachine_1.logStateTransition)(traceId, updatedMachine.currentState, nextMachine.currentState, 'START');
                stateMachines.set(traceId, nextMachine);
                eventBus_1.eventBus.publish("onboarding.aml", { ...ctx, stateMachine: nextMachine }, traceId);
            }
            else {
                eventBus_1.eventBus.publish("onboarding.finished", { final, agentOutput }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in address verification:`, error);
            const latestMachine = stateMachines.get(traceId);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'Address verification failed',
                traceId,
                step: 'ADDRESS_VERIFICATION',
                currentState: latestMachine?.currentState
            }, traceId);
        }
    });
    // AML -> Credit
    eventBus_1.eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "aml.invoked", { ctx });
            const agentOutput = await withRetry(() => (0, amlAgent_1.runAmlAgent)(ctx), 'AML_VERIFICATION', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(agentOutput);
            (0, audit_1.audit)(traceId, "aml.completed", {
                agentOutput,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const event = final === "APPROVE" ? 'AML_APPROVED' : 'AML_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { agentOutput, durationMs });
            stateMachines.set(traceId, updatedMachine);
            (0, stateMachine_1.logStateTransition)(traceId, stateMachine.currentState, updatedMachine.currentState, event);
            eventBus_1.eventBus.publish("onboarding.aml_complete", {
                agentOutput,
                final,
                ctx,
                durationMs
            }, traceId);
            // Trigger next step based on AML result
            if (final === "APPROVE") {
                const nextMachine = (0, stateMachine_1.transitionState)(updatedMachine, 'START', {});
                (0, stateMachine_1.logStateTransition)(traceId, updatedMachine.currentState, nextMachine.currentState, 'START');
                stateMachines.set(traceId, nextMachine);
                eventBus_1.eventBus.publish("onboarding.credit", { ...ctx, stateMachine: nextMachine }, traceId);
            }
            else {
                eventBus_1.eventBus.publish("onboarding.finished", { final, agentOutput }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in AML process:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'AML processing failed',
                traceId,
                step: 'AML'
            }, traceId);
        }
    });
    // Credit -> Risk
    eventBus_1.eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "credit.invoked", { ctx });
            (0, stateMachine_1.logStateTransition)(traceId, 'CREDIT_STARTED', 'CREDIT_COMPLETED', 'CREDIT_APPROVED');
            const agentOutput = await withRetry(() => (0, creditAgent_1.runCreditAgent)(ctx), 'CREDIT_CHECK', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(agentOutput);
            (0, audit_1.audit)(traceId, "credit.completed", {
                agentOutput,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const event = final === "APPROVE" ? 'CREDIT_APPROVED' : 'CREDIT_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { agentOutput, durationMs });
            stateMachines.set(traceId, updatedMachine);
            eventBus_1.eventBus.publish("onboarding.credit_complete", {
                agentOutput,
                final,
                ctx,
                durationMs
            }, traceId);
            // Trigger next step based on credit check result
            if (final === "APPROVE") {
                const nextMachine = (0, stateMachine_1.transitionState)(updatedMachine, 'START', {});
                (0, stateMachine_1.logStateTransition)(traceId, updatedMachine.currentState, nextMachine.currentState, 'START');
                stateMachines.set(traceId, nextMachine);
                eventBus_1.eventBus.publish("onboarding.risk", { ...ctx, stateMachine: nextMachine }, traceId);
            }
            else {
                (0, stateMachine_1.logStateTransition)(traceId, 'CREDIT_COMPLETED', 'COMPLETED', 'CREDIT_REJECTED');
                eventBus_1.eventBus.publish("onboarding.finished", { final, agentOutput }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in credit check:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'Credit check failed',
                traceId,
                step: 'CREDIT_CHECK'
            }, traceId);
        }
    });
    // Risk -> Finish
    eventBus_1.eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "risk.invoked", { ctx });
            (0, stateMachine_1.logStateTransition)(traceId, 'RISK_STARTED', 'COMPLETED', 'COMPLETE');
            const agentOutput = await withRetry(() => (0, riskAgent_1.runRiskAgent)(ctx), 'RISK_ASSESSMENT', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(agentOutput);
            (0, audit_1.audit)(traceId, "risk.completed", {
                agentOutput,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, 'COMPLETE', { agentOutput, durationMs });
            stateMachines.set(traceId, updatedMachine);
            // Publish completion events
            eventBus_1.eventBus.publish("onboarding.risk_complete", {
                agentOutput,
                final,
                ctx,
                durationMs
            }, traceId);
            eventBus_1.eventBus.publish("onboarding.finished", {
                final,
                agentOutput,
                stateMachine: updatedMachine
            }, traceId);
        }
        catch (error) {
            console.error(`[${traceId}] Error in risk assessment:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'Risk assessment failed',
                traceId,
                step: 'RISK_ASSESSMENT'
            }, traceId);
        }
    });
    // Add this at the end of the initOrchestrator function, before the closing brace
    eventBus_1.eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
        try {
            const stateMachine = stateMachines.get(traceId);
            if (stateMachine) {
                if (stateMachine.currentState !== 'COMPLETED') {
                    (0, stateMachine_1.logStateTransition)(traceId, stateMachine.currentState, 'COMPLETED', 'COMPLETE', data);
                }
                // Clean up the state machine after completion
                stateMachines.delete(traceId);
            }
            // Store the final result
            runResults[traceId] = data;
        }
        catch (error) {
            console.error(`[${traceId}] Error in finished handler:`, error);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.error", ({ data, traceId }) => {
        const { error, step, currentState } = data;
        console.error(`[${traceId}] Error in step ${step || 'unknown'}:`, error);
        // Get the latest state machine
        const stateMachine = stateMachines.get(traceId);
        if (stateMachine) {
            const actualState = currentState || stateMachine.currentState;
            // Only log transition if we're in a valid state
            // Don't try to transition invalid states - just log and clean up
            if (actualState !== 'INITIALIZED' || step !== 'KYC') {
                // Create a failed state based on the current state
                const failedState = actualState.endsWith('_STARTED')
                    ? actualState.replace('_STARTED', '_FAILED')
                    : actualState.endsWith('_COMPLETED')
                        ? actualState.replace('_COMPLETED', '_FAILED')
                        : `${actualState}_FAILED`;
                (0, stateMachine_1.logStateTransition)(traceId, actualState, failedState, 'COMPLETE', {
                    error: error instanceof Error ? error.message : String(error),
                    step,
                    status: 'error'
                });
            }
            else {
                // For INITIALIZED state errors, just log without invalid transition
                console.error(`[${traceId}] Error occurred in ${actualState} state, cannot transition. Cleaning up.`);
            }
            // Clean up the state machine on error
            stateMachines.delete(traceId);
        }
    });
}
async function runAndEvaluate(runner, ctx, traceId, stage) {
    (0, audit_1.audit)(traceId, `${stage}.invoked`, { ctx });
    const start = Date.now();
    const out = await runner(ctx);
    const durationMs = Date.now() - start;
    const final = (0, decisionGateway_1.evaluateDecision)(out);
    (0, audit_1.audit)(traceId, `${stage}.completed`, { agentOutput: out, finalDecision: final, durationMs });
    return { out, final, durationMs };
}
