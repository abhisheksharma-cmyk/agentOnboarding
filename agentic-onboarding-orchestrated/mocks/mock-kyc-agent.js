require("dotenv").config();
const express = require("express");
const { callGroq } = require("../groq/groqClient");
const app = express();
app.use(express.json());

let kycContractJson = null;

async function loadKycContract() {
  console.log("Loading KYC agent JSON contract from Groq...");

  const systemPrompt = `
You are a KYC underwriting micro-agent. Produce ONLY a JSON object following the schema:

{
  "proposal": "approve | deny | escalate",
  "confidence": number,
  "reasons": [string],
  "policy_refs": [string],
  "flags": {
    "missing_data": boolean,
    "policy_conflict": boolean,
    "provider_high_risk": boolean,
    "contradictory_signals": boolean
  },
  "metadata": {
    "agent_name": "mock_kyc_http",
    "slot": "KYC",
    "version": "1.0.0"
  }
}

Your response must be strictly valid JSON with no extra commentary.
`;

  kycContractJson = await callGroq(systemPrompt);
  console.log("Loaded KYC JSON:", kycContractJson);
}

app.post("/agents/kyc/decide", (req, res) => {
  res.json(kycContractJson);
});

app.listen(5001, async () => {
  console.log("Mock KYC Agent running on http://localhost:5001");
  await loadKycContract();
});
