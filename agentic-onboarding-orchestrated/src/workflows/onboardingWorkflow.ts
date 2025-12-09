
import { eventBus } from "../eventBus/eventBus";
import { AgentContext } from "../types/types";
import { audit } from "../auditTracking/audit";

/**
 * Start onboarding flow with a given traceId.
 */
export function startOnboarding(ctx: AgentContext, traceId: string) {
  audit(traceId, "onboarding.entrypoint", { ctx });
  eventBus.publish("onboarding.started", ctx, traceId);
}
