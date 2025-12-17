
import express from "express";
import cors from 'cors';
import { initOrchestrator } from "./orchestrator/orchestrator";
import { startOnboarding } from "./workflows/onboardingWorkflow";
import { AgentContext } from "./types/types";
import { eventBus } from "./eventBus/eventBus";
import { getTrace } from "./auditTracking/audit";
import { AgentOutput, SlotName } from "./types/types";
import { runAddressAgent } from "./agents/addressAgent";
import { runKycAgent } from "./agents/kycAgent";
import { runAmlAgent } from "./agents/amlAgent";
import { runCreditAgent } from "./agents/creditAgent";
import { runRiskAgent } from "./agents/riskAgent";
import { evaluateDecision } from "./decisionGateway/decisionGateway";

const app = express();
// Enable CORS for all routes
app.use(cors({
  origin: 'http://localhost:3000', // Your frontend URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

/** In-memory store for run results keyed by traceId. */
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

type WaitResult = { status: "completed" | "pending"; result: any };

app.post('/address/verify', async (req, res) => {
  const { line1, city, state, postalCode, country } = req.body;
  const result = await runAddressAgent({
    customerId: 'temp-customer',
    applicationId: 'temp-application',
    slot: 'ADDRESS_VERIFICATION' as SlotName,
    payload: {
      line1,
      city: city || '',
      state: state || '',
      postalCode: postalCode || '',
      country: country || ''
    }
  });
  res.json(result);
});

/** Wait until onboarding.finished fires (or timeout). */
function waitForResult(traceId: string, maxMs = 42000): Promise<WaitResult> {
  return new Promise<WaitResult>((resolve) => {
    const existing = runResults[traceId];
    if (existing) {
      resolve({ status: "completed", result: existing });
      return;
    }

    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe?.();
      resolve({ status: "pending", result: null });
    }, maxMs);

    const unsubscribe = eventBus.subscribe("onboarding.finished", ({ traceId: t, data }) => {
      if (settled || t !== traceId) return;
      settled = true;
      clearTimeout(timeoutId);
      unsubscribe?.();
      resolve({ status: "completed", result: data });
    });
  });
}

function buildContext(req: express.Request, slot: AgentContext["slot"]): AgentContext {
  return {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "ca_demo",
    slot,
    payload: req.body.payload || {},
  };
}

function sendError(res: express.Response, err: unknown) {
  // eslint-disable-next-line no-console
  console.error("onboarding/start failed", err);
  return res.status(500).json({
    status: "error",
    message: (err as Error)?.message || "Unexpected error",
  });
}

/**
 * Start a full onboarding run.
 * Returns traceId immediately and, after a short wait, the final result + audit trail (or pending).
 */
app.post("/onboarding/start", async (req, res) => {
  try {
    const traceId = generateTraceId();
    const ctx = buildContext(req, "KYC");

    startOnboarding(ctx, traceId);

    const { status, result } = await waitForResult(traceId);
    const auditTrail = getTrace(traceId);
    return res.json({ traceId, status, result, auditTrail });
  } catch (err) {
    return sendError(res, err);
  }
});

/** Fetch audit trail and result for a given traceId (idempotent/async-safe). */
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
  const ctx = buildContext(req, "KYC");
  const out = await runKycAgent(ctx);
  res.json({ agentOutput: out, finalDecision: evaluateDecision(out) });
});

app.post("/test/aml", async (req, res) => {
  const ctx = buildContext(req, "AML");
  const out = await runAmlAgent(ctx);
  res.json({ agentOutput: out, finalDecision: evaluateDecision(out) });
});

app.post("/test/credit", async (req, res) => {
  const ctx = buildContext(req, "CREDIT");
  const out = await runCreditAgent(ctx);
  res.json({ agentOutput: out, finalDecision: evaluateDecision(out) });
});

app.post("/test/risk", async (req, res) => {
  const ctx = buildContext(req, "RISK");
  const out = await runRiskAgent(ctx);
  res.json({ agentOutput: out, finalDecision: evaluateDecision(out) });
});


const port = process.env.PORT || 4000;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${port}`);
});
