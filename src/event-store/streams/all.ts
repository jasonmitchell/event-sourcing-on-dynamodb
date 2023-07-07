import { AttributeValue, DynamoDB, QueryCommandOutput } from '@aws-sdk/client-dynamodb';
import { getNumberOfPartitions } from '../event-position';
import { dynamoRecordToEvent, EventRecord } from './events';
import { EventStoreOptions } from '../types';

type ReadDirection = 'forward' | 'backward';

export type ReadAllOptions = EventStoreOptions & {
  partitionSize: number;
  startPosition?: number;
  endPosition?: number;
  direction?: ReadDirection;
};

type QueryOptions = {
  tableName: string;
  partition: string;
  readForward: boolean;
  startPosition: number;
  endPosition: number;
};

export async function* readAll(options: ReadAllOptions): AsyncIterable<EventRecord> {
  yield* readPartitions(options);
}

async function* readPartitions(options: ReadAllOptions, latestKnownPartition?: number): AsyncIterable<EventRecord> {
  const { dynamoDB, tableName, partitionSize, direction } = options;
  const readForward = direction !== 'backward';
  const numberOfPartitions = await getNumberOfPartitions(dynamoDB, tableName, partitionSize);

  if (numberOfPartitions === latestKnownPartition) {
    return;
  }

  if (readForward) {
    const startPartition = latestKnownPartition || 0;
    for (let i = startPartition; i < numberOfPartitions; i++) {
      yield* readPartition(i, options);
    }
  } else {
    const startPartition = latestKnownPartition || numberOfPartitions - 1;
    for (let i = startPartition; i >= 0; i--) {
      yield* readPartition(i, options);
    }
  }

  // Recursively read partitions to catch up to anything written while we were reading
  yield* readPartitions(options, numberOfPartitions);
}

async function* readPartition(partitionNumber: number, options: ReadAllOptions): AsyncIterable<EventRecord> {
  const { dynamoDB } = options;
  const queryOptions = determineQueryOptions(partitionNumber, options);

  yield* queryDynamo(dynamoDB, queryOptions);
}

async function* queryDynamo(dynamoDB: DynamoDB, options: QueryOptions): AsyncIterable<EventRecord> {
  const { tableName, readForward, partition, startPosition, endPosition } = options;
  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const result: QueryCommandOutput = await dynamoDB.query({
      TableName: tableName,
      IndexName: 'all_events',
      ExclusiveStartKey: lastEvaluatedKey,
      KeyConditionExpression: 'event_partition = :partition AND event_position BETWEEN :start_position AND :end_position',
      ExpressionAttributeValues: {
        ':partition': { S: partition },
        ':start_position': { N: String(startPosition) },
        ':end_position': { N: String(endPosition) }
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

function determineQueryOptions(partitionNumber: number, options: ReadAllOptions): QueryOptions {
  const { direction } = options;
  const readForward = direction !== 'backward';

  return readForward ? forwardQueryOptions(partitionNumber, options) : backwardQueryOptions(partitionNumber, options);
}

function forwardQueryOptions(partitionNumber: number, options: ReadAllOptions): QueryOptions {
  const { tableName, endPosition, startPosition } = options;

  return {
    tableName,
    partition: `partition#${partitionNumber}`,
    readForward: true,
    startPosition: startPosition !== undefined ? startPosition + 1 : 0,
    endPosition: endPosition ?? Number.MAX_SAFE_INTEGER
  };
}

function backwardQueryOptions(partitionNumber: number, options: ReadAllOptions): QueryOptions {
  const { tableName, endPosition, startPosition } = options;

  return {
    tableName,
    partition: `partition#${partitionNumber}`,
    readForward: false,

    // Need to flip the start and end positions because we're reading backwards
    // and DynamoDB requires the start position to be less than the end position
    startPosition: endPosition ?? 0,
    endPosition: startPosition ?? Number.MAX_SAFE_INTEGER
  };
}
