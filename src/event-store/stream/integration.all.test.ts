import { connect, EventStore } from '../index';
import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { createTable, randomEvents, randomMetadata } from '../integration.sdk';
import { readAll } from './all';
import { Event } from '../types';

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

  describe('all events stream', () => {
    it('reads events in order', async () => {
      const allEvents = await writeEventsToMultipleStreams(25);
      const retrievedEvents = await readAllEvents();

      expect(retrievedEvents).toStrictEqual(allEvents);
    });

    it('reads events up to a specific position', async () => {
      const allEvents = await writeEventsToMultipleStreams(25);
      const retrievedEvents = await readAllEvents(14);

      expect(retrievedEvents).toStrictEqual(allEvents.splice(0, 15));
    });
  });

  const writeEventsToMultipleStreams = async (numberOfEvents: number): Promise<Event[]> => {
    const streamA = `all-stream-${randomUUID()}`;
    const streamB = `all-stream-${randomUUID()}`;

    const eventsInOrder = [];
    for (let i = 0; i < numberOfEvents; i++) {
      const event = {
        id: randomUUID(),
        type: 'TestEvent',
        data: randomEvents(1)[0],
        metadata: randomMetadata()
      };

      eventsInOrder.push(event);

      const streamToWrite = i % 2 === 0 ? streamA : streamB;
      await eventStore.streamWriter(streamToWrite, [event]);
    }

    return eventsInOrder;
  };

  const readAllEvents = async (version?: number): Promise<Event[]> => {
    const events = [];
    for await (const event of readAll({ dynamoDB, tableName, partitionSize: 10, version })) {
      events.push({
        id: event.id,
        type: event.type,
        data: event.data,
        metadata: event.metadata
      });
    }

    return events;
  };
});
