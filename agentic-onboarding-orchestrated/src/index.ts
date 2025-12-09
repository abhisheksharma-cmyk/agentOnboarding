
import express from "express";
import { initOrchestrator } from "./orchestrator/orchestrator";
import { startOnboarding } from "./workflows/onboardingWorkflow";
import { AgentContext } from "./types/types";
import { eventBus } from "./eventBus/eventBus";
import { getTrace } from "./auditTracking/audit";
import { AgentOutput } from "./types/types";
import { runKycAgent } from "./agents/kycAgent";
import { runAmlAgent } from "./agents/amlAgent";
import { runCreditAgent } from "./agents/creditAgent";
import { runRiskAgent } from "./agents/riskAgent";
import { evaluateDecision } from "./decisionGateway/decisionGateway";

const app = express();
app.use(express.json());

/**
 * In-memory store for run results keyed by traceId.
 */
const runResults: Record<string, any> = {};

function generateTraceId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).substring(2, 10)
  );
}

initOrchestrator();

eventBus.subscribe("onboarding.finished", ({ traceId, data }) => {
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

  const ctx: AgentContext = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot: "KYC",
    payload: req.body.payload || {},
  };

  startOnboarding(ctx, traceId);

  // Simple wait-loop for demo (not for production)
  setTimeout(() => {
    const result = runResults[traceId] || null;
    const auditTrail = getTrace(traceId);
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
  const auditTrail = getTrace(traceId);
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
  const ctx: AgentContext = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot: "KYC",
    payload: req.body.payload || {},
  };
  const out = await runKycAgent(ctx);
  const finalDecision = evaluateDecision(out);
  res.json({ agentOutput: out, finalDecision });
});

app.post("/test/aml", async (req, res) => {
  const ctx: AgentContext = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot: "AML",
    payload: req.body.payload || {},
  };
  const out = await runAmlAgent(ctx);
  const finalDecision = evaluateDecision(out);
  res.json({ agentOutput: out, finalDecision });
});

app.post("/test/credit", async (req, res) => {
  const ctx: AgentContext = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot: "CREDIT",
    payload: req.body.payload || {},
  };
  const out = await runCreditAgent(ctx);
  const finalDecision = evaluateDecision(out);
  res.json({ agentOutput: out, finalDecision });
});

app.post("/test/risk", async (req, res) => {
  const ctx: AgentContext = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot: "RISK",
    payload: req.body.payload || {},
  };
  const out = await runRiskAgent(ctx);
  const finalDecision = evaluateDecision(out);
  res.json({ agentOutput: out, finalDecision });
});


const port = process.env.PORT || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
