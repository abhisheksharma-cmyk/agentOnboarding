"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const orchestrator_1 = require("./orchestrator/orchestrator");
const onboardingWorkflow_1 = require("./workflows/onboardingWorkflow");
const eventBus_1 = require("./eventBus/eventBus");
const audit_1 = require("./auditTracking/audit");
const kycAgent_1 = require("./agents/kycAgent");
const amlAgent_1 = require("./agents/amlAgent");
const creditAgent_1 = require("./agents/creditAgent");
const riskAgent_1 = require("./agents/riskAgent");
const decisionGateway_1 = require("./decisionGateway/decisionGateway");
const app = (0, express_1.default)();
app.use(express_1.default.json());
/**
 * In-memory store for run results keyed by traceId.
 */
const runResults = {};
function generateTraceId() {
    return (Date.now().toString(36) +
        "-" +
        Math.random().toString(36).substring(2, 10));
}
(0, orchestrator_1.initOrchestrator)();
eventBus_1.eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
    runResults[traceId] = data;
});
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Agentic Onboarding Orchestrated" });
});
/**
 * Start a full onboarding run.
 * Returns traceId immediately and, after a short delay, the final result + audit trail.
 */
app.post("/onboarding/start", async (req, res) => {
    const traceId = generateTraceId();
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "KYC",
        payload: req.body.payload || {},
    };
    (0, onboardingWorkflow_1.startOnboarding)(ctx, traceId);
    // Simple wait-loop for demo (not for production)
    setTimeout(() => {
        const result = runResults[traceId] || null;
        const auditTrail = (0, audit_1.getTrace)(traceId);
        res.json({
            traceId,
            status: result ? "completed" : "pending",
            result,
            auditTrail,
        });
    }, 400);
});
/**
 * Fetch audit trail and result for a given traceId (idempotent/async-safe).
 */
app.get("/onboarding/trace/:traceId", (req, res) => {
    const traceId = req.params.traceId;
    const result = runResults[traceId] || null;
    const auditTrail = (0, audit_1.getTrace)(traceId);
    res.json({
        traceId,
        status: result ? "completed" : "pending",
        result,
        auditTrail,
    });
});
app.get("/", (_req, res) => {
    res.json({ status: "ok", message: "Agentic Onboarding Reference" });
});
app.post("/test/kyc", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "KYC",
        payload: req.body.payload || {},
    };
    const out = await (0, kycAgent_1.runKycAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/aml", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "AML",
        payload: req.body.payload || {},
    };
    const out = await (0, amlAgent_1.runAmlAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/credit", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "CREDIT",
        payload: req.body.payload || {},
    };
    const out = await (0, creditAgent_1.runCreditAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
app.post("/test/risk", async (req, res) => {
    const ctx = {
        customerId: req.body.customerId || "cus_demo",
        applicationId: req.body.applicationId || "ca_demo",
        slot: "RISK",
        payload: req.body.payload || {},
    };
    const out = await (0, riskAgent_1.runRiskAgent)(ctx);
    const finalDecision = (0, decisionGateway_1.evaluateDecision)(out);
    res.json({ agentOutput: out, finalDecision });
});
const port = process.env.PORT || 4000;
app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server listening on http://localhost:${port}`);
});
