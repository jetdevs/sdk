/**
 * Event System
 *
 * Provides event publishing capabilities for domain events.
 * Enables decoupled communication between modules.
 */

export interface DomainEvent {
  type: string;
  timestamp: Date;
  data: any;
  metadata?: Record<string, any>;
}

export interface EventHandler {
  (event: DomainEvent): Promise<void> | void;
}

// In-memory event store for development
// Production would use a message queue like RabbitMQ, Kafka, or Redis Pub/Sub
const eventHandlers = new Map<string, Set<EventHandler>>();
const eventLog: DomainEvent[] = [];

/**
 * Publish a domain event
 * @param eventType The type of event (e.g., 'product.created')
 * @param data The event data
 * @param metadata Optional metadata
 */
export async function publishEvent(
  eventType: string,
  data: any,
  metadata?: Record<string, any>
): Promise<void> {
  const event: DomainEvent = {
    type: eventType,
    timestamp: new Date(),
    data,
    metadata,
  };

  // Log event for audit trail
  eventLog.push(event);

  // In development, log to console
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Event Published] ${eventType}`, { data, metadata });
  }

  // Notify all registered handlers
  const handlers = eventHandlers.get(eventType);
  if (handlers) {
    const promises = Array.from(handlers).map(handler =>
      Promise.resolve(handler(event)).catch(error =>
        console.error(`Error in event handler for ${eventType}:`, error)
      )
    );
    await Promise.all(promises);
  }
}

/**
 * Subscribe to domain events
 * @param eventType The type of event to subscribe to
 * @param handler The handler function
 * @returns Unsubscribe function
 */
export function subscribeEvent(
  eventType: string,
  handler: EventHandler
): () => void {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, new Set());
  }

  const handlers = eventHandlers.get(eventType)!;
  handlers.add(handler);

  // Return unsubscribe function
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      eventHandlers.delete(eventType);
    }
  };
}

/**
 * Get event history (for debugging/testing)
 * @param eventType Optional filter by event type
 * @param limit Maximum number of events to return
 */
export function getEventHistory(
  eventType?: string,
  limit: number = 100
): DomainEvent[] {
  let events = eventLog;

  if (eventType) {
    events = events.filter(e => e.type === eventType);
  }

  return events.slice(-limit);
}

/**
 * Clear event history (for testing)
 */
export function clearEventHistory(): void {
  eventLog.length = 0;
}