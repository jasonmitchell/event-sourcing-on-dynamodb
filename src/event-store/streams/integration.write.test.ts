import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { EventRecord } from './events';
import { readStream, ReadStreamOptions } from './read';
import { createTable, randomEvents, randomMetadata } from './integration.sdk';
import { writeStream } from './write';

describe('Event Store', () => {
  const dynamoDB = new DynamoDB({ region: 'eu-west-1', endpoint: 'http://localhost:8100' });
  let tableName = '';
  let defaultOptions = { partitionSize: 10, dynamoDB, tableName };

  beforeEach(async () => {
    tableName = `test-${new Date().getTime()}`;
    defaultOptions = { partitionSize: 10, dynamoDB, tableName };

    await createTable(dynamoDB, tableName);
  });

  describe('write stream', () => {
    it('appends single event to stream', async () => {
      const streamId = `write-stream-${randomUUID()}`;
      const events = randomEvents(1);
      const result = await writeStream(streamId, events, defaultOptions);
      const retrievedEvents = await readEventsFromStream(streamId);

      expect.assertions(1);
      if (result.success) {
        expect(retrievedEvents).toEqual(result.records);
      }
    });

    it('appends events to stream', async () => {
      const streamId = `write-stream-${randomUUID()}`;
      const events = randomEvents(3);
      const result = await writeStream(streamId, events, defaultOptions);
      const retrievedEvents = await readEventsFromStream(streamId);

      expect.assertions(1);
      if (result.success) {
        expect(retrievedEvents).toEqual(result.records);
      }
    });

    it('cannot write to streams beginning with the reserved streams prefix ($)', async () => {
      const streamId = `$write-stream-${randomUUID()}`;
      const events = randomEvents(3);
      const result = await writeStream(streamId, events, defaultOptions);

      expect.assertions(1);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'invalid_stream_id',
          detail: `Cannot write to stream ${streamId}, the prefix $ is reserved for internal streams`
        });
      }
    });

    describe('expected versions', () => {
      describe('any version', () => {
        it('writes to stream when it does not exist', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: 'any' });

          expect.assertions(1);
          if (result.success) {
            const retrievedEvents = await readEventsFromStream(streamId);
            expect(retrievedEvents).toEqual(result.records);
          }
        });

        it('writes to stream when it already exists', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const [_, seed] = await seedStreamAtVersion(streamId, 3);

          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: 'any' });

          expect.assertions(1);
          if (result.success) {
            const retrievedEvents = await readEventsFromStream(streamId);
            expect(retrievedEvents).toEqual([...seed, ...result.records]);
          }
        });
      });

      describe('no stream', () => {
        it('writes to a stream when it does not exist', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: 'no_stream' });

          expect.assertions(1);
          if (result.success) {
            const retrievedEvents = await readEventsFromStream(streamId);
            expect(retrievedEvents).toEqual(result.records);
          }
        });

        it('cannot write to a stream when it already exists', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          await seedStreamAtVersion(streamId, 3);

          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: 'no_stream' });

          expect.assertions(1);
          if (!result.success) {
            expect(result.error).toEqual({
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} not to exist, but it does`
            });
          }
        });
      });

      describe('specific version', () => {
        it('writes to a stream when it is at the specified version', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const [version, seed] = await seedStreamAtVersion(streamId, 3);

          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: version });

          expect.assertions(1);
          if (result.success) {
            const retrievedEvents = await readEventsFromStream(streamId);
            expect(retrievedEvents).toEqual([...seed, ...result.records]);
          }
        });

        it('cannot write to a stream when it is at a newer version than expected', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const [version] = await seedStreamAtVersion(streamId, 3);

          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: version - 1 });

          expect.assertions(1);
          if (!result.success) {
            expect(result.error).toEqual({
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} to be at version ${version - 1}, but it was at version ${version}`
            });
          }
        });

        it('cannot write to a stream when it is at an older version than expected', async () => {
          const streamId = `write-stream-${randomUUID()}`;
          const [version] = await seedStreamAtVersion(streamId, 3);

          const events = randomEvents(3);
          const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: version + 1 });

          expect.assertions(1);
          if (!result.success) {
            expect(result.error).toEqual({
              type: 'stream_version_mismatch',
              detail: `Expected stream ${streamId} to be at version ${version + 1}, but it was at version ${version}`
            });
          }
        });
      });
    });
  });

  const seedStreamAtVersion = async (streamId: string, version: number): Promise<[number, EventRecord[]]> => {
    const metadata = randomMetadata();
    const events = randomEvents(version + 1).map(event => ({
      id: randomUUID(),
      type: 'TestEvent',
      data: event,
      metadata: metadata
    }));

    const result = await writeStream(streamId, events, { ...defaultOptions, expectedVersion: 'no_stream' });
    if (!result.success) {
      throw Error(`Failed to seed stream ${streamId} at version ${version}`);
    }

    return [version, result.records];
  };

  const readEventsFromStream = async (streamId: string): Promise<EventRecord[]> => {
    const readStreamOptions: ReadStreamOptions = {
      dynamoDB,
      tableName
    };

    const events = [];
    for await (const event of readStream(streamId, readStreamOptions)) {
      events.push(event);
    }

    return events;
  };
});
