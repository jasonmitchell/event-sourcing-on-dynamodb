import { AttributeValue, DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventData, EventMetadata, EventRecord } from './streams/events';
import { ReadStreamOptions } from './types';
import { EventStream } from './index';
import { getNumberOfPartitions } from './event-position';

export type StreamReader = (streamId: string, options?: ReadStreamOptions) => Promise<EventStream>;

export const readEvents = async (
  dynamoDB: DynamoDB,
  tableName: string,
  partitionSize: number,
  readPageSize: number,
  streamId: string,
  options?: ReadStreamOptions
): Promise<EventRecord[]> => {
  if (streamId === '$all') {
    return await readAllEvents(dynamoDB, tableName, partitionSize, options);
  }

  // TODO: Page through results
  const result = await dynamoDB.query({
    TableName: tableName,
    KeyConditionExpression: 'pk = :stream_id AND sk <= :version',
    ExpressionAttributeValues: {
      ':stream_id': { S: streamId },
      ':version': { N: String(options?.version ?? Number.MAX_SAFE_INTEGER) }
    },
    ConsistentRead: true,
    ScanIndexForward: options?.forward,
    Limit: options?.limit
  });

  return result.Items?.map(dynamoRecordToEvent) || [];
};

const readAllEvents = async (
  dynamoDB: DynamoDB,
  tableName: string,
  partitionSize: number,
  options?: ReadStreamOptions
): Promise<EventRecord[]> => {
  // TODO: paged reader
  // TODO: check number of partitions after reading one so we can keep up with the latest
  const numberOfPartitions = await getNumberOfPartitions(dynamoDB, tableName, partitionSize);

  const events: EventRecord[] = [];
  for (let i = 0; i < numberOfPartitions; i++) {
    // TODO: page through results in partition
    const result = await dynamoDB.query({
      TableName: tableName,
      IndexName: 'all_events',
      KeyConditionExpression: 'event_partition = :partition AND event_position <= :version',
      ExpressionAttributeValues: {
        ':partition': { S: `partition#${i}` },
        ':version': { N: String(options?.version ?? Number.MAX_SAFE_INTEGER) }
      },
      ScanIndexForward: options?.forward,
      Limit: options?.limit
    });

    const eventsInPartition =
      result.Items?.map(item => ({
        ...dynamoRecordToEvent(item),
        version: Number(item.event_position.N!)
      })) || [];
    events.push(...eventsInPartition);
  }

  return events;
};

const dynamoRecordToEvent = (item: Record<string, AttributeValue>) => ({
  id: item.event_id.S!,
  type: item.event_type.S!,
  version: Number(item.sk.N!),
  event_partition: item.event_partition.S!,
  event_position: Number(item.event_position.N!),
  created_at: item.created_at.S!,
  data: JSON.parse(item.data.S!) as EventData,
  metadata: JSON.parse(item.metadata.S!) as EventMetadata
});
