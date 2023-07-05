import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getNumberOfPartitions } from '../event-position';
import { EventRecord, EventStoreOptions } from '../types';
import { dynamoRecordToEvent } from './mapping';

type ReadAllOptions = EventStoreOptions & {
  partitionSize: number;
  version?: number;
  startFrom?: number;
};

export async function* readAll(options: ReadAllOptions): AsyncIterable<EventRecord> {
  yield* readPartitions(options);
}

async function* readPartitions(options: ReadAllOptions, latestKnownPartition?: number): AsyncIterable<EventRecord> {
  const { dynamoDB, tableName, partitionSize } = options;
  const numberOfPartitions = await getNumberOfPartitions(dynamoDB, tableName, partitionSize);

  if (numberOfPartitions === latestKnownPartition) {
    return;
  }

  const startPartition = latestKnownPartition || 0;
  for (let i = startPartition; i < numberOfPartitions; i++) {
    yield* readPartition(i, options);
  }

  // Recursively read partitions to catch up to anything written while we were reading
  yield* readPartitions(options, numberOfPartitions);
}

async function* readPartition(partition: number, options: ReadAllOptions): AsyncIterable<EventRecord> {
  const { dynamoDB, tableName, version, startFrom } = options;

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const result = await dynamoDB.query({
      TableName: tableName,
      IndexName: 'all_events',
      KeyConditionExpression: 'event_partition = :partition AND event_position BETWEEN :start_from AND :version',
      ExpressionAttributeValues: {
        ':partition': { S: `partition#${partition}` },
        ':version': { N: String(version ?? Number.MAX_SAFE_INTEGER) },
        ':start_from': { N: String(startFrom !== undefined ? startFrom + 1 : 0) }
      },
      ScanIndexForward: true
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
