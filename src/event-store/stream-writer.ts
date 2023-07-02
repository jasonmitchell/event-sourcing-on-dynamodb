import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Event } from './types';
import { readEvents } from './stream-reader';
import { getNextEventPosition } from './event-position';

export type ExpectedVersion = 'any' | 'no_stream' | number;

export type WriteOptions = {
  expectedVersion?: ExpectedVersion;
};

export type WriteStreamResult = SuccessfulWriteStreamResult | ErroredWriteStreamResult;

type SuccessfulWriteStreamResult = {
  success: true;
};

type ErroredWriteStreamResult = {
  success: false;
  error: {
    type: string;
    detail: string;
  };
};

export type StreamWriter = (streamId: string, events: Event[], options?: WriteOptions) => Promise<WriteStreamResult>;

// TODO: maximum event batch size? or implicitly just handle it?
export const writeStream = async (
  dynamoDB: DynamoDB,
  tableName: string,
  partitionSize: number,
  streamId: string,
  events: Event[],
  options?: WriteOptions
): Promise<WriteStreamResult> => {
  const expectedVersion: ExpectedVersion = options?.expectedVersion || 'any';
  const existingEvents = await readEvents(dynamoDB, tableName, streamId, {
    forward: false,
    limit: 1
  });

  const latestVersion = existingEvents.length > 0 ? existingEvents[0].version : -1;

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

  // TODO: Transactional write if more than one event probably
  // TODO: Max number of items
  await dynamoDB.batchWriteItem({
    RequestItems: {
      [tableName]: events.map((event, index) => {
        const version = latestVersion + index + 1;
        const eventPosition = startEventPosition + index;
        const eventPartition = Math.floor(eventPosition / partitionSize);

        return {
          PutRequest: {
            Item: {
              pk: { S: streamId },
              sk: { N: version.toString() },
              event_partition: { S: `partition#${eventPartition}` },
              event_position: { N: eventPosition.toString() },
              event_id: { S: event.id },
              event_type: { S: event.type },
              created_at: { S: createdAt },
              data: { S: JSON.stringify(event.data) },
              metadata: { S: JSON.stringify(event.metadata || {}) }
            }
          }
        };
      })
    }
  });

  return {
    success: true
  };
};
