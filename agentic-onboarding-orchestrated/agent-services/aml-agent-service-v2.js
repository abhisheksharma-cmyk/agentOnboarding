require("dotenv").config();
const express = require("express");
const { callGroq } = require("../groq/groqClient");

const app = express();
app.use(express.json({ limit: "5mb" }));

const HIGH_RISK_JURISDICTIONS = ["ir", "kp", "sy", "ua", "af", "pk", "ye", "ps", "so", "sd", "cu", "ru", "by"];
const DEFAULT_METADATA = { agent_name: "mock_aml2_http", slot: "AML", version: "2.0.0" };

function normalize(str) {
  return (str || "").toString().trim().toLowerCase();
}

function looksHighRiskJurisdiction(country) {
  const c = normalize(country).slice(0, 2);
  return HIGH_RISK_JURISDICTIONS.includes(c);
}

async function runGroqAml(payload) {
  const systemPrompt = `You are an AML analyst. Given an onboarding payload (applicant + documents + signals), perform AML risk analysis. Return ONLY valid JSON using the schema:
{
  "proposal": "approve" | "deny" | "escalate",
  "confidence": number,
  "reasons": [string],
  "policy_refs": [string],
  "flags": {
    "provider_high_risk": boolean,
    "contradictory_signals": boolean
  },
  "metadata": {
    "agent_name": "mock_aml2_http",
    "slot": "AML",
    "version": "2.0.0"
  }
}
Consider PEP/sanctions/watchlist hints, adverse media, high-risk jurisdictions, cash intensity, source of funds, velocity, and doc authenticity cues. If signals conflict, set contradictory_signals true. Default to escalate when unsure.`;

  try {
    const out = await callGroq(`${systemPrompt}\nInput JSON: ${JSON.stringify(payload)}`);
    return out;
  } catch (err) {
    console.error("Groq AML call failed", err);
    return null;
  }
}

function evaluateLocalSignals(payload) {
  const reasons = [];
  const policyRefs = [];
  let providerHighRisk = false;
  let contradictory = false;

  const applicant = payload.applicant || {};
  const signals = payload.signals || payload.riskSignals || {};
  const docs = payload.documents || payload.docs || [];

  if (normalize(applicant.pepStatus) === "pep" || signals.pep_hit) {
    providerHighRisk = true;
    reasons.push("PEP hit detected");
    policyRefs.push("POLICY-AML-PEP-01");
  }

  if (signals?.sanctions_hit || signals?.watchlist_hit) {
    providerHighRisk = true;
    reasons.push("Sanctions/watchlist positive signal");
    policyRefs.push("POLICY-AML-SANCTIONS-01");
  }

  if (looksHighRiskJurisdiction(applicant.country) || looksHighRiskJurisdiction(applicant.residencyCountry)) {
    providerHighRisk = true;
    reasons.push("High-risk jurisdiction detected");
    policyRefs.push("POLICY-AML-JURISDICTION-01");
  }

  const monthlyCash = Number(signals.monthly_cash_volume || payload.monthly_cash_volume || 0);
  if (monthlyCash > 20000) {
    reasons.push("High monthly cash volume reported");
    policyRefs.push("POLICY-AML-CASH-01");
  }

  if (docs.some((d) => d.looks_authentic === false)) {
    contradictory = true;
    reasons.push("Document authenticity concerns");
  }

  return { reasons, policyRefs, providerHighRisk, contradictory };
}

function mergeDecision({ groqOut, localSignals }) {
  const reasons = [];
  const policyRefs = new Set();
  let providerHighRisk = false;
  let contradictory = false;

  if (localSignals) {
    localSignals.reasons.forEach((r) => reasons.push(r));
    localSignals.policyRefs.forEach((p) => policyRefs.add(p));
    providerHighRisk = providerHighRisk || !!localSignals.providerHighRisk;
    contradictory = contradictory || !!localSignals.contradictory;
  }

  if (groqOut?.policy_refs) groqOut.policy_refs.forEach((p) => policyRefs.add(p));
  if (groqOut?.reasons) reasons.push(...groqOut.reasons);
  if (groqOut?.flags?.provider_high_risk) providerHighRisk = true;
  if (groqOut?.flags?.contradictory_signals) contradictory = true;

  let proposal = groqOut?.proposal || "escalate";
  let confidence = typeof groqOut?.confidence === "number" ? groqOut.confidence : 0.6;

  if (providerHighRisk && proposal === "approve") {
    proposal = "deny";
  } else if (providerHighRisk && proposal === "escalate") {
    proposal = "deny";
  }

  if (!reasons.length) reasons.push("Automated AML mock evaluation");

  if (contradictory) confidence = Math.max(0.4, confidence - 0.1);
  confidence = Math.min(0.95, Math.max(0.4, confidence));

  return {
    proposal,
    confidence,
    reasons,
    policy_refs: Array.from(policyRefs),
    flags: {
      provider_high_risk: providerHighRisk,
      contradictory_signals: contradictory,
    },
    metadata: { ...DEFAULT_METADATA },
  };
}

app.post("/agents/aml2/decide", async (req, res) => {
  const payload = req.body?.input?.context?.payload || {};
  const localSignals = evaluateLocalSignals(payload);
  const groqOut = await runGroqAml(payload);
  const decision = mergeDecision({ groqOut, localSignals });
  res.json(decision);
});

app.listen(5006, () => {
  console.log("Mock AML2 Agent (LLM extraction) running on http://localhost:5006");
});
