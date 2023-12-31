export type Event = {
  id: string;
  type: string;
  data: EventData;
  metadata?: EventMetadata;
};

export type EventRecord = Event & {
  stream_id: string;
  version: number;
  created_at: string;
  event_partition: string;
  event_position: number;
};

export type EventData = Record<string, unknown>;

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
};

export const dynamoRecordToEvent = (item: any): EventRecord => ({
  stream_id: item.pk.S!,
  id: item.event_id.S!,
  type: item.event_type.S!,
  version: Number(item.sk.N!),
  event_partition: item.event_partition.S!,
  event_position: Number(item.event_position.N!),
  created_at: item.created_at.S!,
  data: JSON.parse(item.data.S!) as EventData,
  metadata: JSON.parse(item.metadata.S!) as EventMetadata
});
