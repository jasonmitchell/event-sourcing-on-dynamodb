import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { withSecureParameter } from './infra/aws/parameter-store';
import { nodeFunction, layerFromNodeModules } from './infra/aws/lambda';
import {withReadDynamo, withWriteDynamo, withReadSecureParameter} from './infra/aws/iam/policy';

const apiKey = pulumi.secret(process.env.API_KEY as string);

withSecureParameter('event-sourcing-api-key', apiKey, 'The API key used to authenticate with the API during early development');

const table = new aws.dynamodb.Table('events', {
  name: 'event-log',
  hashKey: 'stream_id',
  rangeKey: 'version',
  billingMode: 'PAY_PER_REQUEST',
  attributes: [
    { name: 'stream_id', type: 'S' },
    { name: 'version', type: 'N' },
  ]
});

const awsSdkLayer = layerFromNodeModules('node-aws-sdk', './infra/layers/aws-sdk/node_modules/');

const tokenLambdaAuthorizer = awsx.classic.apigateway.getTokenLambdaAuthorizer({
  authorizerName: 'api-key-authorizer',
  header: 'Authorization',
  handler: nodeFunction(`api-key-authorizer`, {
    indexPath: './dist/api/auth/api-key/index.js',
    requiresParameterStore: true,
    policyStatements: [withReadSecureParameter()]
  }),
  authorizerResultTtlInSeconds: 0
});

const gateway = new awsx.classic.apigateway.API('event-sourcing-api', {
  routes: [
    {
      path: '/test/{id}',
      method: 'PUT',
      eventHandler: nodeFunction(`api-test`, {
        indexPath: './dist/api/test/index.js',
        policyStatements: [withReadDynamo(), withWriteDynamo()],
        timeout: 29,
        memorySize: 256,
        layers: [awsSdkLayer.arn]
      }),
      authorizers: tokenLambdaAuthorizer
    }
  ]
});

export const apiId = gateway.restAPI.id;
export const url = gateway.url;
