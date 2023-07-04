import { DynamoDB } from '@aws-sdk/client-dynamodb';

export type EventStoreOptions = {
  dynamoDB: DynamoDB;
  tableName: string;
};

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

export type ReadStreamOptions = {
  forward?: boolean;
  limit?: number;
  version?: number;
};
