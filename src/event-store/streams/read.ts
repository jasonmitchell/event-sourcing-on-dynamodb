import { dynamoRecordToEvent, EventRecord } from './events';
import { AttributeValue, DynamoDB, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { EventStoreOptions } from '../index';

export type ReadDirection = 'forward' | 'backward';

export type ReadOptions = EventStoreOptions & {
  direction?: ReadDirection;
};

export type ReadStreamOptions = ReadOptions & {
  startVersion?: number;
  endVersion?: number;
  limit?: number;
};

type QueryOptions = {
  tableName: string;
  readForward: boolean;
  startVersion: number;
  endVersion: number;
  limit?: number;
};

export async function* readStream(streamId: string, options: ReadStreamOptions): AsyncIterable<EventRecord> {
  const { dynamoDB } = options;
  const queryOptions = determineQueryOptions(options);

  yield* queryDynamo(dynamoDB, streamId, queryOptions);
}

async function* queryDynamo(dynamoDB: DynamoDB, streamId: string, options: QueryOptions): AsyncIterable<EventRecord> {
  const { tableName, readForward, startVersion, endVersion, limit } = options;

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;
  let eventsRead = 0;

  do {
    const result: QueryCommandOutput = await dynamoDB.query({
      TableName: tableName,
      ConsistentRead: true,
      ExclusiveStartKey: lastEvaluatedKey,
      KeyConditionExpression: 'pk = :stream_id AND sk BETWEEN :start_version AND :end_version',
      ExpressionAttributeValues: {
        ':stream_id': { S: streamId },
        ':start_version': { N: String(startVersion) },
        ':end_version': { N: String(endVersion) }
      },
      ScanIndexForward: readForward,
      Limit: limit
    });

    const events = result.Items?.map(dynamoRecordToEvent) || [];
    const eventsToRead = limit !== undefined ? Math.min(limit - eventsRead, events.length) : events.length;
    const eventsToReturn = events.slice(0, eventsToRead);
    eventsRead += eventsToRead;

    yield* eventsToReturn;

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey && (limit === undefined || eventsRead < limit));
}

function determineQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { direction } = options;
  const readForward = direction !== 'backward';

  return readForward ? forwardQueryOptions(options) : backwardQueryOptions(options);
}

function forwardQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { tableName, endVersion, startVersion, limit } = options;

  return {
    tableName,
    readForward: true,
    startVersion: startVersion !== undefined ? startVersion : 0,
    endVersion: endVersion ?? Number.MAX_SAFE_INTEGER,
    limit: limit
  };
}

function backwardQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { tableName, endVersion, startVersion, limit } = options;

  return {
    tableName,
    readForward: false,

    // Need to flip the start and end positions because we're reading backwards
    // and DynamoDB requires the start position to be less than the end position
    startVersion: endVersion ?? 0,
    endVersion: startVersion ?? Number.MAX_SAFE_INTEGER,
    limit: limit
  };
}
