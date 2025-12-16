"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = audit;
exports.getTrace = getTrace;
const auditEvents = [];
/**
 * Record an audit event (in-memory + console JSON).
 * The payload can include 'durationMs' for latency tracking.
 */
function audit(traceId, stage, payload) {
    const evt = {
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
function getTrace(traceId) {
    return auditEvents.filter(e => e.traceId === traceId);
}
//# sourceMappingURL=audit.js.map