import { connect, EventStore } from './index';
import { randomUUID } from 'crypto';
import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { faker } from '@faker-js/faker';
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

  describe('all events stream', () => {
    it('partitions events', async () => {
      const streamA = `event-position-${randomUUID()}`;
      const metadataA = randomMetadata();
      const eventsA = randomEvents(12);
      const streamB = `event-position-${randomUUID()}`;
      const metadataB = randomMetadata();
      const eventsB = randomEvents(12);

      const allEvents = [...eventsA, ...eventsB];
      const partitions = [allEvents.slice(0, 10), allEvents.slice(10, 20), allEvents.slice(20, 30)];

      await eventStore.streamWriter(
        streamA,
        eventsA.map(event => ({
          id: randomUUID(),
          type: 'TestEvent',
          data: event,
          metadata: metadataA
        }))
      );

      await eventStore.streamWriter(
        streamB,
        eventsB.map(event => ({
          id: randomUUID(),
          type: 'TestEvent',
          data: event,
          metadata: metadataB
        }))
      );

      for (let i = 0; i < 3; i++) {
        const partition = partitions[i];
        const result = await dynamoDB.query({
          TableName: tableName,
          IndexName: 'all_events',
          KeyConditionExpression: 'event_partition = :partition',
          ExpressionAttributeValues: {
            ':partition': { S: `partition#${i}` }
          }
        });

        expect(result.Items!).toHaveLength(partition.length);

        const eventsInPartition = result.Items!.map(dynamoRecordToEvent);
        for (let j = 0; j < eventsInPartition.length; j++) {
          const expectedEventPosition = j + i * 10;
          expect(eventsInPartition[j].event_position).toEqual(expectedEventPosition);
        }

        const eventData = eventsInPartition.map(e => e.data);
        expect(eventData).toEqual(partition);
      }
    });

    it('increments event position when appending events', async () => {
      const streamA = `event-position-${randomUUID()}`;
      const metadataA = randomMetadata();
      const streamB = `event-position-${randomUUID()}`;
      const metadataB = randomMetadata();

      await eventStore.streamWriter(
        streamA,
        randomEvents(3).map(event => ({
          id: randomUUID(),
          type: 'TestEvent',
          data: event,
          metadata: metadataA
        }))
      );

      await eventStore.streamWriter(
        streamB,
        randomEvents(3).map(event => ({
          id: randomUUID(),
          type: 'TestEvent',
          data: event,
          metadata: metadataB
        }))
      );

      const commitResult = await dynamoDB.query({
        TableName: tableName,
        KeyConditionExpression: 'pk = :stream_id',
        ExpressionAttributeValues: {
          ':stream_id': { S: '$commit' }
        }
      });

      expect(commitResult.Items!).toHaveLength(1);

      const eventPosition = Number(commitResult.Items![0].next_event_position.N);
      expect(eventPosition).toEqual(6);
    });

    it('handles concurrent writes when setting event position', async () => {
      const delay = (timeout: number) =>
        new Promise((resolve: any) => {
          setTimeout(resolve, timeout);
        });

      const writeSomeEvents = async () => {
        await delay(faker.number.int({ min: 1, max: 25 }));

        const stream = `concurrency-${randomUUID()}`;
        const events = randomEvents(faker.number.int({ min: 8, max: 25 }));
        await eventStore.streamWriter(
          stream,
          events.map(event => ({
            id: randomUUID(),
            type: 'TestEvent',
            data: event
          }))
        );
      };

      const writes = [...Array(50).keys()].map(() => writeSomeEvents());
      await Promise.all(writes);

      const commitResult = await dynamoDB.query({
        TableName: tableName,
        KeyConditionExpression: 'pk = :stream_id',
        ExpressionAttributeValues: {
          ':stream_id': { S: '$commit' }
        }
      });

      const nextEventPosition = Number(commitResult.Items![0].next_event_position.N);
      const totalPartitions = Math.ceil(nextEventPosition / 10);
      for (let i = 0; i < totalPartitions; i++) {
        const result = await dynamoDB.query({
          TableName: tableName,
          IndexName: 'all_events',
          KeyConditionExpression: 'event_partition = :partition',
          ExpressionAttributeValues: {
            ':partition': { S: `partition#${i}` }
          }
        });

        const eventsInPartition = result.Items!.map(dynamoRecordToEvent);
        for (let j = 0; j < eventsInPartition.length; j++) {
          const expectedEventPosition = j + i * 10;
          expect(eventsInPartition[j].event_position).toEqual(expectedEventPosition);
        }
      }
    });
  });
});
