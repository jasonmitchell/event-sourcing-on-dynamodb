import { randomUUID } from 'crypto';
import { EventSourcedEntity } from '../event-sourcing/event-sourced-entity';
import { CommandHandler } from '../event-sourcing/command-handler';

export type RequestReservation = {
  customerId: string;
  seats: string[];
};

type ReservationCommand = {
  type: 'RequestReservation';
  data: RequestReservation;
};

type ReservationEvent = {
  type: 'ReservationRequested';
  data: {
    id: string;
    customerId: string;
    seats: string[];
  };
};

type Reservation =
  | { status: 'empty' }
  | {
      id: string;
      status: string;
      customerId: string;
      seats: string[];
    };

const handle = (command: ReservationCommand, state: Reservation): ReservationEvent | ReservationEvent[] => {
  switch (command.type) {
    case 'RequestReservation':
      return {
        type: 'ReservationRequested',
        data: {
          id: randomUUID(),
          customerId: command.data.customerId,
          seats: command.data.seats
        }
      };

    default: {
      throw new Error(`Unhandled command: ${JSON.stringify(command)}`);
    }
  }
};

const apply = (currentState: Reservation, event: ReservationEvent): Reservation => {
  switch (event.type) {
    case 'ReservationRequested':
      return {
        id: event.data.id,
        status: 'Requested',
        customerId: event.data.customerId,
        seats: event.data.seats
      };

    default: {
      return currentState;
    }
  }
};

export const entity: EventSourcedEntity<Reservation, ReservationCommand, ReservationEvent> = {
  handle,
  apply,
  getInitialState: () => {
    return {
      status: 'empty'
    };
  }
};

export const handleCommand = CommandHandler<Reservation, ReservationCommand, ReservationEvent>(
  (reservationId: string) => `reservation-${reservationId}`,
  entity
);
