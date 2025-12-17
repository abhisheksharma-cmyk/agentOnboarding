require("dotenv").config();
const express = require("express");
const { callGroq } = require("../groq/groqClient");
const app = express();
app.use(express.json());

let amlContractJson = null;

async function loadAmlContract() {
  console.log("Loading AML agent JSON contract from Groq...");

  const systemPrompt = `
You are an AML fraud-detection agent. Return ONLY a JSON object using this schema:

{
  "proposal": "approve | deny | escalate",
  "confidence": number,
  "reasons": [string],
  "policy_refs": [string],
  "flags": {
    "provider_high_risk": boolean,
    "contradictory_signals": boolean
  },
  "metadata": {
    "agent_name": "mock_aml_http",
    "slot": "AML",
    "version": "1.0.0"
  }
}
`;

  amlContractJson = await callGroq(systemPrompt);
  console.log("Loaded AML JSON:", amlContractJson);
}

app.post("/agents/aml/decide", (req, res) => {
  res.json(amlContractJson);
});

app.listen(5002, async () => {
  console.log("Mock AML Agent running on http://localhost:5002");
  await loadAmlContract();
});