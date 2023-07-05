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

  describe('all events streams', () => {
    it('reads events in order', async () => {
      const allEvents = await writeEventsToMultipleStreams(25);
      const retrievedEvents = await readAllEvents();

      expect(retrievedEvents).toStrictEqual(allEvents);
    });

    it('reads events up to a specific position', async () => {
      const allEvents = await writeEventsToMultipleStreams(25);
      const retrievedEvents = await readAllEvents({ version: 14 });

      expect(retrievedEvents).toStrictEqual(allEvents.splice(0, 15));
    });

    it('reads events starting from specific position', async () => {
      const streamId = `all-stream-${randomUUID()}`;
      const events = randomEvents(4).map(event => ({
        id: randomUUID(),
        type: 'TestEvent',
        data: event,
        metadata: randomMetadata()
      }));

      await eventStore.streamWriter(streamId, events);

      const retrievedEvents = await readAllEvents({ startFrom: 1 });
      expect(retrievedEvents).toStrictEqual([events[2], events[3]]);
    });

    it('reads events written after started reading', async () => {
      const firstBatch = await writeEventsToMultipleStreams(15);

      const reader = readAll({ dynamoDB, tableName, partitionSize: 10 });
      const firstRead = await reader[Symbol.asyncIterator]().next();
      expect(firstRead.done).toEqual(false);

      const retrievedEvents: Event[] = [
        {
          id: firstRead.value.id,
          type: firstRead.value.type,
          data: firstRead.value.data,
          metadata: firstRead.value.metadata
        }
      ];

      const secondBatch = await writeEventsToMultipleStreams(15);
      const allEvents = [...firstBatch, ...secondBatch];

      for await (const event of reader) {
        retrievedEvents.push({
          id: event.id,
          type: event.type,
          data: event.data,
          metadata: event.metadata
        });
      }

      expect(retrievedEvents).toStrictEqual(allEvents);
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

  type ReadAllEventsOptions = {
    version?: number;
    startFrom?: number;
  };

  const readAllEvents = async (options?: ReadAllEventsOptions): Promise<Event[]> => {
    const readAllOptions = { dynamoDB, tableName, partitionSize: 10, version: options?.version, startFrom: options?.startFrom };

    const events = [];
    for await (const event of readAll(readAllOptions)) {
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
