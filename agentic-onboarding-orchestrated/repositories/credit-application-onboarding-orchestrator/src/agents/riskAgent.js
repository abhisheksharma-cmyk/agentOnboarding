async function runRiskAgent(ctx) {
  const payload = (ctx && ctx.payload) || {};
  const applicant = payload.applicant || {};
  const loan = payload.loan || {};

  const score = Number(applicant.creditScore || applicant.cibilScore || 0);
  const monthlyIncome = Number(applicant.monthlyIncome || 0);
  const requestedAmount = Number(loan.requestedAmount || 0);

  if (!monthlyIncome || !requestedAmount) {
    return {
      proposal: "escalate",
      confidence: 0.61,
      reasons: ["Missing amount or income for risk assessment"],
      policy_refs: ["RISK-BASELINE-INPUTS"],
      flags: { missing_data: true }
    };
  }

  const loanToMonthlyIncome = requestedAmount / monthlyIncome;

  if (loanToMonthlyIncome > 30 || (score && score < 680)) {
    return {
      proposal: "escalate",
      confidence: 0.78,
      reasons: ["Higher application risk requires manual review"],
      policy_refs: ["RISK-MANUAL-REVIEW-RULE"],
      flags: { missing_data: false },
      metadata: { loanToMonthlyIncome: Number(loanToMonthlyIncome.toFixed(2)), score }
    };
  }

  return {
    proposal: "approve",
    confidence: 0.82,
    reasons: ["Risk within acceptable policy envelope"],
    policy_refs: ["RISK-AUTO-APPROVE-RULE"],
    flags: { missing_data: false },
    metadata: { loanToMonthlyIncome: Number(loanToMonthlyIncome.toFixed(2)), score }
  };
}

module.exports = { runRiskAgent };
