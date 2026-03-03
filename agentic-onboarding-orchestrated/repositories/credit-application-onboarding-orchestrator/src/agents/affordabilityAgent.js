function monthlyEmi(principal, annualRate, tenureMonths) {
  if (!principal || !annualRate || !tenureMonths) return 0;
  const monthlyRate = annualRate / 12;
  const growth = Math.pow(1 + monthlyRate, tenureMonths);
  return (principal * monthlyRate * growth) / (growth - 1);
}

async function runAffordabilityAgent(ctx) {
  const payload = (ctx && ctx.payload) || {};
  const applicant = payload.applicant || {};
  const loan = payload.loan || {};

  const monthlyIncome = Number(applicant.monthlyIncome || 0);
  const liabilities = Number(applicant.monthlyLiabilities || 0);
  const requestedAmount = Number(loan.requestedAmount || 0);
  const tenureMonths = Number(loan.tenureMonths || 0);
  const annualRate = Number(loan.annualRate || 0);

  if (!monthlyIncome || !requestedAmount || !tenureMonths || !annualRate) {
    return {
      proposal: "escalate",
      confidence: 0.65,
      reasons: ["Affordability inputs missing (income/amount/tenure/rate)"],
      policy_refs: ["FOIR-INPUTS-REQUIRED"],
      flags: { missing_data: true }
    };
  }

  const emi = monthlyEmi(requestedAmount, annualRate, tenureMonths);
  const foir = (liabilities + emi) / monthlyIncome;
  const foirLimit = 0.55;

  if (foir > foirLimit) {
    return {
      proposal: "deny",
      confidence: 0.9,
      reasons: [`FOIR ${(foir * 100).toFixed(1)}% exceeds ${(foirLimit * 100).toFixed(0)}%`],
      policy_refs: ["FOIR-55"],
      flags: { missing_data: false },
      metadata: { calculatedEmi: Math.round(emi), foir: Number(foir.toFixed(4)) }
    };
  }

  return {
    proposal: "approve",
    confidence: 0.84,
    reasons: [`FOIR ${(foir * 100).toFixed(1)}% within ${(foirLimit * 100).toFixed(0)}% limit`],
    policy_refs: ["FOIR-55"],
    flags: { missing_data: false },
    metadata: { calculatedEmi: Math.round(emi), foir: Number(foir.toFixed(4)) }
  };
}

module.exports = { runAffordabilityAgent };
