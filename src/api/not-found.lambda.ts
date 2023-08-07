import { APIEvent, APIResult } from './req';

export const handler = async (_: APIEvent): Promise<APIResult> => {
  return {
    statusCode: 404,
    body: 'string'
  };
};
