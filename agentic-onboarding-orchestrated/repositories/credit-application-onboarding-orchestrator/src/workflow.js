const { startCreditOnboarding } = require("./orchestrator/orchestrator");

function startWorkflow(context, traceId) {
  startCreditOnboarding(context, traceId);
}

module.exports = { startWorkflow };
