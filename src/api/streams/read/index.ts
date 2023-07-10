import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { connect } from '../../../event-store';

const eventStore = connect();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const streamId = event.pathParameters?.streamId as string;
  const stream = await eventStore.streamReader(streamId);

  return {
    statusCode: 200,
    body: JSON.stringify(stream.events)
  };
};
