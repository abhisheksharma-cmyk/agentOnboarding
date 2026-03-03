
export interface AuditEvent {
  traceId: string;
  stage: string;
  timestamp: string;
  payload: any; // may include durationMs for timing metrics
}

const auditEvents: AuditEvent[] = [];

/**
 * Record an audit event (in-memory + console JSON).
 * The payload can include 'durationMs' for latency tracking.
 */
export function audit(traceId: string, stage: string, payload: any) {
  const evt: AuditEvent = {
    traceId,
    stage,
    timestamp: new Date().toISOString(),
    payload,
  };
  auditEvents.push(evt);
  // Structured log for grep / log aggregation
  // eslint-disable-next-line no-console
  console.log("\n" + JSON.stringify({ type: "audit", ...evt }) + "\n");
}

export function getTrace(traceId: string): AuditEvent[] {
  return auditEvents.filter(e => e.traceId === traceId);
}
