import { AttributeValue, DynamoDB } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

export type TestEvent = {
  propA: string;
  propB: number;
};

export const randomMetadata = () => ({
  correlationId: randomUUID(),
  causationId: randomUUID(),
  userId: randomUUID()
});

export const randomEvents = (count: number): TestEvent[] => {
  const events: TestEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      propA: randomUUID(),
      propB: Math.floor(Math.random() * 100)
    });
  }

  return events;
};

export const dynamoRecordToEvent = (item: Record<string, AttributeValue>) => ({
  stream_id: item.pk.S!,
  version: Number(item.sk.N!),
  event_partition: item.event_partition.S!,
  event_position: Number(item.event_position.N!),
  created_at: item.created_at.S!,
  event_id: item.event_id.S!,
  event_type: item.event_type.S!,
  data: JSON.parse(item.data.S!),
  metadata: JSON.parse(item.metadata.S!)
});

export const createTable = async (dynamoDB: DynamoDB, tableName: string) => {
  await dynamoDB.createTable({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'all_events',
        KeySchema: [
          { AttributeName: 'event_partition', KeyType: 'HASH' },
          { AttributeName: 'event_position', KeyType: 'RANGE' }
        ],
        Projection: {
          ProjectionType: 'ALL'
        }
      }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'N' },
      { AttributeName: 'event_partition', AttributeType: 'S' },
      { AttributeName: 'event_position', AttributeType: 'N' }
    ]
  });
};
