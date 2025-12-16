"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventBus = void 0;
class EventBus {
    constructor() {
        this.handlers = {};
    }
    subscribe(eventType, handler) {
        if (!this.handlers[eventType]) {
            this.handlers[eventType] = [];
        }
        this.handlers[eventType].push(handler);
        return () => this.unsubscribe(eventType, handler);
    }
    unsubscribe(eventType, handler) {
        const hs = this.handlers[eventType];
        if (!hs)
            return;
        this.handlers[eventType] = hs.filter((h) => h !== handler);
    }
    publish(eventType, data, traceId) {
        const hs = this.handlers[eventType] || [];
        for (const h of hs) {
            h({ type: eventType, data, traceId });
        }
    }
}
exports.eventBus = new EventBus();
//# sourceMappingURL=eventBus.js.map