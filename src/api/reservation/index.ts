import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRequestModel } from '../req';
import { RequestReservation, handleCommand } from './model';
import { randomUUID } from 'crypto';
import { connect } from '../../event-store';

const eventStore = connect();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const command = getRequestModel<RequestReservation>(event)!;
  const reservationId = randomUUID();
  const result = await handleCommand(eventStore, reservationId, {
    type: 'RequestReservation',
    data: command
  });

  if (!result.success) {
    return {
      statusCode: 409,
      body: JSON.stringify({ error: 'Failed to request reservation' })
    };
  }

  return {
    statusCode: 204,
    body: JSON.stringify({ reservationId })
  };
};
