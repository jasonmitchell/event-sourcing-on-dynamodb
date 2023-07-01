import { DynamoDB } from '@aws-sdk/client-dynamodb';
import { Event } from './types';
import { readEvents } from './stream-reader';
import { getNextEventPosition } from './event-position';

export type StreamWriter = (streamId: string, events: Event[]) => Promise<void>;

// TODO: expected version
// TODO: maximum event batch size? or implicitly just handle it?
export const writeStream = async (
  dynamoDB: DynamoDB,
  tableName: string,
  partitionSize: number,
  streamId: string,
  events: Event[]
): Promise<void> => {
  const existingEvents = await readEvents(dynamoDB, tableName, streamId, {
    forward: false,
    limit: 1
  });

  const latestVersion = existingEvents.length > 0 ? existingEvents[0].version : -1;
  const createdAt = new Date().toISOString();

  const startEventPosition = await getNextEventPosition(dynamoDB, tableName, events.length);

  // TODO: Transactional write if more than one event probably
  // TODO: Throw if version mismatch
  // TODO: Expected stream versions, not exists, etc
  // TODO: Max number of items
  await dynamoDB.batchWriteItem({
    RequestItems: {
      [tableName]: events.map((event, index) => {
        const version = latestVersion + index + 1;
        const eventPosition = startEventPosition + index;
        const eventPartition = Math.floor(eventPosition / partitionSize);

        return {
          PutRequest: {
            Item: {
              pk: { S: streamId },
              sk: { N: version.toString() },
              event_partition: { S: `partition#${eventPartition}` },
              event_position: { N: eventPosition.toString() },
              event_id: { S: event.id },
              event_type: { S: event.type },
              created_at: { S: createdAt },
              data: { S: JSON.stringify(event.data) },
              metadata: { S: JSON.stringify(event.metadata || {}) }
            }
          }
        };
      })
    }
  });
};
