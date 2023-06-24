import * as aws from '@pulumi/aws';
import { PolicyStatement } from '@pulumi/aws/iam';

type PolicyOptions = {
  statements: PolicyStatement[];
};

export const policy = (name: string, options: PolicyOptions) => {
  if (options.statements.length === 0) {
    throw new Error('Policy must have at least one statement');
  }

  return new aws.iam.Policy(name, {
    policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: options.statements
    })
  });
};

export const withReadSecureParameter = (resource?: string): PolicyStatement => {
  return {
    Sid: 'ReadSecureParameter',
    Effect: 'Allow',
    Action: ['ssm:GetParameter', 'kms:Decrypt'],
    Resource: resource || '*'
  };
};

export const withWriteDynamo = (resource?: string): PolicyStatement => {
  return {
    Sid: 'WriteDynamo',
    Effect: 'Allow',
    Action: [
      'dynamodb:BatchWriteItem',
      'dynamodb:ConditionCheckItem',
      'dynamodb:PutItem',
      'dynamodb:DeleteItem',
      'dynamodb:UpdateItem'
    ],
    Resource: resource || '*'
  };
}

export const withReadDynamo = (resource?: string): PolicyStatement => {
  return {
    Sid: 'ReadWriteDynamo',
    Effect: 'Allow',
    Action: [
      'dynamodb:GetShardIterator',
      'dynamodb:Scan',
      'dynamodb:Query',
      'dynamodb:GetRecords',
      'dynamodb:BatchGetItem',
      'dynamodb:GetItem',
    ],
    Resource: resource || '*'
  };
}
