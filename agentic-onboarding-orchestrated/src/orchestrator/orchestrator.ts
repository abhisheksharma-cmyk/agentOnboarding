
import { eventBus } from "../eventBus/eventBus";
import { runKycAgent } from "../agents/kycAgent";
import { runAmlAgent } from "../agents/amlAgent";
import { runCreditAgent } from "../agents/creditAgent";
import { runRiskAgent } from "../agents/riskAgent";
import { evaluateDecision } from "../decisionGateway/decisionGateway";
import { AgentContext } from "../types/types";
import { audit } from "../auditTracking/audit";

/**
 * Hybrid orchestration:
 * - Uses events between stages
 * - Runs steps sequentially in-process
 * - Emits audit logs at each stage with a traceId
 * - Captures per-step duration (latency per agent)
 */
export function initOrchestrator() {

  eventBus.subscribe("onboarding.started", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "onboarding.started", { ctx });
    eventBus.publish("onboarding.kyc", ctx, traceId);
  });

  eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "kyc.invoked", { ctx });
    const start = Date.now();
    const out = await runKycAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "kyc.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.kyc_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.aml", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "aml.invoked", { ctx });
    const start = Date.now();
    const out = await runAmlAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "aml.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.aml_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.credit", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "credit.invoked", { ctx });
    const start = Date.now();
    const out = await runCreditAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "credit.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.credit_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.risk", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "risk.invoked", { ctx });
    const start = Date.now();
    const out = await runRiskAgent(ctx);
    const durationMs = Date.now() - start;
    const final = evaluateDecision(out);
    audit(traceId, "risk.completed", { agentOutput: out, finalDecision: final, durationMs });
    eventBus.publish("onboarding.risk_complete", { out, final, ctx, durationMs }, traceId);
    eventBus.publish("onboarding.finished", { final, out }, traceId);
  });
}
