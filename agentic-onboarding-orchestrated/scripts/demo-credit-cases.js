const baseUrl = process.env.DEMO_BASE_URL || "http://localhost:4000";

const demoCases = [
  {
    label: "User-1 Approve",
    expectedDecision: "APPROVE",
    body: {
      customerId: "CUS_DEMO_001",
      applicationId: "APP_DEMO_001",
      payload: {
        applicant: {
          monthly_income: 90000,
          monthly_liabilities: 10000,
          cibil_score: 760,
        },
        credit: {
          requested_amount: 300000,
          tenure_months: 36,
          annual_rate: 0.14,
        },
      },
    },
  },
  {
    label: "User-2 Deny",
    expectedDecision: "DENY",
    body: {
      customerId: "CUS_DEMO_002",
      applicationId: "APP_DEMO_002",
      payload: {
        applicant: {
          monthly_income: 30000,
          monthly_liabilities: 18000,
          cibil_score: 520,
        },
        credit: {
          requested_amount: 700000,
          tenure_months: 48,
          annual_rate: 0.18,
        },
      },
    },
  },
];

async function runCase(testCase) {
  const response = await fetch(`${baseUrl}/test/credit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(testCase.body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${testCase.label}: HTTP ${response.status} - ${text}`);
  }

  const data = await response.json();
  const finalDecision = data.finalDecision;
  const proposal = data.agentOutput?.proposal;
  const confidence = data.agentOutput?.confidence;
  const reasons = data.agentOutput?.reasons || [];

  console.log(`\n=== ${testCase.label} ===`);
  console.log(`Customer: ${testCase.body.customerId}`);
  console.log(`Final Decision: ${finalDecision}`);
  console.log(`Agent Proposal: ${proposal}`);
  console.log(`Confidence: ${confidence}`);
  console.log(`Reasons: ${reasons.join(" | ")}`);

  if (finalDecision !== testCase.expectedDecision) {
    throw new Error(
      `${testCase.label}: expected ${testCase.expectedDecision}, got ${finalDecision}`
    );
  }
}

async function main() {
  console.log("Credit live demo started");
  console.log(`Using API: ${baseUrl}`);

  for (const testCase of demoCases) {
    await runCase(testCase);
  }

  console.log("\nDemo complete: approve + deny scenarios succeeded.");
}

main().catch((error) => {
  console.error("\nDemo failed:", error.message);
  process.exitCode = 1;
});
