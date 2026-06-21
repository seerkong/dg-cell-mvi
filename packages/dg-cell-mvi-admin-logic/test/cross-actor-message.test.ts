/**
 * admin.shell-state · suite `actors` · case `cross-actor-message` (minimal T1.2 validation).
 *
 * Full effect-loop coordination (login → publish LoggedIn → permission loads → menu re-projects) is
 * wired in P2 (effects). At T1.2 (pure logic, no IO) we validate the case at the *protocol + pure
 * coordination* level the delta permits:
 *
 *   1. the coordination VEHICLE exists and is a *message* (a domain event), distinct from any single
 *      actor's write commands — so cross-actor talk is "经消息", never a cross-store direct call;
 *   2. each actor's store has NO API to read or mutate another actor's fact (no god-store / no direct
 *      read) — the only surface is `dispatch` (write own command) + `state`/`viewModel` (read OWN fact);
 *   3. the end-to-end *fact flow* is reconstructable as a PURE composition with no store touching
 *      another: session fact → (message payload) → permission command → permission fact → projectMenu.
 *      Each hop is mediated by a message/command + a pure function, exactly the design §B shape.
 */
import { describe, it, expect } from 'vitest';

import {
  createSessionStore,
  createPermissionStore,
  reducePermission,
  projectMenu,
} from '../src/index';
import {
  setToken,
  setUserInfo,
  setCodes,
  loggedIn,
  permissionLoaded,
  DOMAIN_MESSAGE,
  SESSION_EVENT,
  PERMISSION_EVENT,
  createInitialPermissionState,
} from 'dg-cell-mvi-admin-contract';
import type { RouteDescriptor } from 'dg-cell-mvi-admin-contract';

describe('cross-actor coordination is by message, not direct cross-store access', () => {
  it('domain messages are a distinct vehicle from any actor write-command', () => {
    // LoggedIn / PermissionLoaded are `domain.*` — NOT in any actor's `*.set*` command namespace.
    expect(loggedIn({ token: 't', userInfo: null }).type).toBe(DOMAIN_MESSAGE.loggedIn);
    expect(permissionLoaded({ codes: [] }).type).toBe(DOMAIN_MESSAGE.permissionLoaded);
    expect(DOMAIN_MESSAGE.loggedIn.startsWith('domain.')).toBe(true);
    // and a write command is a different namespace entirely
    expect(SESSION_EVENT.setToken.startsWith('session.')).toBe(true);
    expect(PERMISSION_EVENT.setCodes.startsWith('permission.')).toBe(true);
  });

  it('an actor store exposes no cross-actor read/write surface (only dispatch/state of its OWN fact)', () => {
    const session = createSessionStore();
    const permission = createPermissionStore();
    // public surface is dispatch + state + viewModel + dispose (+ eventLog/graph escape hatches).
    // crucially there is NO method to read or set ANOTHER actor's fact.
    expect(typeof session.dispatch).toBe('function');
    expect(typeof permission.dispatch).toBe('function');
    // session has no notion of permission codes, permission has no notion of token — separate atoms.
    expect('codes' in (session.state() as object)).toBe(false);
    expect('token' in (permission.state() as object)).toBe(false);
  });

  it('the login→permission→menu fact flow composes purely with no store reading another', () => {
    const routes: RouteDescriptor[] = [
      { path: '/u', meta: { title: 'U', permission: 'user:view' } },
      { path: '/r', meta: { title: 'R', permission: 'role:view' } },
    ];

    // (1) session actor writes its OWN fact from login commands.
    const session = createSessionStore();
    session.dispatch(setToken('jwt'));
    session.dispatch(setUserInfo({ id: 7 }));

    // (2) login publishes a MESSAGE carrying the session fact (the only thing that crosses the boundary).
    const msg = loggedIn({ token: session.state().token, userInfo: session.state().userInfo });
    expect(msg.payload.token).toBe('jwt');

    // (3) the permission actor reacts by writing ITS OWN fact via a command (P2: the effect handler
    //     for the message dispatches setCodes). We model the pure hop here.
    const codesFromRemote = ['user:view']; // what a P5 load would yield for this user
    const permState = reducePermission(createInitialPermissionState(), setCodes(codesFromRemote)).state;
    expect(permState.codes).toEqual(['user:view']);

    // (4) menu RE-PROJECTS from routes × the permission fact — a pure function, no store read.
    const menu = projectMenu(routes, permState.codes);
    expect(menu.map((m) => m.path)).toEqual(['/u']); // /r filtered (no role:view)

    // permissionLoaded would be the message announcing (3)→(4); assert its shape carries the codes.
    expect(permissionLoaded({ codes: permState.codes }).payload.codes).toEqual(['user:view']);
  });
});
