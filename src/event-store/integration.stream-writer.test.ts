import { connect, EventStore } from './index';
import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { createTable, dynamoRecordToEvent, randomEvents, randomMetadata } from './integration.sdk';

describe('Event Store', () => {
  const dynamoDB = new DynamoDB({ region: 'eu-west-1', endpoint: 'http://localhost:8100' });
  let tableName = `event-log-${new Date().getTime()}`;
  let eventStore: EventStore;

  beforeEach(async () => {
    tableName = `test-${new Date().getTime()}`;

    eventStore = connect({
      client: dynamoDB,
      tableName: tableName,
      partitionSize: 10
    });

    await createTable(dynamoDB, tableName);
  });

  describe('stream writer', () => {
    it('should append events to a stream', async () => {
      const streamId = `integration-test-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(3);

      await eventStore.streamWriter(
        streamId,
        events.map(event => ({
          id: randomUUID(),
          type: 'TestEvent',
          data: event,
          metadata: metadata
        }))
      );

      const storedEvents = await readStreamRaw(dynamoDB, tableName);
      const currentDate = new Date();

      for (let i = 0; i < events.length; i++) {
        const storedEvent = storedEvents[i];
        const event = events[i];

        expect(storedEvent).toEqual({
          stream_id: streamId,
          version: i,
          event_partition: expect.any(String),
          event_position: i,
          created_at: expect.any(String),
          event_id: expect.stringMatching(/[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}/),
          event_type: 'TestEvent',
          data: event,
          metadata: metadata
        });

        const storedDate = new Date(storedEvent.created_at);
        const dateDifference = Math.abs(currentDate.getTime() - storedDate.getTime());
        expect(dateDifference).toBeLessThan(1000);
      }
    });
  });
});

const readStreamRaw = async (dynamoDB: DynamoDB, tableName: string) => {
  const results = await dynamoDB.scan({
    TableName: tableName
  });

  return results.Items!.filter(item => !item.pk.S?.startsWith('$')).map(dynamoRecordToEvent);
};
