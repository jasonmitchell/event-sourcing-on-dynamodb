import * as aws from '@pulumi/aws';
import { FunctionArgs } from '@pulumi/aws/lambda';
import * as pulumi from '@pulumi/pulumi';
import { policy } from './iam/policy';
import { lambdaRole } from './iam/role';

const awsParametersLayerArn = 'arn:aws:lambda:eu-west-1:015030872274:layer:AWS-Parameters-and-Secrets-Lambda-Extension-Arm64:4';

type Environment = {
  [key: string]: pulumi.Input<string>;
};

type FunctionOptions = {
  indexPath: string;
  roleArn?: pulumi.Input<string>;
  policyStatements?: aws.iam.PolicyStatement[];
  memorySize?: number;
  environment?: pulumi.Input<Environment>;
  timeout?: number;
  layers?: pulumi.Input<string>[];
  requiresParameterStore?: boolean;
};

export const nodeFunction = (name: string, options: FunctionOptions) => {
  if (options.roleArn && options.policyStatements && options.policyStatements.length > 0) {
    throw new Error('Only one of roleArn or policyStatements can be provided');
  }

  const lambdaRole = options.roleArn ? options.roleArn : roleForStatements(name, options.policyStatements!).arn;
  const { implicitLayers, implicitEnvironment } = applyApiCapabilities(options.requiresParameterStore || false);

  const lambdaArgs: FunctionArgs = {
    name: name,
    architectures: ['arm64'],
    runtime: 'nodejs18.x',
    code: new pulumi.asset.AssetArchive({
      'index.js': new pulumi.asset.FileAsset(options.indexPath)
    }),
    handler: 'index.handler',
    role: lambdaRole,
    timeout: options.timeout || 3,
    memorySize: options.memorySize || 128,
    layers: [...implicitLayers, ...(options.layers || [])],
    environment: {
      variables: {
        ...implicitEnvironment,
        ...options.environment
      }
    }
  };

  return new aws.lambda.Function(name, lambdaArgs);
};

const roleForStatements = (name: string, statements?: aws.iam.PolicyStatement[]) => {
  if (!statements || statements.length === 0) {
    return lambdaRole(name);
  }

  return lambdaRole(name, {
    attachedPolicyArns: [
      policy(name, {
        statements: statements
      }).arn
    ]
  });
};

const applyApiCapabilities = (requiresParameterStore: boolean) => {
  const implicitLayers = [];
  const implicitEnvironment: Environment = {};

  if (requiresParameterStore) {
    implicitLayers.push(awsParametersLayerArn);
    implicitEnvironment['PARAMETERS_SECRETS_EXTENSION_LOG_LEVEL'] = 'none';
  }

  return {
    implicitLayers,
    implicitEnvironment
  };
};

export const layerFromNodeModules = (name: string, nodeModulesPath: string) => {
  return new aws.lambda.LayerVersion(name, {
    code: new pulumi.asset.AssetArchive({
      'nodejs/node_modules': new pulumi.asset.FileArchive(nodeModulesPath)
    }),
    compatibleRuntimes: ['nodejs18.x'],
    layerName: name
  });
};
