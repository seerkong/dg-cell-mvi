import type { AppEvent, AppMessageDescriptor } from './contract';

export type AppMessageKind = 'command' | 'event';

interface AppMessageBase<TPayload> {
  type: string;
  payload: TPayload;
  payloadDef?: string;
  policy?: string;
}

export interface AppMessageOptions {
  payloadDef?: string;
  policy?: string;
}

export interface CommandMessage<TPayload = Record<string, unknown>> extends AppMessageBase<TPayload> {
  kind: 'command';
}

export interface EventMessage<TPayload = Record<string, unknown>> extends AppMessageBase<TPayload> {
  kind: 'event';
}

export type AppMessage<TPayload = Record<string, unknown>> =
  | CommandMessage<TPayload>
  | EventMessage<TPayload>;

export function commandMessage<TPayload>(
  type: string,
  payload: TPayload,
  options: AppMessageOptions = {},
): CommandMessage<TPayload> {
  return { kind: 'command', type: messageId(type), payload, ...options };
}

export function eventMessage<TPayload>(
  type: string,
  payload: TPayload,
  options: AppMessageOptions = {},
): EventMessage<TPayload> {
  return { kind: 'event', type: messageId(type), payload, ...options };
}

/** Encode a kind-preserving domain message into the existing MVI transport. */
export function appMessageToEvent<TPayload>(message: AppMessage<TPayload>): AppEvent<TPayload> {
  const id = messageId(message.type);
  return {
    type: `${message.kind}://#${id}`,
    payload: message.payload,
    message: {
      kind: message.kind,
      id,
      ...(message.payloadDef ? { payloadDef: message.payloadDef } : {}),
      ...(message.policy ? { policy: message.policy } : {}),
    },
  };
}

/** Decode only canonical kind-preserving transport events. */
export function appEventToMessage<TPayload>(event: AppEvent<TPayload>): AppMessage<TPayload> | undefined {
  const match = /^(command|event):\/\/#([^/]+)$/.exec(event.type);
  if (!match) return undefined;
  const kind = match[1] as AppMessageKind;
  const id = match[2];
  if (event.message && !matchesTransportIdentity(event.message, kind, id)) return undefined;
  return {
    kind,
    type: id,
    payload: event.payload,
    ...(event.message?.payloadDef ? { payloadDef: event.message.payloadDef } : {}),
    ...(event.message?.policy ? { policy: event.message.policy } : {}),
  };
}

export function appEventMessageKind(event: AppEvent): AppMessageKind | undefined {
  return appEventToMessage(event)?.kind;
}

function messageId(value: string): string {
  const hash = value.indexOf('#');
  return hash >= 0 ? value.slice(hash + 1).split('/')[0] : value;
}

function matchesTransportIdentity(
  descriptor: AppMessageDescriptor,
  kind: AppMessageKind,
  id: string,
): boolean {
  return descriptor.kind === kind && descriptor.id === id;
}
