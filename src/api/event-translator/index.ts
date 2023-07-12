import { DynamoDBStreamEvent } from 'aws-lambda';
import { dynamoRecordToEvent } from '../../event-store/streams/events';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridgeClient = new EventBridgeClient({ region: 'eu-west-1' });

// TODO: Maybe replace this whole thing with an eventbridge pipe?
export const handler = async (streamEvent: DynamoDBStreamEvent): Promise<void> => {
  console.debug('Received event from dynamodb stream:', JSON.stringify(streamEvent, null, 2));

  const events = streamEvent.Records.filter(e => e.dynamodb).map(e => {
    const record = e.dynamodb!;
    const event = dynamoRecordToEvent(record.NewImage!);

    return {
      Detail: JSON.stringify({
        ...event,
        sequenceNumber: record.SequenceNumber
      }),
      Resources: [e.eventSourceARN!],
      DetailType: event.type,
      Source: 'demo-streams-api'
    };
  });

  if (events.length === 0) {
    console.warn('No events to publish');
    return;
  }

  const result = await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: events
    })
  );

  console.log(result);
};
