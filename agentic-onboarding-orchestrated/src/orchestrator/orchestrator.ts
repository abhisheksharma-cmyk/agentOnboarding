
import { eventBus } from "../eventBus/eventBus";
import { runKycAgent } from "../agents/kycAgent";
import { runAmlAgent } from "../agents/amlAgent";
import { runCreditAgent } from "../agents/creditAgent";
import { runRiskAgent } from "../agents/riskAgent";
import { runAddressAgent } from "../agents/addressAgent";
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
  eventBus.subscribe("onboarding.started", ({ data, traceId }) => {
    const ctx: AgentContext = data;
    audit(traceId, "onboarding.started", { ctx });
    eventBus.publish("onboarding.kyc", ctx, traceId);
  });

  // KYC -> AML
  eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    const { out, final, durationMs } = await runAndEvaluate(runKycAgent, ctx, traceId, "kyc");
    eventBus.publish("onboarding.kyc_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.address_verification", ctx, traceId);
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

  // AML -> Credit
  eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    const { out, final, durationMs } = await runAndEvaluate(runAmlAgent, ctx, traceId, "aml");
    eventBus.publish("onboarding.aml_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.credit", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  // Credit -> Risk
  eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    const { out, final, durationMs } = await runAndEvaluate(runCreditAgent, ctx, traceId, "credit");
    eventBus.publish("onboarding.credit_complete", { out, final, ctx, durationMs }, traceId);
    if (final === "APPROVE") {
      eventBus.publish("onboarding.risk", ctx, traceId);
    } else {
      eventBus.publish("onboarding.finished", { final, out }, traceId);
    }
  });

  // Risk -> Finish
  eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
    const ctx: AgentContext = data;
    const { out, final, durationMs } = await runAndEvaluate(runRiskAgent, ctx, traceId, "risk");
    eventBus.publish("onboarding.risk_complete", { out, final, ctx, durationMs }, traceId);
    eventBus.publish("onboarding.finished", { final, out }, traceId);
  });
}

type AgentRunner = (ctx: AgentContext) => Promise<any>;

async function runAndEvaluate(
  runner: AgentRunner,
  ctx: AgentContext,
  traceId: string,
  stage: "kyc" | "aml" | "credit" | "risk"
) {
  audit(traceId, `${stage}.invoked`, { ctx });
  const start = Date.now();
  const out = await runner(ctx);
  const durationMs = Date.now() - start;
  const final = evaluateDecision(out);
  audit(traceId, `${stage}.completed`, { agentOutput: out, finalDecision: final, durationMs });
  return { out, final, durationMs };
}
