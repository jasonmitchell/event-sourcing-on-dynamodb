import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventData, EventMetadata, EventRecord, ReadEventsOptions } from './types';
import { EventStream } from './index';

export type StreamReader = (streamId: string) => Promise<EventStream>;

export const readEvents = async (dynamoDB: DynamoDB, tableName: string, streamId: string, options?: ReadEventsOptions): Promise<EventRecord[]> => {
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

  return (
    result.Items?.map(item => ({
      id: item.event_id.S!,
      type: item.event_type.S!,
      version: Number(item.sk.N!),
      created_at: item.created_at.S!,
      data: JSON.parse(item.data.S!) as EventData,
      metadata: JSON.parse(item.metadata.S!) as EventMetadata
    })) || []
  );
};
