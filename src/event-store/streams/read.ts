import { dynamoRecordToEvent, EventRecord } from './events';
import { EventStoreOptions } from '../types';
import { AttributeValue, DynamoDB, QueryCommandOutput } from '@aws-sdk/client-dynamodb';

type ReadDirection = 'forward' | 'backward';

export type ReadStreamOptions = EventStoreOptions & {
  startVersion?: number;
  endVersion?: number;
  direction?: ReadDirection;
};

type QueryOptions = {
  tableName: string;
  readForward: boolean;
  startVersion: number;
  endVersion: number;
};

export async function* readStream(streamId: string, options: ReadStreamOptions): AsyncIterable<EventRecord> {
  const { dynamoDB } = options;
  const queryOptions = determineQueryOptions(options);

  yield* queryDynamo(dynamoDB, streamId, queryOptions);
}

async function* queryDynamo(dynamoDB: DynamoDB, streamId: string, options: QueryOptions): AsyncIterable<EventRecord> {
  const { tableName, readForward, startVersion, endVersion } = options;
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const result: QueryCommandOutput = await dynamoDB.query({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      KeyConditionExpression: 'pk = :stream_id AND sk BETWEEN :start_version AND :end_version',
      ExpressionAttributeValues: {
        ':stream_id': { S: streamId },
        ':start_version': { N: String(startVersion) },
        ':end_version': { N: String(endVersion) }
      },
      ScanIndexForward: readForward
    });

    const events =
      result.Items?.map(item => ({
        ...dynamoRecordToEvent(item),
        version: Number(item.event_position.N!)
      })) || [];

    yield* events;

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);
}

function determineQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { direction } = options;
  const readForward = direction !== 'backward';

  return readForward ? forwardQueryOptions(options) : backwardQueryOptions(options);
}

function forwardQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { tableName, endVersion, startVersion } = options;

  return {
    tableName,
    readForward: true,
    startVersion: startVersion !== undefined ? startVersion : 0,
    endVersion: endVersion ?? Number.MAX_SAFE_INTEGER
  };
}

function backwardQueryOptions(options: ReadStreamOptions): QueryOptions {
  const { tableName, endVersion, startVersion } = options;

  return {
    tableName,
    readForward: false,

    // Need to flip the start and end positions because we're reading backwards
    // and DynamoDB requires the start position to be less than the end position
    startVersion: endVersion ?? 0,
    endVersion: startVersion ?? Number.MAX_SAFE_INTEGER
  };
}
