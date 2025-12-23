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
            const stateMachine = (0, stateMachine_1.createStateMachine)(ctx, MAX_RETRIES);
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
                traceId
            }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "kyc.invoked", { ctx });
            (0, stateMachine_1.logStateTransition)(traceId, 'KYC_STARTED', 'KYC_COMPLETED', 'KYC_APPROVED');
            const out = await withRetry(() => (0, kycAgent_1.runKycAgent)(ctx), 'KYC_VERIFICATION', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(out);
            (0, audit_1.audit)(traceId, "kyc.completed", {
                agentOutput: out,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const event = final === "APPROVE" ? 'KYC_APPROVED' : 'KYC_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { out, durationMs });
            stateMachines.set(traceId, updatedMachine);
            eventBus_1.eventBus.publish("onboarding.kyc_complete", {
                out,
                final,
                ctx,
                durationMs
            }, traceId);
            // Trigger next step based on KYC result
            if (final === "APPROVE") {
                (0, stateMachine_1.logStateTransition)(traceId, 'KYC_COMPLETED', 'ADDRESS_VERIFICATION_STARTED', 'START');
                eventBus_1.eventBus.publish("onboarding.address_verification", { ...ctx, stateMachine: updatedMachine }, traceId);
            }
            else {
                (0, stateMachine_1.logStateTransition)(traceId, 'KYC_COMPLETED', 'COMPLETED', 'KYC_REJECTED');
                eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in KYC process:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'KYC processing failed',
                traceId,
                step: 'KYC'
            }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.kyc_complete", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const { out: kycResult, ctx } = data;
            if (kycResult.proposal === 'approve') {
                (0, stateMachine_1.logStateTransition)(traceId, 'KYC_COMPLETED', 'ADDRESS_VERIFICATION_STARTED', 'START');
                eventBus_1.eventBus.publish("onboarding.address_verification", { ...ctx, stateMachine }, traceId);
            }
            else {
                (0, stateMachine_1.logStateTransition)(traceId, 'KYC_COMPLETED', 'COMPLETED', 'KYC_REJECTED');
                eventBus_1.eventBus.publish("onboarding.finished", {
                    final: 'DENY',
                    out: kycResult
                }, traceId);
            }
        }
        catch (error) {
            console.error(`[${traceId}] Error in KYC complete handler:`, error);
            eventBus_1.eventBus.publish("onboarding.error", {
                error: error instanceof Error ? error.message : 'Error in KYC complete handler',
                traceId,
                step: 'KYC_COMPLETE'
            }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.address_verification", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "address_verification.invoked", { ctx });
        const start = Date.now();
        const out = await (0, addressAgent_1.runAddressAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "address_verification.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.address_verification_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.aml", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.address_verification", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "address_verification.invoked", { ctx });
        const start = Date.now();
        const out = await (0, addressAgent_1.runAddressAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "address_verification.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.address_verification_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.aml", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
        const stateMachine = stateMachines.get(traceId);
        if (!stateMachine) {
            console.error(`[${traceId}] No state machine found for traceId`);
            return;
        }
        try {
            const ctx = data;
            (0, audit_1.audit)(traceId, "aml.invoked", { ctx });
            (0, stateMachine_1.logStateTransition)(traceId, 'AML_STARTED', 'AML_COMPLETED', 'AML_APPROVED');
            const out = await withRetry(() => (0, amlAgent_1.runAmlAgent)(ctx), 'AML_VERIFICATION', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(out);
            (0, audit_1.audit)(traceId, "aml.completed", {
                agentOutput: out,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const event = final === "APPROVE" ? 'AML_APPROVED' : 'AML_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { out, durationMs });
            stateMachines.set(traceId, updatedMachine);
            eventBus_1.eventBus.publish("onboarding.aml_complete", {
                out,
                final,
                ctx,
                durationMs
            }, traceId);
            // Trigger next step based on AML result
            if (final === "APPROVE") {
                (0, stateMachine_1.logStateTransition)(traceId, 'AML_COMPLETED', 'CREDIT_STARTED', 'START');
                eventBus_1.eventBus.publish("onboarding.credit", { ...ctx, stateMachine: updatedMachine }, traceId);
            }
            else {
                (0, stateMachine_1.logStateTransition)(traceId, 'AML_COMPLETED', 'COMPLETED', 'AML_REJECTED');
                eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
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
            const out = await withRetry(() => (0, creditAgent_1.runCreditAgent)(ctx), 'CREDIT_CHECK', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(out);
            (0, audit_1.audit)(traceId, "credit.completed", {
                agentOutput: out,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const event = final === "APPROVE" ? 'CREDIT_APPROVED' : 'CREDIT_REJECTED';
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, event, { out, durationMs });
            stateMachines.set(traceId, updatedMachine);
            eventBus_1.eventBus.publish("onboarding.credit_complete", {
                out,
                final,
                ctx,
                durationMs
            }, traceId);
            // Trigger next step based on credit check result
            if (final === "APPROVE") {
                (0, stateMachine_1.logStateTransition)(traceId, 'CREDIT_COMPLETED', 'RISK_STARTED', 'START');
                eventBus_1.eventBus.publish("onboarding.risk", { ...ctx, stateMachine: updatedMachine }, traceId);
            }
            else {
                (0, stateMachine_1.logStateTransition)(traceId, 'CREDIT_COMPLETED', 'COMPLETED', 'CREDIT_REJECTED');
                eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
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
            const out = await withRetry(() => (0, riskAgent_1.runRiskAgent)(ctx), 'RISK_ASSESSMENT', traceId);
            const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
            const final = (0, decisionGateway_1.evaluateDecision)(out);
            (0, audit_1.audit)(traceId, "risk.completed", {
                agentOutput: out,
                finalDecision: final,
                durationMs
            });
            // Update state machine
            const updatedMachine = (0, stateMachine_1.transitionState)(stateMachine, 'COMPLETE', { out, durationMs });
            stateMachines.set(traceId, updatedMachine);
            // Publish completion events
            eventBus_1.eventBus.publish("onboarding.risk_complete", {
                out,
                final,
                ctx,
                durationMs
            }, traceId);
            eventBus_1.eventBus.publish("onboarding.finished", {
                final,
                out,
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
                (0, stateMachine_1.logStateTransition)(traceId, stateMachine.currentState, 'COMPLETED', 'COMPLETE', data);
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
        const { error, step } = data; // Destructure from data instead
        console.error(`[${traceId}] Error in step ${step || 'unknown'}:`, error);
        const stateMachine = stateMachines.get(traceId);
        if (stateMachine) {
            // Create a failed state based on the current state
            const failedState = stateMachine.currentState.endsWith('_STARTED')
                ? stateMachine.currentState.replace('_STARTED', '_FAILED')
                : stateMachine.currentState.endsWith('_COMPLETED')
                    ? stateMachine.currentState.replace('_COMPLETED', '_FAILED')
                    : `${stateMachine.currentState}_FAILED`;
            // Use a type assertion for the error event
            (0, stateMachine_1.logStateTransition)(traceId, stateMachine.currentState, failedState, 'COMPLETE', {
                error: error instanceof Error ? error.message : String(error),
                step,
                status: 'error'
            });
            // Update the state machine's current state before cleaning up
            stateMachine.currentState = failedState;
            // Optionally clean up the state machine on error
            stateMachines.delete(traceId);
        }
    });
}
