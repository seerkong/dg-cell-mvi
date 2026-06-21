import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  HALFCODE_BUILTIN_SCHEMES,
  HALFCODE_SCHEME_TABLE,
  asUnitFqn,
  schemeToDomain,
  type FlowUnitKind,
  type HalfcodeFlowSpec,
  type HalfcodeUnitManifest,
  type UnitKind,
} from '../src';

describe('Halfcode canonical Flow unit contract', () => {
  it('registers exactly the four upstream Flow product kinds and manifests', () => {
    expectTypeOf<FlowUnitKind>().toEqualTypeOf<
      'instant-flow' | 'work-flow' | 'biz-process' | 'eager-data-flow'
    >();
    expectTypeOf<UnitKind>().toEqualTypeOf<'page' | 'component' | FlowUnitKind>();

    const manifests: HalfcodeUnitManifest[] = [
      { kind: 'instant-flow', fqn: asUnitFqn('demo.flow.Instant'), version: '1' },
      { kind: 'work-flow', fqn: asUnitFqn('demo.flow.Work'), version: '1' },
      { kind: 'biz-process', fqn: asUnitFqn('demo.flow.Biz'), version: '1' },
      { kind: 'eager-data-flow', fqn: asUnitFqn('demo.flow.Eager'), version: '1' },
    ];

    expect(manifests.map(({ kind }) => kind)).toEqual([
      'instant-flow',
      'work-flow',
      'biz-process',
      'eager-data-flow',
    ]);
  });

  it('retains only the canonical eager-data-flow cross-unit scheme', () => {
    expect(HALFCODE_BUILTIN_SCHEMES).toEqual([
      'page',
      'component',
      'eager-data-flow',
      'route',
    ]);
    expect(
      HALFCODE_SCHEME_TABLE.find((entry) => entry.scheme === 'eager-data-flow')?.registryKind,
    ).toBe('eager-data-flow');
    expect(schemeToDomain('ctrl-flow')).toBeNull();
    expect(schemeToDomain('data-flow')).toBeNull();
  });

  it('re-exports upstream specs without restoring Halfcode-owned Flow semantics', () => {
    expectTypeOf<HalfcodeFlowSpec>().toBeObject();
    const source = readFileSync(resolve(__dirname, '../src/unit/flow.ts'), 'utf8');

    expect(source).toContain("from 'instant-flow-contract'");
    expect(source).toContain("from 'eager-data-flow-contract'");
    expect(source).not.toMatch(
      /\b(CtrlFlowAuthoringPlan|DataFlowAuthoringPlan|FlowCodeNodePlan|DataFlowEdgePlan|CtrlFlowStatementPlan)\b/,
    );
  });
});
