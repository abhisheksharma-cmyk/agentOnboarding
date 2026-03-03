class EventBus {
  constructor() {
    this.handlers = new Map();
  }

  subscribe(eventName, handler) {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, []);
    }
    this.handlers.get(eventName).push(handler);
  }

  publish(eventName, data, traceId) {
    const handlers = this.handlers.get(eventName) || [];
    handlers.forEach((handler) => {
      Promise.resolve(handler({ data, traceId })).catch((error) => {
        // Avoid crashing the process for one bad subscriber.
        console.error(`[${traceId}] Event handler failed for ${eventName}:`, error);
      });
    });
  }
}

module.exports = { eventBus: new EventBus() };
