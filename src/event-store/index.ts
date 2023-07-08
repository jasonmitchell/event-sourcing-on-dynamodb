import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Event, EventRecord } from './streams/events';
import { ReadDirection, readStream } from './streams/read';
import { ExpectedVersion, writeStream, WriteStreamResult } from './streams/write';

export type StreamReader = (streamId: string, options?: ReadStreamOptions) => Promise<EventStream>;
export type StreamWriter = (streamId: string, events: Event[], options?: WriteStreamOptions) => Promise<WriteStreamResult>;

export type ConnectionOptions = {
  client?: DynamoDB;
  tableName?: string;
  region?: string;
  partitionSize?: number;
};

export type EventStore = {
  streamReader: StreamReader;
  streamWriter: StreamWriter;
};

export type EventStoreOptions = {
  dynamoDB: DynamoDB;
  tableName: string;
};

export type EventStream = {
  id: string;
  version: number;
  events: Event[];
};

export type ReadStreamOptions = {
  direction?: ReadDirection;
  startVersion?: number;
  endVersion?: number;
  limit?: number;
};

export type WriteStreamOptions = {
  expectedVersion?: ExpectedVersion;
};

export const connect = (options?: ConnectionOptions): EventStore => {
  const region = options?.region || 'eu-west-1';
  const tableName = options?.tableName || 'event-log';
  const dynamoDB = options?.client || new DynamoDB({ region: region });
  const partitionSize = options?.partitionSize || 1000;

  return {
    streamReader: getStreamReader(dynamoDB, tableName),
    streamWriter: getStreamWriter(dynamoDB, tableName, partitionSize)
  };
};

const getStreamReader = (dynamoDB: DynamoDB, tableName: string): StreamReader => {
  return async (streamId: string, options?: ReadStreamOptions): Promise<EventStream> => {
    const readStreamOptions = {
      ...options,
      dynamoDB,
      tableName
    };

    const events: EventRecord[] = [];
    const reader = await readStream(streamId, readStreamOptions);
    for await (const event of reader) {
      events.push(event);
    }

    return {
      id: streamId,
      version: events.length > 0 ? events[events.length - 1].version : -1,
      events: events.map(event => ({
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata
      }))
    };
  };
};

const getStreamWriter = (dynamoDB: DynamoDB, tableName: string, partitionSize: number): StreamWriter => {
  return async (streamId: string, events: Event[], options?: WriteStreamOptions): Promise<WriteStreamResult> => {
    const writeStreamOptions = {
      ...options,
      dynamoDB,
      tableName,
      partitionSize
    };

    return await writeStream(streamId, events, writeStreamOptions);
  };
};
