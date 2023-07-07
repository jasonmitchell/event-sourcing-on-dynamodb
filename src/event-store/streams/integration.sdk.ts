import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import { Event } from './events';

export type TestEvent = {
  propA: string;
  propB: number;
};

export const randomEvents = (count: number): Event[] => {
  const events: Event[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      id: randomUUID(),
      type: 'TestEvent',
      data: {
        propA: randomUUID(),
        propB: Math.floor(Math.random() * 100)
      },
      metadata: randomMetadata()
    });
  }

  return events;
};

export const randomMetadata = () => ({
  correlationId: randomUUID(),
  causationId: randomUUID(),
  userId: randomUUID()
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
