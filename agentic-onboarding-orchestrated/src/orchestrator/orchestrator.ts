
import { eventBus } from "../eventBus/eventBus";
import { runKycAgent } from "../agents/kycAgent";
import { runAmlAgent } from "../agents/amlAgent";
import { runCreditAgent } from "../agents/creditAgent";
import { runRiskAgent } from "../agents/riskAgent";
import { runAddressAgent } from "../agents/addressAgent";
import { evaluateDecision } from "../decisionGateway/decisionGateway";
import { AgentContext } from "../types/types";
import { audit } from "../auditTracking/audit";
import {
  OnboardingStateMachine,
  createStateMachine,
  transitionState,
  logStateTransition,
  OnboardingState,
  OnboardingEvent
} from "./stateMachine";

// Store state machines by traceId
const stateMachines = new Map<string, OnboardingStateMachine>();

// Store results of completed onboarding processes by traceId
const runResults: Record<string, any> = {};

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const withRetry = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  traceId: string,
  maxRetries = MAX_RETRIES
): Promise<T> => {
  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    try {
      const result = await operation();
      if (attempt > 0) {
        console.log(`[${traceId}] Operation ${operationName} succeeded after ${attempt} retries`);
      }
      return result;
    } catch (error) {
      lastError = error as Error;
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
export function initOrchestrator() {

  eventBus.subscribe("onboarding.started", async ({ data, traceId }) => {
    try {
      const ctx: AgentContext = data;
      const stateMachine = createStateMachine(ctx, MAX_RETRIES);
      stateMachines.set(traceId, stateMachine);

      audit(traceId, "onboarding.started", { ctx });
      logStateTransition(traceId, 'INITIALIZED', 'KYC_STARTED', 'START');

      // Start the KYC process
      eventBus.publish("onboarding.kyc", { ...ctx, stateMachine }, traceId);
    } catch (error) {
      console.error(`[${traceId}] Error in onboarding.started:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'Unknown error',
        traceId
      }, traceId);
    }
  });

  eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
    const stateMachine = stateMachines.get(traceId);
    if (!stateMachine) {
      console.error(`[${traceId}] No state machine found for traceId`);
      return;
    }

    try {
      const ctx: AgentContext = data;
      audit(traceId, "kyc.invoked", { ctx });
      logStateTransition(traceId, 'KYC_STARTED', 'KYC_COMPLETED', 'KYC_APPROVED');

      const out = await withRetry(
        () => runKycAgent(ctx),
        'KYC_VERIFICATION',
        traceId
      );

      const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
      const final = evaluateDecision(out);

      audit(traceId, "kyc.completed", {
        agentOutput: out,
        finalDecision: final,
        durationMs
      });

      // Update state machine
      const event: OnboardingEvent = final === "APPROVE" ? 'KYC_APPROVED' : 'KYC_REJECTED';
      const updatedMachine = transitionState(stateMachine, event, { out, durationMs });
      stateMachines.set(traceId, updatedMachine);

      eventBus.publish("onboarding.kyc_complete", {
        out,
        final,
        ctx,
        durationMs
      }, traceId);

      // Trigger next step based on KYC result
      if (final === "APPROVE") {
        logStateTransition(traceId, 'KYC_COMPLETED', 'ADDRESS_VERIFICATION_STARTED', 'START');
        eventBus.publish("onboarding.address_verification", { ...ctx, stateMachine: updatedMachine }, traceId);
      } else {
        logStateTransition(traceId, 'KYC_COMPLETED', 'COMPLETED', 'KYC_REJECTED');
        eventBus.publish("onboarding.finished", { final, out }, traceId);
      }
    } catch (error) {
      console.error(`[${traceId}] Error in KYC process:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'KYC processing failed',
        traceId,
        step: 'KYC'
      }, traceId);
    }
  });

  eventBus.subscribe("onboarding.kyc_complete", async ({ data, traceId }) => {
    const stateMachine = stateMachines.get(traceId);
    if (!stateMachine) {
      console.error(`[${traceId}] No state machine found for traceId`);
      return;
    }

    try {
      const { out: kycResult, ctx } = data;

      if (kycResult.proposal === 'approve') {
        logStateTransition(traceId, 'KYC_COMPLETED', 'ADDRESS_VERIFICATION_STARTED', 'START');
        eventBus.publish("onboarding.address_verification", { ...ctx, stateMachine }, traceId);
      } else {
        logStateTransition(traceId, 'KYC_COMPLETED', 'COMPLETED', 'KYC_REJECTED');
        eventBus.publish("onboarding.finished", {
          final: 'DENY',
          out: kycResult
        }, traceId);
      }
    } catch (error) {
      console.error(`[${traceId}] Error in KYC complete handler:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'Error in KYC complete handler',
        traceId,
        step: 'KYC_COMPLETE'
      }, traceId);
    }
  });
  eventBus.subscribe("onboarding.address_verification", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "address_verification.invoked", { ctx });
    const start = Date.now();
    const out = await runAddressAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "address_verification.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.address_verification_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.aml", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  eventBus.subscribe("onboarding.address_verification", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "address_verification.invoked", { ctx });
    const start = Date.now();
    const out = await runAddressAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "address_verification.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.address_verification_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.aml", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
    const stateMachine = stateMachines.get(traceId);
    if (!stateMachine) {
      console.error(`[${traceId}] No state machine found for traceId`);
      return;
    }

    try {
      const ctx: AgentContext = data;
      audit(traceId, "aml.invoked", { ctx });
      logStateTransition(traceId, 'AML_STARTED', 'AML_COMPLETED', 'AML_APPROVED');

      const out = await withRetry(
        () => runAmlAgent(ctx),
        'AML_VERIFICATION',
        traceId
      );

      const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
      const final = evaluateDecision(out);

      audit(traceId, "aml.completed", {
        agentOutput: out,
        finalDecision: final,
        durationMs
      });

      // Update state machine
      const event: OnboardingEvent = final === "APPROVE" ? 'AML_APPROVED' : 'AML_REJECTED';
      const updatedMachine = transitionState(stateMachine, event, { out, durationMs });
      stateMachines.set(traceId, updatedMachine);

      eventBus.publish("onboarding.aml_complete", {
        out,
        final,
        ctx,
        durationMs
      }, traceId);

      // Trigger next step based on AML result
      if (final === "APPROVE") {
        logStateTransition(traceId, 'AML_COMPLETED', 'CREDIT_STARTED', 'START');
        eventBus.publish("onboarding.credit", { ...ctx, stateMachine: updatedMachine }, traceId);
      } else {
        logStateTransition(traceId, 'AML_COMPLETED', 'COMPLETED', 'AML_REJECTED');
        eventBus.publish("onboarding.finished", { final, out }, traceId);
      }
    } catch (error) {
      console.error(`[${traceId}] Error in AML process:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'AML processing failed',
        traceId,
        step: 'AML'
      }, traceId);
    }
  });

  eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
    const stateMachine = stateMachines.get(traceId);
    if (!stateMachine) {
      console.error(`[${traceId}] No state machine found for traceId`);
      return;
    }

    try {
      const ctx: AgentContext = data;
      audit(traceId, "credit.invoked", { ctx });
      logStateTransition(traceId, 'CREDIT_STARTED', 'CREDIT_COMPLETED', 'CREDIT_APPROVED');

      const out = await withRetry(
        () => runCreditAgent(ctx),
        'CREDIT_CHECK',
        traceId
      );

      const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
      const final = evaluateDecision(out);

      audit(traceId, "credit.completed", {
        agentOutput: out,
        finalDecision: final,
        durationMs
      });

      // Update state machine
      const event: OnboardingEvent = final === "APPROVE" ? 'CREDIT_APPROVED' : 'CREDIT_REJECTED';
      const updatedMachine = transitionState(stateMachine, event, { out, durationMs });
      stateMachines.set(traceId, updatedMachine);

      eventBus.publish("onboarding.credit_complete", {
        out,
        final,
        ctx,
        durationMs
      }, traceId);

      // Trigger next step based on credit check result
      if (final === "APPROVE") {
        logStateTransition(traceId, 'CREDIT_COMPLETED', 'RISK_STARTED', 'START');
        eventBus.publish("onboarding.risk", { ...ctx, stateMachine: updatedMachine }, traceId);
      } else {
        logStateTransition(traceId, 'CREDIT_COMPLETED', 'COMPLETED', 'CREDIT_REJECTED');
        eventBus.publish("onboarding.finished", { final, out }, traceId);
      }
    } catch (error) {
      console.error(`[${traceId}] Error in credit check:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'Credit check failed',
        traceId,
        step: 'CREDIT_CHECK'
      }, traceId);
    }
  });

  eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
    const stateMachine = stateMachines.get(traceId);
    if (!stateMachine) {
      console.error(`[${traceId}] No state machine found for traceId`);
      return;
    }

    try {
      const ctx: AgentContext = data;
      audit(traceId, "risk.invoked", { ctx });
      logStateTransition(traceId, 'RISK_STARTED', 'COMPLETED', 'COMPLETE');

      const out = await withRetry(
        () => runRiskAgent(ctx),
        'RISK_ASSESSMENT',
        traceId
      );

      const durationMs = Date.now() - new Date(stateMachine.history[stateMachine.history.length - 1].timestamp).getTime();
      const final = evaluateDecision(out);

      audit(traceId, "risk.completed", {
        agentOutput: out,
        finalDecision: final,
        durationMs
      });

      // Update state machine
      const updatedMachine = transitionState(stateMachine, 'COMPLETE', { out, durationMs });
      stateMachines.set(traceId, updatedMachine);

      // Publish completion events
      eventBus.publish("onboarding.risk_complete", {
        out,
        final,
        ctx,
        durationMs
      }, traceId);

      eventBus.publish("onboarding.finished", {
        final,
        out,
        stateMachine: updatedMachine
      }, traceId);
    } catch (error) {
      console.error(`[${traceId}] Error in risk assessment:`, error);
      eventBus.publish("onboarding.error", {
        error: error instanceof Error ? error.message : 'Risk assessment failed',
        traceId,
        step: 'RISK_ASSESSMENT'
      }, traceId);
    }
  });

  // Add this at the end of the initOrchestrator function, before the closing brace
  eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
    try {
      const stateMachine = stateMachines.get(traceId);
      if (stateMachine) {
        logStateTransition(traceId, stateMachine.currentState, 'COMPLETED', 'COMPLETE', data);
        // Clean up the state machine after completion
        stateMachines.delete(traceId);
      }
      // Store the final result
      runResults[traceId] = data;
    } catch (error) {
      console.error(`[${traceId}] Error in finished handler:`, error);
    }
  });

  eventBus.subscribe("onboarding.error", ({ data, traceId }) => {
    const { error, step } = data;  // Destructure from data instead
    console.error(`[${traceId}] Error in step ${step || 'unknown'}:`, error);
    const stateMachine = stateMachines.get(traceId);
    if (stateMachine) {
      // Create a failed state based on the current state
      const failedState = stateMachine.currentState.endsWith('_STARTED')
        ? stateMachine.currentState.replace('_STARTED', '_FAILED') as OnboardingState
        : stateMachine.currentState.endsWith('_COMPLETED')
          ? stateMachine.currentState.replace('_COMPLETED', '_FAILED') as OnboardingState
          : `${stateMachine.currentState}_FAILED` as OnboardingState;

      // Use a type assertion for the error event
      logStateTransition(traceId, stateMachine.currentState, failedState, 'COMPLETE' as OnboardingEvent, {
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
