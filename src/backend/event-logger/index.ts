import { EventBridgeEvent } from 'aws-lambda';

export const handler = (event: EventBridgeEvent<any, any>) => {
  console.log('Received event from eventbridge:', JSON.stringify(event, null, 2));
};
