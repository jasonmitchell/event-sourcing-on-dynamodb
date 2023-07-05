import { connect, EventStore } from './index';
import { Event } from './types';
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

  describe('streams writer', () => {
    it('should append events to a streams', async () => {
      const streamId = `stream-writer-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(3).map(event => ({
        id: randomUUID(),
        type: 'TestEvent',
        data: event,
        metadata: metadata
      }));

      const result = await eventStore.streamWriter(streamId, events);
      expect(result).toStrictEqual({
        success: true
      });

      await expectStreamMatches(streamId, events);
    });

    it('cannot write to streams beginning with the reserved streams prefix ($)', async () => {
      const streamId = `$reserved-${randomUUID()}`;
      const events = randomEvents(3).map(event => ({
        id: randomUUID(),
        type: 'TestEvent',
        data: event
      }));

      const result = await eventStore.streamWriter(streamId, events);

      expect(result).toStrictEqual({
        success: false,
        error: {
          type: 'invalid_stream_id',
          detail: `Cannot write to stream ${streamId}, the prefix $ is reserved for internal streams`
        }
      });
    });

    describe('streams versioning', () => {
      describe('no streams', () => {
        it('can write events when streams does not exist', async () => {
          const streamId = `stream-versioning-${randomUUID()}`;
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: 'no_stream'
          });

          expect(result).toStrictEqual({
            success: true
          });

          await expectStreamMatches(streamId, events);
        });

        it('cannot write events when streams already exists', async () => {
          const [streamId, _, seededEvents] = await seedStreamAtVersion('streams-versioning', 0);
          const newEvents = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const result = await eventStore.streamWriter(streamId, newEvents, {
            expectedVersion: 'no_stream'
          });

          expect(result).toStrictEqual({
            success: false,
            error: {
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} not to exist, but it does`
            }
          });

          await expectStreamMatches(streamId, seededEvents);
        });
      });

      describe('any version', () => {
        it('can write events when streams does not exist', async () => {
          const streamId = `stream-versioning-${randomUUID()}`;
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: 'any'
          });

          expect(result).toStrictEqual({
            success: true
          });

          await expectStreamMatches(streamId, [...events]);
        });

        it('can write events when streams already exists', async () => {
          const [streamId, _, seededEvents] = await seedStreamAtVersion('streams-versioning', 10);
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: 'any'
          });

          expect(result).toStrictEqual({
            success: true
          });

          await expectStreamMatches(streamId, [...seededEvents, ...events]);
        });
      });

      describe('specific version', () => {
        it('can write events when streams is at expected version', async () => {
          const [streamId, version, seededEvents] = await seedStreamAtVersion('streams-versioning', 10);
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: version
          });

          expect(result).toStrictEqual({
            success: true
          });

          await expectStreamMatches(streamId, [...seededEvents, ...events]);
        });

        it('cannot write events when streams is at newer version than expected', async () => {
          const [streamId, version, seededEvents] = await seedStreamAtVersion('streams-versioning', 10);
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const expectedVersion = version - 1;
          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: expectedVersion
          });

          expect(result).toStrictEqual({
            success: false,
            error: {
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} to be at version ${expectedVersion}, but it was at version ${version}`
            }
          });

          await expectStreamMatches(streamId, [...seededEvents]);
        });

        it('cannot write events when streams is at older version than expected', async () => {
          const [streamId, version, seededEvents] = await seedStreamAtVersion('streams-versioning', 10);
          const events = randomEvents(3).map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }));

          const expectedVersion = version + 1;
          const result = await eventStore.streamWriter(streamId, events, {
            expectedVersion: expectedVersion
          });

          expect(result).toStrictEqual({
            success: false,
            error: {
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} to be at version ${expectedVersion}, but it was at version ${version}`
            }
          });

          await expectStreamMatches(streamId, [...seededEvents]);
        });
      });
    });
  });

  const expectStreamMatches = async (streamId: string, events: Event[]) => {
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
        event_id: event.id,
        event_type: event.type,
        data: event.data,
        metadata: event.metadata || {}
      });

      const storedDate = new Date(storedEvent.created_at);
      const dateDifference = Math.abs(currentDate.getTime() - storedDate.getTime());
      expect(dateDifference).toBeLessThan(1000);
    }
  };

  const seedStreamAtVersion = async (streamPrefix: string, version: number): Promise<[string, number, Event[]]> => {
    const streamId = `${streamPrefix}-${randomUUID()}`;
    const metadata = randomMetadata();
    const events = randomEvents(version + 1).map(event => ({
      id: randomUUID(),
      type: 'TestEvent',
      data: event,
      metadata: metadata
    }));

    await eventStore.streamWriter(streamId, events, {
      expectedVersion: 'no_stream'
    });

    return [streamId, version, events];
  };
});

const readStreamRaw = async (dynamoDB: DynamoDB, tableName: string) => {
  const results = await dynamoDB.scan({
    TableName: tableName
  });

  return results.Items!.filter(item => !item.pk.S?.startsWith('$')).map(dynamoRecordToEvent);
};
