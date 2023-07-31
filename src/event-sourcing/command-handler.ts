import { randomUUID } from 'crypto';
import { EventStore } from '../event-store';
import { Event } from '../event-store/streams/events';
import { Command, DomainEvent, EventSourcedEntity } from './event-sourced-entity';

type CommandResult = {
  success: boolean;
};

export const CommandHandler =
  <State, CommandType extends Command, EventType extends DomainEvent>(
    toStreamId: (recordId: string) => string,
    entity: EventSourcedEntity<State, CommandType, EventType>
  ) =>
  async (eventStore: EventStore, recordId: string, command: CommandType): Promise<CommandResult> => {
    const streamId = toStreamId(recordId);
    const stream = await eventStore.streamReader(streamId);
    const events = stream.events.map(
      e =>
        ({
          type: e.type,
          data: e.data
        } as EventType)
    );

    const state = events.reduce<State>(entity.apply, entity.getInitialState());
    const newEvents = entity.handle(command, state);

    const toAppend = Array.isArray(newEvents) ? newEvents : [newEvents];
    const eventData: Event[] = toAppend.map(e => ({
      id: randomUUID(),
      ...e
    }));

    const result = await eventStore.streamWriter(streamId, eventData, { expectedVersion: stream.version });
    return {
      success: result.success
    };
  };
