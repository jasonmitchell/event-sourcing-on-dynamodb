import { randomUUID } from 'crypto';
import { RequestReservation, handleCommand } from './reservation';
import { EventStore } from '../event-store';

export const requestReservation = async (eventStore: EventStore, command: RequestReservation) => {
  const reservationId = randomUUID();
  const result = await handleCommand(eventStore, reservationId, {
    type: 'RequestReservation',
    data: command
  });

  return {
    reservationId,
    reservationCreated: result.success
  };
};
