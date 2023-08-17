import middy from '@middy/core';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { set } from 'lesslog';

export const requestContext = () => {
  return {
    before: (request: middy.Request<APIGatewayProxyEvent, APIGatewayProxyResult, Error, Context>) => {
      set('userId', request.event.requestContext.authorizer?.principalId);
      set('requestId', request.event.requestContext.requestId);
    }
  };
};
