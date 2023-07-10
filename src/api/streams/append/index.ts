import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRequestModel } from '../../req';
import { connect } from '../../../event-store';
import { randomUUID } from 'crypto';
import { NewEvent } from '../models';

const eventStore = connect();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const streamId = event.pathParameters?.streamId as string;
  const appendEvents = getRequestModel<NewEvent[]>(event)!;
  const metadata = { correlationId: event.requestContext.requestId };
  const events = appendEvents.map(event => ({
    id: randomUUID(),
    type: event.type,
    data: event.data,
    metadata: metadata
  }));

  await eventStore.streamWriter(streamId, events);

  return {
    statusCode: 204,
    body: ''
  };
};
