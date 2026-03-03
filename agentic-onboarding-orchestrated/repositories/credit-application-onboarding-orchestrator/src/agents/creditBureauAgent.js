async function runCreditBureauAgent(ctx) {
  const applicant = (ctx && ctx.payload && ctx.payload.applicant) || {};
  const score = Number(applicant.creditScore || applicant.cibilScore || 0);

  if (!score) {
    return {
      proposal: "escalate",
      confidence: 0.6,
      reasons: ["No bureau score found in payload"],
      policy_refs: ["BUREAU-SCORE-REQUIRED"],
      flags: { missing_data: true }
    };
  }

  if (score < 650) {
    return {
      proposal: "deny",
      confidence: 0.9,
      reasons: [`Bureau score ${score} below minimum threshold 650`],
      policy_refs: ["BUREAU-SCORE-MIN-650"],
      flags: { missing_data: false }
    };
  }

  if (score < 700) {
    return {
      proposal: "escalate",
      confidence: 0.72,
      reasons: [`Borderline bureau score ${score}`],
      policy_refs: ["BUREAU-SCORE-BORDERLINE-650-699"],
      flags: { missing_data: false }
    };
  }

  return {
    proposal: "approve",
    confidence: 0.86,
    reasons: [`Bureau score ${score} is acceptable`],
    policy_refs: ["BUREAU-SCORE-MIN-650"],
    flags: { missing_data: false }
  };
}

module.exports = { runCreditBureauAgent };
