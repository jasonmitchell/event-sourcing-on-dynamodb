export type Event = {
  id: string;
  type: string;
  data: EventData;
  metadata?: EventMetadata;
}

export type EventRecord = Event & {
  version: number;
  created_at: string;
}

export type EventData = object;

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
}

export type ReadEventsOptions = {
  forward: boolean;
  limit?: number;
}
