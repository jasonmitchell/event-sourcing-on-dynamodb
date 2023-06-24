import { APIGatewayEvent } from 'aws-lambda';

export const getRequestModel = <TModel>(event: APIGatewayEvent): TModel | null => {
  const eventBody = event.body && event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;

  if (!eventBody) {
    return null;
  }

  return JSON.parse(eventBody) as TModel;
};
