import { DynamoDB } from '@aws-sdk/client-dynamodb';

export type EventStoreOptions = {
  dynamoDB: DynamoDB;
  tableName: string;
};

export type ReadStreamOptions = {
  forward?: boolean;
  limit?: number;
  version?: number;
};
