require("dotenv").config();
const express = require("express");
// const { callGroq } = require("../groq/groqClient");
const app = express();
app.use(express.json());

let creditContractJson = null;

async function loadCreditContract() {
  console.log("Loading Credit agent JSON contract...");

  // Dummy response for testing without Groq API key
  creditContractJson = {
    "proposal": "approve",
    "confidence": 0.78,
    "reasons": ["Credit score within acceptable range", "Income sufficient for loan amount"],
    "policy_refs": ["CREDIT-POL-001", "CREDIT-POL-002"],
    "flags": {
      "missing_data": false,
      "contradictory_signals": false
    },
    "metadata": {
      "agent_name": "mock_credit_http",
      "slot": "CREDIT",
      "version": "1.0.0"
    }
  };

  console.log("Loaded Credit JSON:", creditContractJson);
}

app.post("/agents/credit/decide", (req, res) => {
  res.json(creditContractJson);
});

app.listen(5003, async () => {
  console.log("Mock Credit Agent running on http://localhost:5003");
  await loadCreditContract();
});
