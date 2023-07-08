import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventRecord } from './events';
import { ReadDirection, readStream, ReadStreamOptions } from './read';
import { createTable, randomEvents } from './integration.sdk';
import { writeStream } from './write';

describe('Event Store', () => {
  const dynamoDB = new DynamoDB({ region: 'eu-west-1', endpoint: 'http://localhost:8100' });
  let tableName = '';

  beforeEach(async () => {
    tableName = `test-${new Date().getTime()}`;
    await createTable(dynamoDB, tableName);
  });

  describe('read stream', () => {
    it('reads event details', async () => {
      const [streamId, events] = await writeEventsToStream(10);
      const retrievedEvents = await readEventsFromStream(streamId);

      expect(retrievedEvents).toEqual(events);
    });

    describe('forwards', () => {
      it('reads stream', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId);

        expect(retrievedEvents.map(e => e.version)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      });

      it('limits events returned', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { limit: 2 });

        expect(retrievedEvents.map(e => e.version)).toEqual([0, 1]);
      });

      it('reads stream up to specific version', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { endVersion: 6 });

        expect(retrievedEvents.map(e => e.version)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      });

      it('reads stream from specific version', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { startVersion: 2 });

        expect(retrievedEvents.map(e => e.version)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
      });
    });

    describe('backwards', () => {
      it('reads stream', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { direction: 'backward' });

        expect(retrievedEvents.map(e => e.version)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
      });

      it('limits events returned', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { limit: 2, direction: 'backward' });

        expect(retrievedEvents.map(e => e.version)).toEqual([9, 8]);
      });

      it('reads stream up to specific version', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { endVersion: 4, direction: 'backward' });

        expect(retrievedEvents.map(e => e.version)).toEqual([9, 8, 7, 6, 5, 4]);
      });

      it('reads stream from specific version', async () => {
        const [streamId] = await writeEventsToStream(10);
        const retrievedEvents = await readEventsFromStream(streamId, { startVersion: 6, direction: 'backward' });

        expect(retrievedEvents.map(e => e.version)).toEqual([6, 5, 4, 3, 2, 1, 0]);
      });
    });
  });

  const writeEventsToStream = async (numberOfEvents: number): Promise<[string, EventRecord[]]> => {
    const streamId = `read-stream-${randomUUID()}`;
    const events = randomEvents(numberOfEvents);

    const result = await writeStream(streamId, events, { dynamoDB, tableName, partitionSize: 10 });
    if (result.success) {
      return [streamId, result.records];
    }

    return [streamId, []];
  };

  const readEventsFromStream = async (
    streamId: string,
    options?: {
      startVersion?: number;
      endVersion?: number;
      limit?: number;
      direction?: ReadDirection;
    }
  ): Promise<EventRecord[]> => {
    const readStreamOptions: ReadStreamOptions = {
      dynamoDB,
      tableName,
      startVersion: options?.startVersion,
      endVersion: options?.endVersion,
      limit: options?.limit,
      direction: options?.direction
    };

    const events = [];
    for await (const event of readStream(streamId, readStreamOptions)) {
      events.push(event);
    }

    return events;
  };
});
