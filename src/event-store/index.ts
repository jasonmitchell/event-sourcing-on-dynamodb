import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {randomUUID} from "crypto";

export type EventStore = {
  streamReader: StreamReader;
  streamWriter: StreamWriter;
};

type StreamReader = (streamId: string) => Promise<EventStream>;
type StreamWriter = (streamId: string, events: Event[]) => Promise<void>;

export type EventStream = {
  id: string;
  version: number;
  events: Event[]
};

export type Event = {
  type: string;
  data: EventData;
  metadata?: EventMetadata;
}

export type EventData = object;

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
}

type EventRecord = Event & {
  version: number;
  created_at: string;
}

export type ConnectionOptions = {
  client?: DynamoDB;
  tableName?: string;
  region?: string;
  partitionSize?: number;
}

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

type ReadEventsOptions = {
  forward: boolean;
  limit?: number;
}

const readEvents = async (dynamoDB: DynamoDB, tableName: string, streamId: string, options?: ReadEventsOptions): Promise<EventRecord[]> => {
  // TODO: Page through results
  const result = await dynamoDB.query({
    TableName: tableName,
    KeyConditionExpression: 'pk = :stream_id',
    ExpressionAttributeValues: {
      ':stream_id': { S: streamId }
    },
    ConsistentRead: true,
    ScanIndexForward: options?.forward,
    Limit: options?.limit
  });

  return result.Items?.map(item => ({
    id: item.event_id.S!,
    type: item.event_type.S!,
    version: Number(item.sk.N!),
    created_at: item.created_at.S!,
    data: JSON.parse(item.data.S!) as EventData,
    metadata: JSON.parse(item.metadata.S!) as EventMetadata
  })) || [];
};

// TODO: expected version
// TODO: maximum event batch size? or implicitly just handle it?
const writeStream = async (dynamoDB: DynamoDB, tableName: string, partitionSize: number, streamId: string, events: Event[]): Promise<void> => {
  const existingEvents = await readEvents(dynamoDB, tableName, streamId, {
    forward: false,
    limit: 1
  });

  const latestVersion = existingEvents.length > 0 ? existingEvents[0].version : -1;
  const createdAt = new Date().toISOString();

  // TODO: Concurrency testing
  const startCommitPosition = await getCommitPosition(dynamoDB, tableName, events.length);

  // TODO: Transactional write if more than one event probably
  // TODO: Throw if version mismatch
  // TODO: Expected stream versions, not exists, etc
  await dynamoDB.batchWriteItem({
    RequestItems: {
      [tableName]: events.map((event, index) => {
        const id = randomUUID();
        const version = latestVersion + index + 1;
        const commitPosition = startCommitPosition + index;
        const eventsPartition = Math.floor(commitPosition / partitionSize);

        return ({
          PutRequest: {
            Item: {
              pk: { S: streamId },
              sk: { N: version.toString() },
              events_partition: { S: `partition#${eventsPartition}` },
              commit_position: { N: commitPosition.toString() },
              event_id: { S: id },
              event_type: { S: event.type },
              created_at: { S: createdAt },
              data: { S: JSON.stringify(event.data) },
              metadata: { S: JSON.stringify(event.metadata || {}) }
            }
          }
        })
      })
    }
  });
};

const getCommitPosition = async (dynamoDB: DynamoDB, tableName: string, increment: number): Promise<number> => {
  const result = await dynamoDB.updateItem({
    TableName: tableName,
    Key: {
      pk: { S: '$commit' },
      sk: { N: '0' }
    },
    UpdateExpression: 'ADD next_commit_position :increment',
    ExpressionAttributeValues: {
      ':increment': { N: increment.toString() }
    },
    ReturnValues: 'UPDATED_OLD'
  });

  return result.Attributes?.next_commit_position?.N ? Number(result.Attributes.next_commit_position.N) : 0;
};
