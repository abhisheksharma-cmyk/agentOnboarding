const { eventBus } = require("./eventBus");
const { EVENT, createStateMachine, transitionState } = require("./stateMachine");
const { runKycAgent } = require("../agents/kycAgent");
const { runCreditBureauAgent } = require("../agents/creditBureauAgent");
const { runAffordabilityAgent } = require("../agents/affordabilityAgent");
const { runRiskAgent } = require("../agents/riskAgent");
const { evaluateFinalDecision } = require("../decisionGateway");

const stateMachines = new Map();
const runResults = new Map();
const auditTrails = new Map();
const stepOutputs = new Map();

let initialized = false;

function withRetry(operation, retries, delayMs) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const run = () => {
      Promise.resolve(operation())
        .then(resolve)
        .catch((error) => {
          attempts += 1;
          if (attempts > retries) {
            reject(error);
            return;
          }
          setTimeout(run, delayMs * attempts);
        });
    };

    run();
  });
}

function pushAudit(traceId, step, data) {
  const current = auditTrails.get(traceId) || [];
  current.push({ at: new Date().toISOString(), step, data });
  auditTrails.set(traceId, current);
}

function saveStepOutput(traceId, step, output) {
  const current = stepOutputs.get(traceId) || {};
  current[step] = output;
  stepOutputs.set(traceId, current);
}

function finalize(traceId, stateMachine, reason) {
  const outputs = Object.values(stepOutputs.get(traceId) || {});
  const finalDecision = evaluateFinalDecision(outputs);

  runResults.set(traceId, {
    traceId,
    status: "completed",
    reason,
    finalDecision,
    outputs,
    stateMachine
  });

  pushAudit(traceId, "credit_onboarding.finished", { reason, finalDecision });
  stateMachines.delete(traceId);
}

function initOrchestrator() {
  if (initialized) return;
  initialized = true;

  eventBus.subscribe("credit_onboarding.started", async ({ data, traceId }) => {
    try {
      const machine = transitionState(createStateMachine(data), EVENT.START, {});
      stateMachines.set(traceId, machine);
      pushAudit(traceId, "credit_onboarding.started", { applicationId: data.applicationId });
      eventBus.publish("credit_onboarding.kyc", data, traceId);
    } catch (error) {
      eventBus.publish("credit_onboarding.error", { error, step: "START" }, traceId);
    }
  });

  eventBus.subscribe("credit_onboarding.kyc", async ({ data, traceId }) => {
    const machine = stateMachines.get(traceId);
    if (!machine) return;

    try {
      pushAudit(traceId, "kyc.invoked", {});
      const output = await withRetry(() => runKycAgent(data), 2, 250);
      saveStepOutput(traceId, "kyc", output);
      pushAudit(traceId, "kyc.completed", output);

      if (String(output.proposal).toLowerCase() === "approve") {
        const updated = transitionState(machine, EVENT.KYC_APPROVED, output);
        stateMachines.set(traceId, updated);
        eventBus.publish("credit_onboarding.bureau", data, traceId);
        return;
      }

      const updated = transitionState(machine, EVENT.KYC_REJECTED, output);
      finalize(traceId, updated, "kyc_not_approved");
    } catch (error) {
      eventBus.publish("credit_onboarding.error", { error, step: "KYC" }, traceId);
    }
  });

  eventBus.subscribe("credit_onboarding.bureau", async ({ data, traceId }) => {
    const machine = stateMachines.get(traceId);
    if (!machine) return;

    try {
      const started = transitionState(machine, EVENT.START, {});
      stateMachines.set(traceId, started);

      pushAudit(traceId, "bureau.invoked", {});
      const output = await withRetry(() => runCreditBureauAgent(data), 2, 250);
      saveStepOutput(traceId, "bureau", output);
      pushAudit(traceId, "bureau.completed", output);

      if (String(output.proposal).toLowerCase() === "approve") {
        const updated = transitionState(started, EVENT.BUREAU_APPROVED, output);
        stateMachines.set(traceId, updated);
        eventBus.publish("credit_onboarding.affordability", data, traceId);
        return;
      }

      const updated = transitionState(started, EVENT.BUREAU_REJECTED, output);
      finalize(traceId, updated, "bureau_not_approved");
    } catch (error) {
      eventBus.publish("credit_onboarding.error", { error, step: "BUREAU" }, traceId);
    }
  });

  eventBus.subscribe("credit_onboarding.affordability", async ({ data, traceId }) => {
    const machine = stateMachines.get(traceId);
    if (!machine) return;

    try {
      const started = transitionState(machine, EVENT.START, {});
      stateMachines.set(traceId, started);

      pushAudit(traceId, "affordability.invoked", {});
      const output = await withRetry(() => runAffordabilityAgent(data), 2, 250);
      saveStepOutput(traceId, "affordability", output);
      pushAudit(traceId, "affordability.completed", output);

      if (String(output.proposal).toLowerCase() === "approve") {
        const updated = transitionState(started, EVENT.AFFORDABILITY_APPROVED, output);
        stateMachines.set(traceId, updated);
        eventBus.publish("credit_onboarding.risk", data, traceId);
        return;
      }

      const updated = transitionState(started, EVENT.AFFORDABILITY_REJECTED, output);
      finalize(traceId, updated, "affordability_not_approved");
    } catch (error) {
      eventBus.publish("credit_onboarding.error", { error, step: "AFFORDABILITY" }, traceId);
    }
  });

  eventBus.subscribe("credit_onboarding.risk", async ({ data, traceId }) => {
    const machine = stateMachines.get(traceId);
    if (!machine) return;

    try {
      const started = transitionState(machine, EVENT.START, {});
      stateMachines.set(traceId, started);

      pushAudit(traceId, "risk.invoked", {});
      const output = await withRetry(() => runRiskAgent(data), 2, 250);
      saveStepOutput(traceId, "risk", output);
      pushAudit(traceId, "risk.completed", output);

      const completed = transitionState(started, EVENT.COMPLETE, output);
      finalize(traceId, completed, "workflow_complete");
    } catch (error) {
      eventBus.publish("credit_onboarding.error", { error, step: "RISK" }, traceId);
    }
  });

  eventBus.subscribe("credit_onboarding.error", ({ data, traceId }) => {
    const machine = stateMachines.get(traceId);
    const errorMessage = data && data.error && data.error.message ? data.error.message : String(data.error || "Unknown error");

    pushAudit(traceId, "credit_onboarding.error", {
      step: data.step || "UNKNOWN",
      message: errorMessage
    });

    runResults.set(traceId, {
      traceId,
      status: "failed",
      reason: "workflow_error",
      error: errorMessage,
      finalDecision: "MANUAL_REVIEW",
      outputs: Object.values(stepOutputs.get(traceId) || {}),
      stateMachine: machine || null
    });

    stateMachines.delete(traceId);
  });
}

function startCreditOnboarding(context, traceId) {
  stepOutputs.set(traceId, {});
  pushAudit(traceId, "credit_onboarding.entrypoint", { context });
  eventBus.publish("credit_onboarding.started", context, traceId);
}

function getRunResult(traceId) {
  return runResults.get(traceId) || null;
}

function getAuditTrail(traceId) {
  return auditTrails.get(traceId) || [];
}

module.exports = { initOrchestrator, startCreditOnboarding, getRunResult, getAuditTrail };
