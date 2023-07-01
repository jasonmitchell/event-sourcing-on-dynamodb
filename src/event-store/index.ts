import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {Event} from "./types";
import {StreamWriter, writeStream} from "./stream-writer";
import {StreamReader, readEvents} from "./stream-reader";

export type EventStore = {
  streamReader: StreamReader;
  streamWriter: StreamWriter;
};

export type EventStream = {
  id: string;
  version: number;
  events: Event[]
};

export type ConnectionOptions = {
  client?: DynamoDB;
  tableName?: string;
  region?: string;
  partitionSize?: number;
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
}

const getStreamReader = (dynamoDB: DynamoDB, tableName: string): StreamReader => {
  return async (streamId: string): Promise<EventStream> => {
    const events = await readEvents(dynamoDB, tableName, streamId);
    const version = events.length > 0 ? events[events.length - 1].version : -1;

    return {
      id: streamId,
      version: version,
      events: events.map(event => ({
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata
      }))
    };
  }
}

const getStreamWriter = (dynamoDB: DynamoDB, tableName: string, partitionSize: number): StreamWriter => {
  return async (streamId: string, events: Event[]): Promise<void> => {
    await writeStream(dynamoDB, tableName, partitionSize, streamId, events);
  }
}
