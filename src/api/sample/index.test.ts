import { handler } from './index';

describe('sample', () => {
  it('should execute handler', async () => {
    const event: any = {
      headers: {
        'content-type': 'application/json'
      },
      body: '{}',
      isBase64Encoded: false,
      requestContext: {}
    };

    const context: any = {
      timeoutEarlyInMillis: 0,
      awsRequestId: 'abcd1234'
    };
    const result = await handler(event, context);
    expect(result.statusCode).toBe(200);
    expect(result.body).toBe('{"message":"Hello World!"}');
  });
});
