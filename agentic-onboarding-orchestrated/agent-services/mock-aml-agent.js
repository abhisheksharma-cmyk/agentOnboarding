require("dotenv").config();
const express = require("express");
// const { callGroq } = require("../groq/groqClient");
const app = express();
app.use(express.json());

let amlContractJson = null;

async function loadAmlContract() {
  console.log("Loading AML agent JSON contract...");

  // Dummy response for testing without Groq API key
  amlContractJson = {
    "proposal": "approve",
    "confidence": 0.85,
    "reasons": ["No high-risk indicators found", "Transaction patterns normal"],
    "policy_refs": ["COMPLIANCE-POL-001", "COMPLIANCE-POL-002"],
    "flags": {
      "provider_high_risk": false,
      "contradictory_signals": false
    },
    "metadata": {
      "agent_name": "mock_compliance_http",
      "slot": "COMPLIANCE",
      "version": "1.0.0"
    }
  };

  console.log("Loaded AML JSON:", amlContractJson);
}

app.post("/agents/aml/decide", (req, res) => {
  res.json(amlContractJson);
});

app.listen(5002, async () => {
  console.log("Mock AML Agent running on http://localhost:5002");
  await loadAmlContract();
});