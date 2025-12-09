"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initOrchestrator = initOrchestrator;
const eventBus_1 = require("./eventBus");
const kycAgent_1 = require("./agents/kycAgent");
const amlAgent_1 = require("./agents/amlAgent");
const creditAgent_1 = require("./agents/creditAgent");
const riskAgent_1 = require("./agents/riskAgent");
const decisionGateway_1 = require("./decisionGateway");
const audit_1 = require("./audit");
/**
 * Hybrid orchestration:
 * - Uses events between stages
 * - Runs steps sequentially in-process
 * - Emits audit logs at each stage with a traceId
 * - Captures per-step duration (latency per agent)
 */
function initOrchestrator() {
    eventBus_1.eventBus.subscribe("onboarding.started", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "onboarding.started", { ctx });
        eventBus_1.eventBus.publish("onboarding.kyc", ctx, traceId);
    });
    eventBus_1.eventBus.subscribe("onboarding.kyc", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "kyc.invoked", { ctx });
        const start = Date.now();
        const out = await (0, kycAgent_1.runKycAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "kyc.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.kyc_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.aml", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.aml", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "aml.invoked", { ctx });
        const start = Date.now();
        const out = await (0, amlAgent_1.runAmlAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "aml.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.aml_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.credit", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.credit", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "credit.invoked", { ctx });
        const start = Date.now();
        const out = await (0, creditAgent_1.runCreditAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "credit.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.credit_complete", { out, final, ctx, durationMs }, traceId);
        if (final === "APPROVE") {
            eventBus_1.eventBus.publish("onboarding.risk", ctx, traceId);
        }
        else {
            eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
        }
    });
    eventBus_1.eventBus.subscribe("onboarding.risk", async ({ data, traceId }) => {
        const ctx = data;
        (0, audit_1.audit)(traceId, "risk.invoked", { ctx });
        const start = Date.now();
        const out = await (0, riskAgent_1.runRiskAgent)(ctx);
        const durationMs = Date.now() - start;
        const final = (0, decisionGateway_1.evaluateDecision)(out);
        (0, audit_1.audit)(traceId, "risk.completed", { agentOutput: out, finalDecision: final, durationMs });
        eventBus_1.eventBus.publish("onboarding.risk_complete", { out, final, ctx, durationMs }, traceId);
        eventBus_1.eventBus.publish("onboarding.finished", { final, out }, traceId);
    });
}
