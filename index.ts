import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { withSecureParameter } from './infra/aws/parameter-store';
import { layerFromNodeModules, nodeFunction } from './infra/aws/lambda';
import { withReadDynamo, withReadSecureParameter, withWriteDynamo } from './infra/aws/iam/policy';
import { lambdaRole } from './infra/aws/iam/role';

const apiKey = pulumi.secret(process.env.API_KEY as string);

withSecureParameter('event-sourcing-api-key', apiKey, 'The API key used to authenticate with the API during early development');

const table = new aws.dynamodb.Table('events', {
  name: 'event-log',
  hashKey: 'pk',
  rangeKey: 'sk',
  billingMode: 'PAY_PER_REQUEST',
  attributes: [
    { name: 'pk', type: 'S' },
    { name: 'sk', type: 'N' },
    { name: 'event_partition', type: 'S' },
    { name: 'event_position', type: 'N' }
  ],
  globalSecondaryIndexes: [
    {
      name: 'all_events',
      hashKey: 'event_partition',
      rangeKey: 'event_position',
      projectionType: 'ALL'
    }
  ]
});

const eventStream = new aws.kinesis.Stream('events-stream', {
  streamModeDetails: {
    streamMode: 'ON_DEMAND'
  },
  retentionPeriod: 24
});

new aws.dynamodb.KinesisStreamingDestination('dynamo-kinesis-events-stream', {
  streamArn: eventStream.arn,
  tableName: table.name
});

const eventProcessorRole = lambdaRole('event-processor-role', {
  managedPolicyArns: [aws.iam.ManagedPolicies.AWSLambdaKinesisExecutionRole]
});

const eventProcessor = nodeFunction(`process-events`, {
  indexPath: './dist/api/processing/index.js',
  timeout: 120,
  memorySize: 256,
  roleArn: eventProcessorRole.arn
});

new aws.lambda.EventSourceMapping('event-stream-processor-mapping', {
  eventSourceArn: eventStream.arn,
  functionName: eventProcessor.arn,
  startingPosition: 'LATEST'
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
      path: '/streams/{streamId}',
      method: 'PUT',
      eventHandler: nodeFunction(`api-append-events`, {
        indexPath: './dist/api/streams/append/index.js',
        policyStatements: [withReadDynamo(), withWriteDynamo()],
        timeout: 29,
        memorySize: 256,
        layers: [awsSdkLayer.arn]
      }),
      authorizers: tokenLambdaAuthorizer
    },
    {
      path: '/streams/{streamId}',
      method: 'GET',
      eventHandler: nodeFunction(`api-read-events`, {
        indexPath: './dist/api/streams/read/index.js',
        policyStatements: [withReadDynamo()],
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
