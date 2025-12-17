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
/**
 * Hybrid orchestration:
 * - Uses events between stages
 * - Runs steps sequentially in-process
 * - Emits audit logs at each stage with a traceId
 * - Captures per-step duration (latency per agent)
 */
function initOrchestrator() {
    // Entry
    eventBus_1.eventBus.subscribe("onboarding.started", ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "onboarding.started", { ctx });
        eventBus_1.eventBus.publish("onboarding.kyc", ctx, traceId);
    });
    // KYC -> AML
    eventBus_1.eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
        const ctx = data;
        const { out, final, durationMs } = await runAndEvaluate(kycAgent_1.runKycAgent, ctx, traceId, "kyc");
        eventBus_1.eventBus.publish("onboarding.kyc_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.address_verification", ctx, traceId);
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
    // AML -> Credit
    eventBus_1.eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
        const ctx = data;
        const { out, final, durationMs } = await runAndEvaluate(amlAgent_1.runAmlAgent, ctx, traceId, "aml");
        eventBus_1.eventBus.publish("onboarding.aml_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.credit", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    // Credit -> Risk
    eventBus_1.eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
        const ctx = data;
        const { out, final, durationMs } = await runAndEvaluate(creditAgent_1.runCreditAgent, ctx, traceId, "credit");
        eventBus_1.eventBus.publish("onboarding.credit_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.risk", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    // Risk -> Finish
    eventBus_1.eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
        const ctx = data;
        const { out, final, durationMs } = await runAndEvaluate(riskAgent_1.runRiskAgent, ctx, traceId, "risk");
        eventBus_1.eventBus.publish("onboarding.risk_complete", { out, final, ctx, durationMs }, traceId);
        eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
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
//# sourceMappingURL=orchestrator.js.map