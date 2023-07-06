import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Event, EventRecord } from './streams/events';
import { readEvents } from './stream-reader';
import { getNextEventPosition } from './event-position';

export type ExpectedVersion = 'any' | 'no_stream' | number;

export type WriteOptions = {
  expectedVersion?: ExpectedVersion;
};

export type WriteStreamResult = SuccessfulWriteStreamResult | ErroredWriteStreamResult;

type SuccessfulWriteStreamResult = {
  success: true;
  records: EventRecord[];
};

type ErroredWriteStreamResult = {
  success: false;
  error: {
    type: string;
    detail: string;
  };
};

export type StreamWriter = (streamId: string, events: Event[], options?: WriteOptions) => Promise<WriteStreamResult>;

export const writeStream = async (
  dynamoDB: DynamoDB,
  tableName: string,
  partitionSize: number,
  streamId: string,
  events: Event[],
  options?: WriteOptions
): Promise<WriteStreamResult> => {
  const expectedVersion: ExpectedVersion = options?.expectedVersion || 'any';
  const existingEvents = await readEvents(dynamoDB, tableName, partitionSize, 1, streamId, {
    forward: false,
    limit: 1
  });

  const latestVersion = existingEvents.length > 0 ? existingEvents[0].version : -1;

  if (streamId.startsWith('$')) {
    return {
      success: false,
      error: {
        type: 'invalid_stream_id',
        detail: `Cannot write to stream ${streamId}, the prefix $ is reserved for internal streams`
      }
    };
  }

  if (expectedVersion === 'no_stream' && latestVersion >= 0) {
    return {
      success: false,
      error: {
        type: 'stream_version_mismatch',
        detail: `Expected stream ${streamId} not to exist, but it does`
      }
    };
  }

  if (expectedVersion !== 'any' && expectedVersion !== 'no_stream' && latestVersion !== expectedVersion) {
    return {
      success: false,
      error: {
        type: 'stream_version_mismatch',
        detail: `Expected stream ${streamId} to be at version ${expectedVersion}, but it was at version ${latestVersion}`
      }
    };
  }

  const createdAt = new Date().toISOString();
  const startEventPosition = await getNextEventPosition(dynamoDB, tableName, events.length);
  const records: EventRecord[] = [];

  // TODO: Transactional write if more than one event probably
  // TODO: Max number of items
  await dynamoDB.batchWriteItem({
    RequestItems: {
      [tableName]: events.map((event, index) => {
        const version = latestVersion + index + 1;
        const eventPosition = startEventPosition + index;
        const eventPartition = Math.floor(eventPosition / partitionSize);

        const record: EventRecord = {
          ...event,
          metadata: event.metadata || {},
          version,
          created_at: createdAt,
          event_partition: `partition#${eventPartition}`,
          event_position: eventPosition
        };

        records.push(record);

        return {
          PutRequest: {
            Item: {
              pk: { S: streamId },
              sk: { N: record.version.toString() },
              event_partition: { S: record.event_partition },
              event_position: { N: record.event_position.toString() },
              event_id: { S: record.id },
              event_type: { S: record.type },
              created_at: { S: record.created_at },
              data: { S: JSON.stringify(record.data) },
              metadata: { S: JSON.stringify(record.metadata) }
            }
          }
        };
      })
    }
  });

  return {
    success: true,
    records: records
  };
};
