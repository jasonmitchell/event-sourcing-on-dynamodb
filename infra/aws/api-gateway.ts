import * as aws from '@pulumi/aws';
import { policy } from './iam/policy';

/**
 * Deploys the account-level settings for API Gateway. These settings apply to all API
 * Gateways in the account and cannot be removed via Pulumi (but can be updated).
 *
 * https://repost.aws/knowledge-center/api-gateway-cloudwatch-logs
 */
export const deployApiGatewayAccountSettings = () => {
  const apiGatewayCloudwatchRole = new aws.iam.Role('api-gateway-cloudwatch-log-role', {
    assumeRolePolicy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Sid: '',
          Effect: 'Allow',
          Principal: {
            Service: 'apigateway.amazonaws.com'
          },
          Action: 'sts:AssumeRole'
        }
      ]
    }),
    managedPolicyArns: [aws.iam.ManagedPolicies.AmazonAPIGatewayPushToCloudWatchLogs]
  });

  new aws.iam.RolePolicyAttachment(`api-gateway-cloudwatch-log-policy-attachment`, {
    role: apiGatewayCloudwatchRole,
    policyArn: policy('api-gateway-cloudwatch-log-policy', {
      statements: [
        {
          Effect: 'Allow',
          Action: [
            'logs:CreateLogGroup',
            'logs:CreateLogStream',
            'logs:DescribeLogGroups',
            'logs:DescribeLogStreams',
            'logs:PutLogEvents',
            'logs:GetLogEvents',
            'logs:FilterLogEvents'
          ],
          Resource: ['*']
        }
      ]
    }).arn
  });

  new aws.apigateway.Account('api-gateway-account', { cloudwatchRoleArn: apiGatewayCloudwatchRole.arn });
};
