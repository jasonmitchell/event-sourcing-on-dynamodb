import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRequestModel } from '../req';
import { RequestReservation } from '../../domain/reservation';
import { connect } from '../../event-store';
import { requestReservation } from '../../domain/requestReservation';

const eventStore = connect();

export const handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
  const command = getRequestModel<RequestReservation>(event)!;
  const { reservationCreated, reservationId } = await requestReservation(eventStore, command);

  if (!reservationCreated) {
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
