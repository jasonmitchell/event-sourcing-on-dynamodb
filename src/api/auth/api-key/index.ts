import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, Context } from 'aws-lambda';
import { getEncryptedParameter } from '../../../aws/parameter-store';

const getApiKey = getEncryptedParameter('event-sourcing-api-key');

export const handler = async (event: APIGatewayTokenAuthorizerEvent, context: Context): Promise<APIGatewayAuthorizerResult> => {
  const apiKey = await getApiKey;
  const effect = event.authorizationToken === apiKey ? 'Allow' : 'Deny';

  return {
    principalId: 'some-user-id',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: event.methodArn
        }
      ]
    }
  };
};
