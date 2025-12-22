
export interface EventEnvelope {
  type: string;
  data: any;
  traceId: string;
}

type Handler = (event: EventEnvelope) => void;

class EventBus {
  private handlers: Record<string, Handler[]> = {};

  subscribe(eventType: string, handler: Handler) {
    if (!this.handlers[eventType]) {
      this.handlers[eventType] = [];
    }
    this.handlers[eventType].push(handler);
  }

  publish(eventType: string, data: any, traceId: string) {
    const hs = this.handlers[eventType] || [];
    // Create a copy of the handlers array to avoid issues if handlers are removed during iteration
    const handlers = [...hs];
    for (const h of handlers) {
      h({ type: eventType, data, traceId });
    }
  }

  subscribeOnce(eventType: string, handler: Handler) {
    const onceHandler = (event: EventEnvelope) => {
      // Remove this handler after it's called once
      this.unsubscribe(eventType, onceHandler);
      handler(event);
    };
    this.subscribe(eventType, onceHandler);
  }

  private unsubscribe(eventType: string, handler: Handler) {
    const handlers = this.handlers[eventType];
    if (handlers) {
      this.handlers[eventType] = handlers.filter(h => h !== handler);
    }
  }
}

export const eventBus = new EventBus();
