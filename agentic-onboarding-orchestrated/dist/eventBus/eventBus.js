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
        // Create a copy of the handlers array to avoid issues if handlers are removed during iteration
        const handlers = [...hs];
        for (const h of handlers) {
            h({ type: eventType, data, traceId });
        }
    }
    subscribeOnce(eventType, handler) {
        const onceHandler = (event) => {
            // Remove this handler after it's called once
            this.unsubscribe(eventType, onceHandler);
            handler(event);
        };
        this.subscribe(eventType, onceHandler);
    }
}
exports.eventBus = new EventBus();
