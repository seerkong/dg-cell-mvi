import {
  MemoryRevisionedVfsAuthority,
  type RevisionedVfsAuthority,
  type RevisionedVfsSnapshot,
  type VfsRevision,
} from 'xnl-vfs/revisioned-persistence';
import type { DataElementNode } from 'xnl-core';
import {
  createXnlVfsAuthoringPersistencePort,
  type XnlAuthoringPersistencePort,
  type XnlAuthoringRuntime,
} from '../src';

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;
type IsAny<Value> = 0 extends (1 & Value) ? true : false;

declare const snapshot: DataElementNode;
const authority: RevisionedVfsAuthority = new MemoryRevisionedVfsAuthority(snapshot, {
  authorityId: 'authority:type-smoke',
});
const loaded = authority.read();
type AuthoringRuntime = XnlAuthoringRuntime<
  DataElementNode,
  { readonly kind: 'rename' },
  { readonly kind: 'set-title' }
>;
const persistence: XnlAuthoringPersistencePort<DataElementNode, AuthoringRuntime> =
  createXnlVfsAuthoringPersistencePort(authority);

type AuthorityIsTyped = Expect<Equal<IsAny<RevisionedVfsAuthority>, false>>;
type RevisionIsTyped = Expect<Equal<IsAny<VfsRevision>, false>>;
type SnapshotIsTyped = Expect<Equal<IsAny<RevisionedVfsSnapshot>, false>>;

void [authority, loaded, persistence];
void (undefined as unknown as [
  AuthorityIsTyped,
  RevisionIsTyped,
  SnapshotIsTyped,
]);
