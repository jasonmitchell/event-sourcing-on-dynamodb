import { DynamoDB } from '@aws-sdk/client-dynamodb';

export const getNumberOfPartitions = async (dynamoDB: DynamoDB, tableName: string, partitionSize: number): Promise<number> => {
  const result = await dynamoDB.query({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk = :sk',
    ExpressionAttributeValues: {
      ':pk': { S: '$commit' },
      ':sk': { N: '0' }
    }
  });

  if (!result.Items?.length) {
    return 0;
  }

  const attributes = result.Items[0];
  return attributes?.next_event_position?.N ? Math.ceil(Number(attributes.next_event_position.N) / partitionSize) : 0;
};

export const getNextEventPosition = async (dynamoDB: DynamoDB, tableName: string, increment: number): Promise<number> => {
  const result = await dynamoDB.updateItem({
    TableName: tableName,
    Key: {
      pk: { S: '$commit' },
      sk: { N: '0' }
    },
    UpdateExpression: 'ADD next_event_position :increment',
    ExpressionAttributeValues: {
      ':increment': { N: increment.toString() }
    },
    ReturnValues: 'UPDATED_OLD'
  });

  return result.Attributes?.next_event_position?.N ? Number(result.Attributes.next_event_position.N) : 0;
};
