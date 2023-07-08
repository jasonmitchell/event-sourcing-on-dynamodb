import { EventStoreOptions } from '../types';
import { Event, EventRecord } from './events';
import { readStream, ReadStreamOptions } from './read';
import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getNextEventPosition } from './write-partitioning';

export type ExpectedVersion = 'any' | 'no_stream' | number;

export type WriteStreamOptions = EventStoreOptions & {
  partitionSize: number;
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

export const writeStream = async (streamId: string, events: Event[], options: WriteStreamOptions): Promise<WriteStreamResult> => {
  const expectedVersion: ExpectedVersion = options.expectedVersion || 'any';
  const streamVersion = await getStreamVersion(streamId, options);
  const error = await validateWriteRequest(streamId, expectedVersion, streamVersion);
  if (error) {
    return error;
  }

  const records = await getEventRecords(streamId, events, streamVersion, options);
  await writeToDynamo(streamId, records, options);

  return {
    success: true,
    records: records
  };
};

const validateWriteRequest = (
  streamId: string,
  expectedVersion: ExpectedVersion,
  streamVersion: number
): ErroredWriteStreamResult | null => {
  if (streamId.startsWith('$')) {
    return {
      success: false,
      error: {
        type: 'invalid_stream_id',
        detail: `Cannot write to stream ${streamId}, the prefix $ is reserved for internal streams`
      }
    };
  }

  if (expectedVersion !== 'any') {
    return validateStreamVersion(streamId, expectedVersion, streamVersion);
  }

  return null;
};

const validateStreamVersion = (
  streamId: string,
  expectedVersion: ExpectedVersion,
  streamVersion: number
): ErroredWriteStreamResult | null => {
  if (expectedVersion === 'no_stream' && streamVersion >= 0) {
    return {
      success: false,
      error: {
        type: 'stream_version_mismatch',
        detail: `Expected stream ${streamId} not to exist, but it does`
      }
    };
  }

  if (expectedVersion !== 'any' && expectedVersion !== 'no_stream' && streamVersion !== expectedVersion) {
    return {
      success: false,
      error: {
        type: 'stream_version_mismatch',
        detail: `Expected stream ${streamId} to be at version ${expectedVersion}, but it was at version ${streamVersion}`
      }
    };
  }

  return null;
};

const getStreamVersion = async (streamId: string, options: EventStoreOptions): Promise<number> => {
  const readStreamOptions: ReadStreamOptions = {
    ...options,
    limit: 1,
    direction: 'backward'
  };

  const streamReader = await readStream(streamId, readStreamOptions);
  const lastEvent = await streamReader[Symbol.asyncIterator]().next();
  return lastEvent?.value?.version || -1;
};

const getEventRecords = async (
  streamId: string,
  events: Event[],
  streamVersion: number,
  options: WriteStreamOptions
): Promise<EventRecord[]> => {
  const { partitionSize } = options;
  const createdAt = new Date().toISOString();
  const startEventPosition = await getNextEventPosition(events.length, options);

  return events.map((event, index) => {
    const version = streamVersion + index + 1;
    const eventPosition = startEventPosition + index;
    const eventPartition = Math.floor(eventPosition / partitionSize);

    return {
      ...event,
      stream_id: streamId,
      metadata: event.metadata || {},
      version,
      created_at: createdAt,
      event_partition: `partition#${eventPartition}`,
      event_position: eventPosition
    };
  });
};

const writeToDynamo = async (streamId: string, events: EventRecord[], options: EventStoreOptions) => {
  const { dynamoDB, tableName } = options;

  const conditionExpression =
    '(attribute_not_exists(pk) AND attribute_not_exists(sk)) OR (attribute_exists(pk) AND attribute_not_exists(sk))';

  const items: Record<string, AttributeValue>[] = events.map(event => ({
    pk: { S: streamId },
    sk: { N: event.version.toString() },
    event_partition: { S: event.event_partition },
    event_position: { N: event.event_position.toString() },
    event_id: { S: event.id },
    event_type: { S: event.type },
    created_at: { S: event.created_at },
    data: { S: JSON.stringify(event.data) },
    metadata: { S: JSON.stringify(event.metadata) }
  }));

  if (items.length > 1) {
    await dynamoDB.transactWriteItems({
      TransactItems: items.map(item => ({
        Put: {
          TableName: tableName,
          ConditionExpression: conditionExpression,
          Item: item
        }
      }))
    });
  } else {
    await dynamoDB.putItem({
      TableName: tableName,
      ConditionExpression: conditionExpression,
      Item: items[0]
    });
  }
};
