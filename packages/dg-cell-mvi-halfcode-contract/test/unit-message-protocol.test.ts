import { describe, expect, it } from 'vitest';
import {
  HALFCODE_MESSAGE_DSL_INVALID,
  asHalfcodeRef,
  validateEventSpec,
  validatePageContract,
  validateWireSpec,
  type CommandSpec,
  type EventSpec,
} from '../src';

describe('canonical Command / Event / Message protocol', () => {
  it('accepts a command request and an event fact without repeating their ids as type fields', () => {
    const command: CommandSpec = {
      id: 'orders.submit',
      handler: asHalfcodeRef('vfs://./orders.commands.ts#submitOrder'),
      config: asHalfcodeRef('config://#order-actions'),
    };
    const event: EventSpec = { id: 'orders.submitted' };

    expect(command.id).toBe('orders.submit');
    expect(validateEventSpec(event)).toEqual({ ok: true, issues: [] });
  });

  it('rejects an event that tries to declare a request handler', () => {
    const result = validateEventSpec({
      id: 'orders.submitted',
      handler: 'vfs://./orders.events.ts#handleSubmitted',
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: '$.handler',
        code: HALFCODE_MESSAGE_DSL_INVALID,
      }),
    ]));
  });

  it('accepts Commands and Events as the only message refs at frontend boundaries', () => {
    const contract = validatePageContract({
      kind: 'page-contract',
      fqn: 'dg.orders.OrdersPage',
      accepts: [{ ref: 'event://#orders.submitted' }],
      sends: [{ ref: 'command://#orders.submit' }],
    });

    expect(contract).toEqual({ ok: true, issues: [] });
  });

  it('validates a wire as an identity-preserving message delivery', () => {
    expect(validateWireSpec({
      from: 'route://#orders-route',
      message: 'event://#orders.submitted',
      to: 'route://#home-route',
    })).toEqual({ ok: true, issues: [] });
  });
});
