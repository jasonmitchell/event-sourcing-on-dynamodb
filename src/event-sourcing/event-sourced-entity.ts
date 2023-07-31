export type DomainEvent<
  DomainEventType extends string = string,
  DomainEventData extends Record<string, unknown> = Record<string, unknown>
> = {
  type: DomainEventType;
  data: DomainEventData;
};

export type Command<
  CommandType extends string = string,
  CommandData extends Record<string, unknown> = Record<string, unknown>
> = {
  type: CommandType;
  data: CommandData;
};

export type EventSourcedEntity<State, CommandType extends Command, Event extends DomainEvent> = {
  handle: (command: CommandType, state: State) => DomainEvent | DomainEvent[];
  apply: (currentState: State, event: Event) => State;
  getInitialState: () => State;
};
