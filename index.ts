import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import { withSecureParameter } from './infra/aws/parameter-store';
import { layerFromNodeModules, nodeFunction } from './infra/aws/lambda';
import { withReadDynamo, withReadSecureParameter, withWriteDynamo } from './infra/aws/iam/policy';
import { lambdaRole } from './infra/aws/iam/role';

const apiKey = pulumi.secret(process.env.API_KEY as string);
withSecureParameter('event-sourcing-api-key', apiKey, 'The API key used to authenticate with the API during early development');

const awsSdkLayer = layerFromNodeModules('node-aws-sdk', './infra/layers/aws-sdk/node_modules/');

const table = new aws.dynamodb.Table('events', {
  name: 'event-log',
  hashKey: 'pk',
  rangeKey: 'sk',
  streamEnabled: true,
  streamViewType: 'NEW_IMAGE',
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

// TODO: Tidy up eventbridge stuff
const eventTranslatorRole = lambdaRole('event-translator-role', {
  managedPolicyArns: [aws.iam.ManagedPolicies.AWSLambdaDynamoDBExecutionRole, aws.iam.ManagedPolicies.CloudWatchEventsFullAccess]
});

const eventTranslator = nodeFunction(`api-event-translator`, {
  handlerPath: './dist/api/event-translator/index.js',
  timeout: 120,
  memorySize: 256,
  roleArn: eventTranslatorRole.arn,
  layers: [awsSdkLayer.arn]
});

new aws.lambda.EventSourceMapping('event-translator-mapping', {
  eventSourceArn: table.streamArn,
  functionName: eventTranslator.arn,
  startingPosition: 'LATEST',
  filterCriteria: {
    filters: [
      {
        pattern: JSON.stringify({
          dynamodb: {
            Keys: {
              pk: {
                S: [{ 'anything-but': [{ prefix: '$' }] }]
              }
            }
          }
        })
      }
    ]
  }
});

const eventRule = new aws.cloudwatch.EventRule('api-event-publish-rule', {
  eventPattern: JSON.stringify({
    source: ['demo-streams-api']
  })
});

const eventLogger = nodeFunction(`backend-event-logger`, {
  handlerPath: './dist/backend/event-logger/index.js',
  timeout: 120,
  memorySize: 256
});

new aws.cloudwatch.EventTarget('event-logger-target', {
  arn: eventLogger.arn,
  rule: eventRule.name
});

new aws.lambda.Permission('event-logger-target-permission', {
  action: 'lambda:InvokeFunction',
  function: eventLogger.arn,
  principal: 'events.amazonaws.com',
  sourceArn: eventRule.arn
});

const tokenLambdaAuthorizer = awsx.classic.apigateway.getTokenLambdaAuthorizer({
  authorizerName: 'api-key-authorizer',
  header: 'Authorization',
  handler: nodeFunction(`api-key-authorizer`, {
    handlerPath: './dist/api/auth/api-key/index.js',
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
        handlerPath: './dist/api/streams/append/index.js',
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
        handlerPath: './dist/api/streams/read/index.js',
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
