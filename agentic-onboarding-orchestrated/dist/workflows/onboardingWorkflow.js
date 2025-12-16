"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startOnboarding = startOnboarding;
const eventBus_1 = require("../eventBus/eventBus");
const audit_1 = require("../auditTracking/audit");
/**
 * Start onboarding flow with a given traceId.
 */
function startOnboarding(ctx, traceId) {
    (0, audit_1.audit)(traceId, "onboarding.entrypoint", { ctx });
    eventBus_1.eventBus.publish("onboarding.started", ctx, traceId);
}
//# sourceMappingURL=onboardingWorkflow.js.map