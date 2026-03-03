const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const { initOrchestrator, getRunResult, getAuditTrail } = require("./orchestrator/orchestrator");
const { startWorkflow } = require("./workflow");

const app = express();
app.use(cors());
app.use(express.json());

initOrchestrator();

function makeTraceId() {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
}

app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "credit-application-onboarding-orchestrator" });
});

app.post("/credit-onboarding/start", (req, res) => {
  const traceId = makeTraceId();
  const ctx = {
    customerId: req.body.customerId || "cus_demo",
    applicationId: req.body.applicationId || "credit_app_demo",
    slot: "CREDIT_ONBOARDING",
    payload: {
      applicant: req.body.payload && req.body.payload.applicant ? req.body.payload.applicant : {},
      loan: req.body.payload && req.body.payload.loan ? req.body.payload.loan : {}
    }
  };

  startWorkflow(ctx, traceId);

  setTimeout(() => {
    const result = getRunResult(traceId);
    res.json({
      traceId,
      status: result ? result.status : "pending",
      result,
      auditTrail: getAuditTrail(traceId)
    });
  }, 250);
});

app.get("/credit-onboarding/trace/:traceId", (req, res) => {
  const traceId = req.params.traceId;
  const result = getRunResult(traceId);
  res.json({
    traceId,
    status: result ? result.status : "pending",
    result,
    auditTrail: getAuditTrail(traceId)
  });
});

const port = Number(process.env.PORT || 4100);
app.listen(port, () => {
  console.log(`Credit onboarding orchestrator listening on port ${port}`);
});
