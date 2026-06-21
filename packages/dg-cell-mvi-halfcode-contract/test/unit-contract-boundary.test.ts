import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  HALFCODE_REF_UNRESOLVED,
  asHalfcodeRef,
  validatePageContract,
  validateComponentContract,
  validateUnitElementContract,
  validateWireSpec,
  type RequiresSpec,
  type ElementsSpec,
  type UnitInstanceElement,
  type WireSpec,
} from '../src';

const validPageContract = {
  kind: 'page-contract',
  fqn: 'dg.admin.basic.UsersPage',
  urlInputs: {
    query: { keyword: 'string?' },
  },
  accepts: [{ ref: 'command://#users.refresh' }],
  sends: [{ ref: 'event://#users.selected' }],
  elementContracts: [
    {
      id: 'users-filter',
      requires: {
        commands: ['command://#users.search'],
        effects: ['scope-effect://#users.query'],
        config: ['config://#users-filter'],
      },
      sends: [{ ref: 'command://#users.search' }],
    },
  ],
};

describe('PageContract boundary (D2)', () => {
  it('accepts a URL-shaped page contract', () => {
    expect(validatePageContract(validPageContract)).toEqual({ ok: true, issues: [] });
  });

  it('rejects a PageContract that declares props', () => {
    const result = validatePageContract({
      ...validPageContract,
      props: { pageSize: 'number?' },
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: '$.props' })]),
    );
  });

  it('rejects slots and exposes on a PageContract', () => {
    const result = validatePageContract({
      ...validPageContract,
      slots: [{ id: 'toolbar' }],
      exposes: { selectedRowIds: 'string[]' },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['$.slots', '$.exposes']),
    );
  });

  it('rejects urlInputs sections other than path/query/hash', () => {
    const result = validatePageContract({
      ...validPageContract,
      urlInputs: { body: { payload: 'string' } },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === '$.urlInputs.body')).toBe(true);
  });
});

describe('frontend contract input/output red line (v2 carry-over)', () => {
  it('rejects ElementContract input and output fields', () => {
    const result = validateUnitElementContract({
      id: 'users-filter',
      input: 'runtime-input',
      output: 'runtime-output',
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.input' }),
        expect.objectContaining({ path: '$.output' }),
      ]),
    );
  });

  it('rejects input/output on component contracts too', () => {
    const result = validateComponentContract({
      kind: 'component-contract',
      fqn: 'dg.materials.CrudTable',
      props: { pageSize: 'number?' },
      input: 'runtime-input',
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === '$.input')).toBe(true);
  });

  it('accepts a full component contract (props/slots/accepts/sends/exposes)', () => {
    const result = validateComponentContract({
      kind: 'component-contract',
      fqn: 'dg.materials.CrudTable',
      props: { pageSize: 'number?', entity: 'string?' },
      slots: [{ id: 'toolbar' }],
      accepts: [{ ref: 'command://#table.refresh' }],
      sends: [{ ref: 'event://#table.rowSelected' }],
      exposes: { selectedRowIds: 'string[]' },
    });
    expect(result).toEqual({ ok: true, issues: [] });
  });
});

describe('RequiresSpec shape (D14)', () => {
  it('accepts the three-part host expectation structure', () => {
    const requires: RequiresSpec = {
      commands: [asHalfcodeRef('command://#users.search')],
      effects: [asHalfcodeRef('scope-effect://#users.query')],
      config: [asHalfcodeRef('config://#users-filter')],
    };
    const result = validateUnitElementContract({
      id: 'users-filter',
      requires,
      sends: [{ ref: 'command://#users.search' }],
    });
    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('rejects retired state and command requirement sections', () => {
    const result = validateUnitElementContract({
      id: 'users-filter',
      requires: {
        state: ['state://#users-page/query'],
        obsoleteCommands: [],
        config: [],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['$.requires.state', '$.requires.obsoleteCommands']),
    );
  });

  it('rejects unparseable refs in requires.commands/config', () => {
    const result = validateUnitElementContract({
      id: 'users-filter',
      requires: {
        commands: ['commands:users.search'],
        effects: [],
        config: [],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.requires.commands[0]', code: HALFCODE_REF_UNRESOLVED }),
      ]),
    );
  });
});

describe('function values are rejected everywhere (canonical red line)', () => {
  it('rejects functions inside page contract values', () => {
    const result = validatePageContract({
      ...validPageContract,
      metadata: { onLoad: () => undefined },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('Functions'))).toBe(true);
  });

  it('rejects executable escape fields', () => {
    const result = validateComponentContract({
      kind: 'component-contract',
      fqn: 'dg.materials.CrudTable',
      metadata: { componentConstructor: 'runtime' },
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes('componentConstructor'))).toBe(true);
  });
});

describe('WireSpec addresses route instances (D13)', () => {
  const validWire = {
    from: 'route://#report-detail-route',
    to: 'route://#users-route',
    message: 'event://#report.saved',
  } satisfies Record<keyof WireSpec, string>;

  it('accepts route:// endpoints in id or path form', () => {
    expect(validateWireSpec(validWire)).toEqual({ ok: true, issues: [] });
    expect(validateWireSpec({ ...validWire, to: 'route://users' })).toEqual({ ok: true, issues: [] });
  });

  it('rejects non-route:// endpoints (page FQNs are not wire targets)', () => {
    const result = validateWireSpec({ ...validWire, from: 'page://dg.admin.basic.ReportDetailPage' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === '$.from')).toBe(true);
  });

  it('rejects unparseable endpoints with HALFCODE_REF_UNRESOLVED', () => {
    const result = validateWireSpec({ ...validWire, to: 'users-route' });
    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '$.to', code: HALFCODE_REF_UNRESOLVED }),
      ]),
    );
  });

  it('requires a Command/Event message ref', () => {
    const result = validateWireSpec({ ...validWire, message: '' });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === '$.message')).toBe(true);
  });
});

describe('v3 element instance shape (D3/D12, type-level)', () => {
  it('separates inlineProps from props/urlInputs/command bindings', () => {
    const element: UnitInstanceElement = {
      kind: 'instance',
      tag: 'dg.materials.CrudTable',
      id: 'users-table',
      inlineProps: { pageSize: 20 },
      props: asHalfcodeRef('config://#users-table'),
      command: asHalfcodeRef('command://#users.refresh'),
      slots: [
        {
          id: 'toolbar',
          children: [
            { kind: 'instance', tag: 'dg.materials.StatusBadge', id: 'selected-badge', inlineProps: { status: 'info' } },
          ],
        },
      ],
    };
    expect('route' in element).toBe(false);
    expect('mount' in element).toBe(false);
    expect(element.inlineProps?.pageSize).toBe(20);
    expect(element.props).toBe('config://#users-table');
    expect(element.command).toBe('command://#users.refresh');
  });

  it('keeps lexical Scope uses only on Elements and Capsule nodes', () => {
    const elements: ElementsSpec = {
      id: 'users-elements',
      scope: { kind: 'ref', ref: asHalfcodeRef('scope://#users-page') },
      children: [
        {
          kind: 'capsule',
          id: 'users-filter',
          scope: {
            kind: 'inline',
            scope: {
              scopeId: 'users-filter',
              config: asHalfcodeRef('config://#users-filter'),
            },
          },
        },
      ],
    };

    expect(elements.scope).toEqual({ kind: 'ref', ref: 'scope://#users-page' });
    expect(elements.children[0]).toMatchObject({
      kind: 'capsule',
      scope: { kind: 'inline', scope: { scopeId: 'users-filter' } },
    });
  });

  it('does not expose retired Ref-suffixed fields from canonical source AST', () => {
    for (const file of ['element.ts', 'routes.ts', 'unit.ts']) {
      const source = fs.readFileSync(path.resolve(__dirname, `../src/unit/${file}`), 'utf8');
      expect(source, file).not.toMatch(/\b(pageRef|permissionRef|propsRef|urlInputsRef|commandRef|scopeRef|contractRef)\??\s*:/);
    }
  });
});
