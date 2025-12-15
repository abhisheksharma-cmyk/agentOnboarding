require("dotenv").config();
const express = require("express");
const { callGroq } = require("../groq/groqClient");

const app = express();
app.use(express.json({ limit: "5mb" }));

const DEFAULT_METADATA = { agent_name: "mock_credit2_http", slot: "CREDIT", version: "2.0.0" };

function safeNumber(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function grossToEligibleEmi(grossIncome, foir = 0.55) {
  return Math.max(0, grossIncome * foir / 12);
}

function emi(principal, annualRate, months) {
  const r = annualRate / 12;
  if (r === 0) return principal / months;
  const num = principal * r * Math.pow(1 + r, months);
  const den = Math.pow(1 + r, months) - 1;
  return num / den;
}

function eligibleLoanAmount(emiCap, annualRate, months) {
  const r = annualRate / 12;
  if (r === 0) return emiCap * months;
  const num = emiCap * (Math.pow(1 + r, months) - 1);
  const den = r * Math.pow(1 + r, months);
  return num / den;
}

function assessLocal(payload) {
  const reasons = [];
  const policyRefs = [];
  let missingData = false;
  let contradictory = false;

  const applicant = payload.applicant || {};
  const credit = payload.credit || payload.loan || {};
  const income = safeNumber(applicant.monthly_income || applicant.income_monthly || applicant.annual_income / 12);
  const liabilities = safeNumber(applicant.monthly_liabilities || applicant.emi_outflow || 0);
  const declaredCibil = safeNumber(credit.cibil_score || credit.bureau_score || applicant.cibil_score);
  const requestedAmount = safeNumber(credit.requested_amount || credit.amount);
  const tenureMonths = safeNumber(credit.tenure_months || credit.tenure || 60, 60);
  const rate = safeNumber(credit.annual_rate || credit.interest_rate || 0.16, 0.16);

  if (!income) {
    missingData = true;
    reasons.push("Missing income data");
  }
  if (!requestedAmount) {
    missingData = true;
    reasons.push("Missing requested amount");
  }

  if (declaredCibil && declaredCibil < 580) {
    reasons.push("Low bureau/CIBIL score");
    policyRefs.push("POLICY-CREDIT-BUREAU-01");
  }

  const foirCap = 0.55; // FOIR ~55% typical retail threshold
  const emiCap = grossToEligibleEmi(income, foirCap) - liabilities;
  const maxEligible = emiCap > 0 ? eligibleLoanAmount(emiCap, rate, tenureMonths) : 0;

  if (requestedAmount && maxEligible && requestedAmount > maxEligible * 1.15) {
    contradictory = true;
    reasons.push("Requested amount materially exceeds eligibility");
    policyRefs.push("POLICY-CREDIT-ELIGIBILITY-01");
  }

  return {
    reasons,
    policyRefs,
    missingData,
    contradictory,
    maxEligible: Math.max(0, Math.round(maxEligible)),
  };
}

async function runGroqCredit(payload) {
  const systemPrompt = `You are a credit underwriting analyst for Indian retail lending. Given applicant, income, liabilities, requested loan, and documents, assess creditworthiness. If unsure, escalate. Return ONLY valid JSON with schema:
{
  "proposal": "approve" | "deny" | "escalate",
  "confidence": number,
  "reasons": [string],
  "policy_refs": [string],
  "flags": {
    "missing_data": boolean,
    "contradictory_signals": boolean
  },
  "metadata": {
    "agent_name": "mock_credit2_http",
    "slot": "CREDIT",
    "version": "2.0.0"
  },
  "max_eligible_amount": number
}
Use Indian lending norms (FOIR 50-60%, tighter if liabilities high), income reasonableness, bureau score hints (CIBIL), requested vs eligible comparison, and document consistency. If data is weak, escalate with low confidence.`;

  try {
    const out = await callGroq(`${systemPrompt}\nInput JSON: ${JSON.stringify(payload)}`);
    return out;
  } catch (err) {
    console.error("Groq credit call failed", err);
    return null;
  }
}

function mergeDecision({ groqOut, local }) {
  const reasons = [];
  const policyRefs = new Set();
  let missingData = !!local?.missingData;
  let contradictory = !!local?.contradictory;

  if (local) {
    local.reasons.forEach((r) => reasons.push(r));
    local.policyRefs.forEach((p) => policyRefs.add(p));
  }

  if (groqOut?.reasons) reasons.push(...groqOut.reasons);
  if (groqOut?.policy_refs) groqOut.policy_refs.forEach((p) => policyRefs.add(p));
  if (groqOut?.flags?.missing_data) missingData = true;
  if (groqOut?.flags?.contradictory_signals) contradictory = true;

  let maxEligible = local?.maxEligible || 0;
  if (typeof groqOut?.max_eligible_amount === "number" && groqOut.max_eligible_amount > maxEligible) {
    maxEligible = groqOut.max_eligible_amount;
  }

  let proposal = groqOut?.proposal || "escalate";
  let confidence = typeof groqOut?.confidence === "number" ? groqOut.confidence : 0.55;

  if (missingData && proposal === "approve") proposal = "escalate";
  if (contradictory && proposal === "approve") proposal = "escalate";

  if (!reasons.length) reasons.push("Automated credit mock evaluation");
  confidence = Math.min(0.95, Math.max(0.4, confidence));

  return {
    proposal,
    confidence,
    reasons,
    policy_refs: Array.from(policyRefs),
    flags: {
      missing_data: missingData,
      contradictory_signals: contradictory,
    },
    max_eligible_amount: maxEligible,
    metadata: { ...DEFAULT_METADATA },
  };
}

app.post("/agents/credit2/decide", async (req, res) => {
  const payload = req.body?.input?.context?.payload || {};
  const local = assessLocal(payload);
  const groqOut = await runGroqCredit(payload);
  const decision = mergeDecision({ groqOut, local });
  res.json(decision);
});

app.listen(5007, () => {
  console.log("Mock Credit2 Agent (LLM + heuristics) running on http://localhost:5007");
});
