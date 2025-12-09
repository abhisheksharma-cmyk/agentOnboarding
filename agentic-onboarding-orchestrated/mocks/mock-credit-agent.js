require("dotenv").config();
const express = require("express");
const { callGroq } = require("../groq/groqClient");
const app = express();
app.use(express.json());

let creditContractJson = null;

async function loadCreditContract() {
  console.log("Loading Credit agent JSON contract from Groq...");

  const systemPrompt = `
You are a credit underwriting agent. Provide ONLY valid JSON in the schema:

{
  "proposal": "approve | deny | escalate",
  "confidence": number,
  "reasons": [string],
  "policy_refs": [string],
  "flags": {
    "missing_data": boolean,
    "contradictory_signals": boolean
  },
  "metadata": {
    "agent_name": "mock_credit_http",
    "slot": "CREDIT",
    "version": "1.0.0"
  }
}
`;

  creditContractJson = await callGroq(systemPrompt);
  console.log("Loaded Credit JSON:", creditContractJson);
}

app.post("/agents/credit/decide", (req, res) => {
  res.json(creditContractJson);
});

app.listen(5003, async () => {
  console.log("Mock Credit Agent running on http://localhost:5003");
  await loadCreditContract();
});
