
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
 * Wait for a run result up to a short timeout so risk decision can be returned.
 */
function waitForResult(traceId: string, maxMs = 30000) {
  return new Promise<{ status: "completed" | "pending"; result: any }>((resolve) => {
    // Fast-path if already present
    const existing = runResults[traceId];
    if (existing) {
      resolve({ status: "completed", result: existing });
      return;
    }

    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      resolve({ status: "pending", result: null });
    }, maxMs);

    const unsubscribe = eventBus.subscribe("onboarding.finished", ({ traceId: t, data }) => {
      if (settled) return;
      if (t !== traceId) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe?.();
      resolve({ status: "completed", result: data });
    });
  });
}

/**
 * Start a full onboarding run.
 * Returns traceId immediately and, after a short wait, the final result + audit trail (or pending).
 */
app.post("/onboarding/start", async (req, res) => {
  try {
    const traceId = generateTraceId();

    const ctx: AgentContext = {
      customerId: req.body.customerId || "cus_demo",
      applicationId: req.body.applicationId || "ca_demo",
      slot: "KYC",
      payload: req.body.payload || {},
    };

    startOnboarding(ctx, traceId);

    const { status, result } = await waitForResult(traceId);
    const auditTrail = getTrace(traceId);
    return res.json({ traceId, status, result, auditTrail });
  } catch (err) {
    // Surface errors instead of hanging the request while debugging.
    // eslint-disable-next-line no-console
    console.error("onboarding/start failed", err);
    return res.status(500).json({
      status: "error",
      message: (err as Error)?.message || "Unexpected error",
    });
  }
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
