async function runKycAgent(ctx) {
  const applicant = (ctx && ctx.payload && ctx.payload.applicant) || {};
  const missing = [];

  if (!applicant.fullName) missing.push("fullName");
  if (!applicant.dateOfBirth) missing.push("dateOfBirth");
  if (!applicant.idNumber) missing.push("idNumber");

  if (missing.length > 0) {
    return {
      proposal: "deny",
      confidence: 0.9,
      reasons: [`Missing required applicant fields: ${missing.join(", ")}`],
      policy_refs: ["KYC-BASIC-REQUIRED-FIELDS"],
      flags: { missing_data: true }
    };
  }

  return {
    proposal: "approve",
    confidence: 0.86,
    reasons: ["KYC minimum identity fields are present"],
    policy_refs: ["KYC-BASIC-REQUIRED-FIELDS"],
    flags: { missing_data: false }
  };
}

module.exports = { runKycAgent };
