import { connect, EventStore } from './index';
import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { createTable, randomEvents, randomMetadata } from './integration.sdk';

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

  describe('stream reader', () => {
    it('should read events from a stream', async () => {
      const streamId = `integration-test-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(3);
      const eventData = events.map(event => ({
        id: randomUUID(),
        type: 'TestEvent',
        data: event,
        metadata: metadata
      }));

      await eventStore.streamWriter(streamId, eventData);

      const stream = await eventStore.streamReader(streamId);
      expect(stream.id).toEqual(streamId);
      expect(stream.version).toEqual(2);
      expect(stream.events).toEqual(
        eventData.map(event => ({
          id: event.id,
          type: 'TestEvent',
          data: event.data,
          metadata: event.metadata
        }))
      );
    });
  });
});
