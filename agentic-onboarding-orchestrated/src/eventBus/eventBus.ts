
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
    for (const h of hs) {
      h({ type: eventType, data, traceId });
    }
  }
}

export const eventBus = new EventBus();
