import { APIEventOf, APIResult } from '../req';
import { RequestReservation } from '../../domain/reservation';
import { connect } from '../../event-store';
import { requestReservation } from '../../domain/requestReservation';
import middy from '@middy/core';
import httpJsonBodyParser from '@middy/http-json-body-parser';
import httpErrorHandler from '@middy/http-error-handler';
import log from 'middy-lesslog';
import { info } from 'lesslog';
import httpSecurityHeaders from '@middy/http-security-headers';
import { requestContext } from '../middleware/request-context';

const eventStore = connect();

const createReservation = async (event: APIEventOf<RequestReservation>): Promise<APIResult> => {
  const command = event.body;

  info('Requesting reservation', { command });
  const { reservationCreated, reservationId } = await requestReservation(eventStore, command);
  info('Reservation created', { reservationId });

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

export const handler = middy(createReservation)
  .use(log())
  .use(requestContext())
  .use(httpErrorHandler())
  .use(httpJsonBodyParser())
  .use(httpSecurityHeaders());
