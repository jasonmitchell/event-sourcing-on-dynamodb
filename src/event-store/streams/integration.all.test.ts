import { connect, EventStore } from '../index';
import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { readAll, ReadAllOptions } from './all';
import { EventRecord } from './events';
import { createTable, randomEvents, randomMetadata } from './integration.sdk';
import { ReadDirection } from './read';

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
    it('reads event details', async () => {
      const allEvents = await writeEventsToMultipleStreams(1);
      const retrievedEvents = await readAllEvents();

      expect(retrievedEvents).toEqual(allEvents);
    });

    describe('forwards', () => {
      it('reads events in order', async () => {
        await writeEventsToMultipleStreams(12);
        const retrievedEvents = await readAllEvents();

        expect(retrievedEvents.map(e => e.event_position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
      });

      it('reads events up to a specific position', async () => {
        await writeEventsToMultipleStreams(12);
        const retrievedEvents = await readAllEvents({ endPosition: 8 });

        expect(retrievedEvents.map(e => e.event_position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      });

      it('reads events starting from specific position', async () => {
        await writeEventsToMultipleStreams(4);
        const retrievedEvents = await readAllEvents({ startPosition: 1 });

        expect(retrievedEvents.map(e => e.event_position)).toEqual([2, 3]);
      });
    });

    describe('backwards', () => {
      it('reads events in order', async () => {
        await writeEventsToMultipleStreams(12);
        const retrievedEvents = await readAllEvents({ direction: 'backward' });

        expect(retrievedEvents.map(e => e.event_position)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
      });

      it('reads events up to a specific position', async () => {
        await writeEventsToMultipleStreams(12);
        const retrievedEvents = await readAllEvents({ endPosition: 7, direction: 'backward' });

        expect(retrievedEvents.map(e => e.event_position)).toEqual([11, 10, 9, 8, 7]);
      });

      it('reads events starting from specific position', async () => {
        await writeEventsToMultipleStreams(4);
        const retrievedEvents = await readAllEvents({ startPosition: 2, direction: 'backward' });

        expect(retrievedEvents.map(e => e.event_position)).toEqual([2, 1, 0]);
      });
    });

    it('reads events written after started reading', async () => {
      await writeEventsToMultipleStreams(15);

      const reader = readAll({ dynamoDB, tableName, partitionSize: 10 });
      const firstRead = await reader[Symbol.asyncIterator]().next();
      expect(firstRead.done).toEqual(false);

      const retrievedEvents: EventRecord[] = [firstRead.value];

      await writeEventsToMultipleStreams(6);

      for await (const event of reader) {
        retrievedEvents.push(event);
      }

      expect(retrievedEvents.map(e => e.event_position)).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
      ]);
    });
  });

  const writeEventsToMultipleStreams = async (numberOfEvents: number): Promise<EventRecord[]> => {
    const streamA = `all-stream-${randomUUID()}`;
    const streamB = `all-stream-${randomUUID()}`;

    const eventsInOrder = [];
    for (let i = 0; i < numberOfEvents; i++) {
      const event = {
        id: i.toString(),
        type: 'TestEvent',
        data: randomEvents(1)[0].data,
        metadata: randomMetadata()
      };

      const streamToWrite = i % 2 === 0 ? streamA : streamB;
      const result = await eventStore.streamWriter(streamToWrite, [event]);
      if (result.success) {
        eventsInOrder.push(...result.records);
      }
    }

    return eventsInOrder;
  };

  const readAllEvents = async (options?: {
    startPosition?: number;
    endPosition?: number;
    direction?: ReadDirection;
  }): Promise<EventRecord[]> => {
    const readAllOptions: ReadAllOptions = {
      dynamoDB,
      tableName,
      partitionSize: 10,
      startPosition: options?.startPosition,
      endPosition: options?.endPosition,
      direction: options?.direction
    };

    const events = [];
    for await (const event of readAll(readAllOptions)) {
      events.push(event);
    }

    return events;
  };
});
