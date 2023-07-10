import { KinesisStreamEvent } from 'aws-lambda';

export const handler = (event: KinesisStreamEvent) => {
  event.Records.forEach(record => {
    const payload = Buffer.from(record.kinesis.data, 'base64').toString('ascii');
    console.log('Received from kinesis:', payload);
  });
};
