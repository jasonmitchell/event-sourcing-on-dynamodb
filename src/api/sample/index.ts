import { APIEvent, APIResult } from '../req';
import middy from '@middy/core';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpErrorHandler from '@middy/http-error-handler';
import log from 'middy-lesslog';
import { info } from 'lesslog';
import httpSecurityHeaders from '@middy/http-security-headers';
import { requestContext } from '../middleware/request-context';

const sample = async (event: APIEvent): Promise<APIResult> => {
  info('Executing sample');

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'Hello World!'
    })
  };
};

export const handler = middy(sample)
  .use(log())
  .use(requestContext())
  .use(httpErrorHandler())
  .use(httpJsonBodyParser())
  .use(httpSecurityHeaders());
