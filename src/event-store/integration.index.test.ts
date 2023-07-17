import { connect, EventStore } from './index';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { createTable, randomEvents } from './streams/integration.sdk';
import { randomUUID } from 'crypto';
import { EventRecord } from './streams/events';
import { readStream, ReadStreamOptions } from './streams/read';

describe('Event Store', () => {
  const dynamoDB = new DynamoDB({ region: 'eu-west-1', endpoint: 'http://localhost:8100' });
  let tableName = `test-${new Date().getTime()}`;
  let eventStore: EventStore;
  let defaultOptions = { partitionSize: 10, dynamoDB, tableName };

  beforeEach(async () => {
    tableName = `test-${new Date().getTime()}`;
    defaultOptions = { partitionSize: 10, dynamoDB, tableName };

    eventStore = connect({
      client: dynamoDB,
      tableName: tableName
    });

    await createTable(dynamoDB, tableName);
  });

  it('appends events to stream', async () => {
    const streamId = `index-${randomUUID()}`;
    const result = await eventStore.streamWriter(streamId, randomEvents(3));
    const retrievedEvents = await readEventsFromStream(streamId);

    expect.assertions(1);
    if (result.success) {
      expect(retrievedEvents).toEqual(result.records);
    }
  });

  it('reads events from stream', async () => {
    const streamId = `index-${randomUUID()}`;
    const events = await writeEventsToStream(streamId, 10);
    const stream = await eventStore.streamReader(streamId);

    expect(stream).toEqual({
      id: streamId,
      version: events.length - 1,
      events: events.map(e => ({
        id: e.id,
        type: e.type,
        data: e.data,
        metadata: e.metadata
      }))
    });
  });

  it('reads empty stream', async () => {
    const streamId = `index-${randomUUID()}`;
    const stream = await eventStore.streamReader(streamId);

    expect(stream).toEqual({
      id: streamId,
      version: 'no_stream',
      events: []
    });
  });

  const writeEventsToStream = async (streamId: string, numberOfEvents: number): Promise<EventRecord[]> => {
    const events = randomEvents(numberOfEvents);

    const result = await eventStore.streamWriter(streamId, events);
    if (result.success) {
      return result.records;
    }

    return [];
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
