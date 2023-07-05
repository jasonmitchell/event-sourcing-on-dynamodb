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
      partitionSize: 10,
      readPageSize: 10
    });

    await createTable(dynamoDB, tableName);
  });

  describe('streams reader', () => {
    it('should read events from a streams', async () => {
      const streamId = `read-stream-${randomUUID()}`;
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
      expect(stream.events).toStrictEqual(eventData);
    });

    it('should read events from a streams upto a specific version', async () => {
      const streamId = `read-stream-to-version-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(10);
      const eventData = events.map(event => ({
        id: randomUUID(),
        type: 'TestEvent',
        data: event,
        metadata: metadata
      }));

      await eventStore.streamWriter(streamId, eventData);

      const stream = await eventStore.streamReader(streamId, { version: 5 });
      expect(stream.id).toEqual(streamId);
      expect(stream.version).toEqual(5);
      expect(stream.events).toStrictEqual(eventData.splice(0, 6));
    });
  });
});
