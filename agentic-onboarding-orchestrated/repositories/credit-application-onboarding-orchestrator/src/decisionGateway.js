function normalizeProposal(output) {
  return String((output && output.proposal) || "escalate").toLowerCase();
}

function evaluateFinalDecision(outputs) {
  const list = Array.isArray(outputs) ? outputs : [];
  const proposals = list.map(normalizeProposal);

  if (proposals.includes("deny")) {
    return "DENY";
  }
  if (proposals.includes("escalate")) {
    return "MANUAL_REVIEW";
  }
  return "APPROVE";
}

module.exports = { evaluateFinalDecision };
