import { AttributeValue } from '@aws-sdk/client-dynamodb';
import { getNumberOfPartitions } from '../event-position';
import { EventData, EventMetadata, EventRecord, EventStoreOptions } from '../types';

type ReadAllOptions = EventStoreOptions & {
  partitionSize: number;
  version?: number;
};

export async function* readAll(options: ReadAllOptions): AsyncIterable<EventRecord> {
  yield* readPartitions(options);
}

async function* readPartitions(options: ReadAllOptions): AsyncIterable<EventRecord> {
  const { dynamoDB, tableName, partitionSize } = options;
  const numberOfPartitions = await getNumberOfPartitions(dynamoDB, tableName, partitionSize);

  for (let i = 0; i < numberOfPartitions; i++) {
    yield* readPartition(i, options);
  }
}

async function* readPartition(partition: number, options: ReadAllOptions): AsyncIterable<EventRecord> {
  const { dynamoDB, tableName } = options;

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined = undefined;

  do {
    const result = await dynamoDB.query({
      TableName: tableName,
      IndexName: 'all_events',
      KeyConditionExpression: 'event_partition = :partition AND event_position <= :version',
      ExpressionAttributeValues: {
        ':partition': { S: `partition#${partition}` },
        ':version': { N: String(options?.version ?? Number.MAX_SAFE_INTEGER) }
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

const dynamoRecordToEvent = (item: Record<string, AttributeValue>): EventRecord => ({
  id: item.event_id.S!,
  type: item.event_type.S!,
  version: Number(item.sk.N!),
  event_partition: item.event_partition.S!,
  event_position: Number(item.event_position.N!),
  created_at: item.created_at.S!,
  data: JSON.parse(item.data.S!) as EventData,
  metadata: JSON.parse(item.metadata.S!) as EventMetadata
});
