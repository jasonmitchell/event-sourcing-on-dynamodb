import {connect, EventStore} from "./index";
import {randomUUID} from "crypto";
import {AttributeValue, DynamoDB} from "@aws-sdk/client-dynamodb";

describe('Event Store', () => {
  const dynamoDB = new DynamoDB({ region: 'eu-west-1', endpoint:'http://localhost:8100' });
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

  describe('streams', () => {
    it('should append events to a stream', async () => {
      const streamId = `integration-test-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(3);

      await eventStore.streamWriter(streamId, events.map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadata
      })));

      const storedEvents = await readStreamRaw(dynamoDB, tableName);
      const currentDate = new Date();

      for (let i = 0; i < events.length; i++) {
        const storedEvent = storedEvents[i];
        const event = events[i];

        expect(storedEvent).toEqual({
          stream_id: streamId,
          version: i,
          events_partition: expect.any(String),
          commit_position: i,
          created_at: expect.any(String),
          event_id: expect.stringMatching(/[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}/),
          event_type: 'TestEvent',
          data: event,
          metadata: metadata
        });

        const storedDate = new Date(storedEvent.created_at);
        const dateDifference = Math.abs(currentDate.getTime() - storedDate.getTime());
        expect(dateDifference).toBeLessThan(1000);
      }
    });

    it('should read events from a stream', async () => {
      const streamId = `integration-test-${randomUUID()}`;
      const metadata = randomMetadata();
      const events = randomEvents(3);

      await eventStore.streamWriter(streamId, events.map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadata
      })));

      const stream = await eventStore.streamReader(streamId);
      expect(stream.id).toEqual(streamId);
      expect(stream.version).toEqual(2);
      expect(stream.events).toEqual(events.map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadata
      })));
    });
  });

  describe('all events stream', () => {
    it('increments commit position when appending events', async () => {
      const streamA = `commit-position-${randomUUID()}`;
      const metadataA = randomMetadata();
      const streamB = `commit-position-${randomUUID()}`;
      const metadataB = randomMetadata();

      await eventStore.streamWriter(streamA, randomEvents(3).map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadataA
      })));

      await eventStore.streamWriter(streamB, randomEvents(3).map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadataB
      })));

      const commitResult = await dynamoDB.query({
        TableName: tableName,
        KeyConditionExpression: 'pk = :stream_id',
        ExpressionAttributeValues: {
          ':stream_id': {S: '$commit'}
        }
      });

      expect(commitResult.Items!).toHaveLength(1);

      const commitPosition = Number(commitResult.Items![0].next_commit_position.N);
      expect(commitPosition).toEqual(6);
    });

    it('partitions events', async () => {
      const streamA = `commit-position-${randomUUID()}`;
      const metadataA = randomMetadata();
      const eventsA = randomEvents(12);
      const streamB = `commit-position-${randomUUID()}`;
      const metadataB = randomMetadata();
      const eventsB = randomEvents(12);

      const allEvents = [...eventsA, ...eventsB];
      const partitions = [
        allEvents.slice(0, 10),
        allEvents.slice(10, 20),
        allEvents.slice(20, 30)
      ];

      await eventStore.streamWriter(streamA, eventsA.map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadataA
      })));

      await eventStore.streamWriter(streamB, eventsB.map(event => ({
        type: 'TestEvent',
        data: event,
        metadata: metadataB
      })));

      for (let i = 0; i < 3; i++) {
        const partition = partitions[i];
        const result = await dynamoDB.query({
          TableName: tableName,
          IndexName: 'all_events',
          KeyConditionExpression: 'events_partition = :partition',
          ExpressionAttributeValues: {
            ':partition': {S: `partition#${i}`},
          }
        });

        expect(result.Items!).toHaveLength(partition.length);

        const eventsInPartition = result.Items!.map(dynamoRecordToEvent);
        for (let j = 0; j < eventsInPartition.length; j++) {
          const expectedCommitPosition = j + (i * 10);
          expect(eventsInPartition[j].commit_position).toEqual(expectedCommitPosition);
        }

        const eventData = eventsInPartition.map(e => e.data);
        expect(eventData).toEqual(partition);
      }
    });
  });
});

type TestEvent = {
  propA: string;
  propB: number;
};

const randomMetadata = () => ({
  correlationId: randomUUID(),
  causationId: randomUUID(),
  userId: randomUUID()
});

const randomEvents = (count: number): TestEvent[] => {
  const events: TestEvent[] = [];

  for (let i = 0; i < count; i++) {
    events.push({
      propA: randomUUID(),
      propB: Math.floor(Math.random() * 100)
    });
  }

  return events;
}

const createTable = async (dynamoDB: DynamoDB, tableName: string) => {
  await dynamoDB.createTable({
    TableName: tableName,
    BillingMode: 'PAY_PER_REQUEST',
    KeySchema: [
      {AttributeName: 'pk', KeyType: 'HASH'},
      {AttributeName: 'sk', KeyType: 'RANGE'}
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'all_events',
        KeySchema: [
          {AttributeName: 'events_partition', KeyType: 'HASH'},
          {AttributeName: 'commit_position', KeyType: 'RANGE'}
        ],
        Projection: {
          ProjectionType: 'ALL'
        }
      }
    ],
    AttributeDefinitions: [
      {AttributeName: 'pk', AttributeType: 'S'},
      {AttributeName: 'sk', AttributeType: 'N'},
      {AttributeName: 'events_partition', AttributeType: 'S'},
      {AttributeName: 'commit_position', AttributeType: 'N'}
    ]
  });
}

const readStreamRaw = async (dynamoDB: DynamoDB, tableName: string) => {
  const results = await dynamoDB.scan({
    TableName: tableName
  });

  return results.Items!.filter(item => !item.pk.S?.startsWith('$')).map(dynamoRecordToEvent);
};

const dynamoRecordToEvent = (item: Record<string, AttributeValue>) => ({
  stream_id: item.pk.S!,
  version: Number(item.sk.N!),
  events_partition: item.events_partition.S!,
  commit_position: Number(item.commit_position.N!),
  created_at: item.created_at.S!,
  event_id: item.event_id.S!,
  event_type: item.event_type.S!,
  data: JSON.parse(item.data.S!),
  metadata: JSON.parse(item.metadata.S!)
})
