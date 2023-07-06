import { AttributeValue } from '@aws-sdk/client-dynamodb';

export type Event = {
  id: string;
  type: string;
  data: EventData;
  metadata?: EventMetadata;
};

export type EventRecord = Event & {
  version: number;
  created_at: string;
  event_partition: string;
  event_position: number;
};

export type EventData = object;

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
};

export const dynamoRecordToEvent = (item: Record<string, AttributeValue>): EventRecord => ({
  id: item.event_id.S!,
  type: item.event_type.S!,
  version: Number(item.sk.N!),
  event_partition: item.event_partition.S!,
  event_position: Number(item.event_position.N!),
  created_at: item.created_at.S!,
  data: JSON.parse(item.data.S!) as EventData,
  metadata: JSON.parse(item.metadata.S!) as EventMetadata
});
