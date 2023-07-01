import { DynamoDB } from '@aws-sdk/client-dynamodb';

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
