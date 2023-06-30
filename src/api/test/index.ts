import {APIGatewayProxyResult, APIGatewayEvent} from 'aws-lambda';
import {getRequestModel} from '../req';
import {connect} from "../../event-store";
import {randomUUID} from "crypto";

type TestEvent = {
  count: number;
}

const eventStore = connect();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const id = event.pathParameters?.id as string;
  const streamId = `test-${id}`;
  const testEvent = getRequestModel<TestEvent>(event)!;

  const stream = await eventStore.streamReader(streamId);

  console.log(stream);

  const newEvent = {
    id: randomUUID(),
    type: 'test',
    data: testEvent,
    metadata: {
      correlationId: event.requestContext.requestId,
      something_else: 'test'
    }
  }

  await eventStore.streamWriter(streamId, [newEvent]);

  return {
    statusCode: 201,
    body: ''
  };
};
