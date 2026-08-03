import { describe, expect, it } from 'vitest';
import { parseXnl, type XnlNode } from 'xnl-core';
import {
  compileXnlProjection,
  createXnlProjectionCompilerRuntime,
  validateXnlProjectionPlan,
  type XnlProjectionPlanNode,
} from 'dg-cell-mvi-halfcode-logic';
import {
  createDefaultXnlProjectionDialect,
  createXnlProjectionRootInput,
  XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS,
  XNL_PROJECTION_DEFAULT_PRESENTER_IDS,
} from '../src';

function rootFrom(source: string): XnlNode {
  const parsed = parseXnl(source);
  const root = parsed.nodes[0];
  if (root === undefined) throw new Error('Expected one XNL root node.');
  return root;
}

function findByPath(node: XnlProjectionPlanNode, path: readonly (string | number)[]): XnlProjectionPlanNode | undefined {
  if (samePath(node.domain.path, path)) return node;
  for (const child of node.children) {
    const found = findByPath(child, path);
    if (found !== undefined) return found;
  }
  return undefined;
}

function requirePath(node: XnlProjectionPlanNode, path: readonly (string | number)[]): XnlProjectionPlanNode {
  const found = findByPath(node, path);
  if (found === undefined) throw new Error(`Missing plan node at ${path.join('/')}`);
  return found;
}

function collectPaths(node: XnlProjectionPlanNode): readonly (readonly (string | number)[])[] {
  return [node.domain.path, ...node.children.flatMap((child) => collectPaths(child))];
}

function collectNodes(node: XnlProjectionPlanNode): readonly XnlProjectionPlanNode[] {
  return [node, ...node.children.flatMap((child) => collectNodes(child))];
}

function findByNodeId(node: XnlProjectionPlanNode, nodeId: string): XnlProjectionPlanNode | undefined {
  if (node.domain.nodeId === nodeId) return node;
  for (const child of node.children) {
    const found = findByNodeId(child, nodeId);
    if (found !== undefined) return found;
  }
  return undefined;
}

function samePath(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}

function compile(node: XnlNode) {
  const runtime = createXnlProjectionCompilerRuntime({
    dialects: [createDefaultXnlProjectionDialect()],
  });
  return compileXnlProjection(runtime, createXnlProjectionRootInput(node, {
    role: 'document',
    sourceRef: 'vfs://./sample.xnl',
  }), { planId: 'sample.projection' });
}

function compileWithRootIdentity(
  node: XnlNode,
  identity: { role?: string; nodeId?: string },
) {
  const runtime = createXnlProjectionCompilerRuntime({
    dialects: [createDefaultXnlProjectionDialect()],
  });
  return compileXnlProjection(runtime, {
    ...createXnlProjectionRootInput(node, {
      ...(identity.role !== undefined ? { role: identity.role } : {}),
      sourceRef: 'vfs://./identity-sample.xnl',
    }),
    ...(identity.nodeId !== undefined ? { nodeId: identity.nodeId } : {}),
  }, { planId: 'identity.projection' });
}

describe('default XNL Projection dialect adapter', () => {
  it('keeps explicit #id as identity/provenance and out of ordinary editable data', () => {
    const plan = compile(rootFrom('<Document #doc-id { title = "Design" } [<Section #intro>]>'));

    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(plan.root.id).toMatch(/^xnlp:/);
    expect(plan.root.domain).toMatchObject({
      path: [],
      nodeId: 'doc-id',
      tag: 'Document',
      sourceKind: 'xnl.data-element',
      role: 'document',
      sourceRef: 'vfs://./sample.xnl',
    });
    expect(plan.root.classification.id).toBe(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.dataElement);
    expect(plan.root.presenter.id).toBe(XNL_PROJECTION_DEFAULT_PRESENTER_IDS.dataElement);
    expect(plan.root.data).toMatchObject({
      kind: 'DataElement',
      tag: 'Document',
      attributes: [{ key: 'title', value: { kind: 'literal.string', value: 'Design' } }],
    });
    expect(JSON.stringify(plan.root.data)).not.toContain('doc-id');
    expect(plan.root.provenance).toMatchObject({
      xnl: { explicitId: { kind: 'Word', namespace: [], name: 'doc-id', value: 'doc-id' } },
    });

    const section = requirePath(plan.root, ['body', 0]);
    expect(section.domain.nodeId).toBe('intro');
    expect(section.domain.path).toEqual(['body', 0]);
    expect(section.domain.sourceRef).toBe('vfs://./sample.xnl');
  });

  it('enumerates body, extend.order, array and record children with structural path segments in stable code-point order', () => {
    const plan = compile(rootFrom(`
      <Root #root [
        <BodyA>
        <BodyB>
      ] (
        <Zed #zed>
        <Alpha #alpha>
      )>
    `));

    expect(plan.root.children.map((child) => child.domain.path)).toEqual([
      ['body', 0],
      ['body', 1],
      ['extend', 'Zed'],
      ['extend', 'Alpha'],
    ]);
    expect(plan.root.children.map((child) => child.domain.role)).toEqual([
      'body',
      'body',
      'extend',
      'extend',
    ]);

    const recordPlan = compile({
      'z': [1, { deep: true }],
      'aa': 'aa',
      'a': { kind: 'Word', namespace: ['dg'], name: 'Cell' },
      'Z': false,
    });
    expect(recordPlan.root.classification.id).toBe(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.record);
    expect(collectPaths(recordPlan.root).slice(1)).toEqual([
      ['Z'],
      ['a'],
      ['aa'],
      ['z'],
      ['z', 0],
      ['z', 1],
      ['z', 1, 'deep'],
    ]);
    expect(collectNodes(recordPlan.root).every((node) => node.domain.sourceRef === 'vfs://./sample.xnl')).toBe(true);
  });

  it('keeps array and record plan data structural-only while children carry content', () => {
    const recordPlan = compile({
      title: 'Design',
      nested: {
        value: 'hidden from parent data',
      },
      items: [1, { deep: true }],
    });

    expect(recordPlan.root.data).toEqual({
      kind: 'record',
      entryCount: 3,
      keys: ['items', 'nested', 'title'],
    });
    expect(JSON.stringify(recordPlan.root.data)).not.toContain('hidden from parent data');
    expect(JSON.stringify(recordPlan.root.data)).not.toContain('literal.string');
    expect(requirePath(recordPlan.root, ['nested', 'value']).data).toEqual({
      kind: 'literal.string',
      value: 'hidden from parent data',
    });

    const arrayNode = requirePath(recordPlan.root, ['items']);
    expect(arrayNode.data).toEqual({ kind: 'array', length: 2 });
    expect(JSON.stringify(arrayNode.data)).not.toContain('deep');
    expect(requirePath(recordPlan.root, ['items', 1, 'deep']).data).toEqual({
      kind: 'literal.boolean',
      value: true,
    });
  });

  it('preserves duplicate plain-record id/tag payload with path-based identity', () => {
    const plan = compile([
      { id: 'same', tag: 'payload' },
      { id: 'same', tag: 'payload' },
    ]);
    const first = requirePath(plan.root, [0]);
    const second = requirePath(plan.root, [1]);

    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(first.domain).toEqual({
      path: [0],
      role: 'array-item',
      sourceKind: 'xnl.record',
      sourceRef: 'vfs://./sample.xnl',
    });
    expect(second.domain).toEqual({
      path: [1],
      role: 'array-item',
      sourceKind: 'xnl.record',
      sourceRef: 'vfs://./sample.xnl',
    });
    expect(first.id).not.toBe(second.id);
    expect(requirePath(plan.root, [0, 'id']).data).toEqual({
      kind: 'literal.string',
      value: 'same',
    });
    expect(requirePath(plan.root, [0, 'tag']).data).toEqual({
      kind: 'literal.string',
      value: 'payload',
    });
    expect(requirePath(plan.root, [1, 'id']).data).toEqual({
      kind: 'literal.string',
      value: 'same',
    });
    expect(requirePath(plan.root, [1, 'tag']).data).toEqual({
      kind: 'literal.string',
      value: 'payload',
    });
  });

  it('encodes path-based plan ids injectively across delimiters, segment types, and edge strings', () => {
    const recordPlan = compile({
      a: { b: 2 },
      'a.b': 6,
      'a/b': 1,
      '': 3,
      ':': 4,
      '😀': 5,
    });

    expect(validateXnlProjectionPlan(recordPlan)).toEqual({ ok: true, issues: [] });
    expect(requirePath(recordPlan.root, ['a', 'b']).id)
      .not.toBe(requirePath(recordPlan.root, ['a/b']).id);
    expect(requirePath(recordPlan.root, ['a', 'b']).id)
      .not.toBe(requirePath(recordPlan.root, ['a.b']).id);
    const ids = collectNodes(recordPlan.root).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(collectNodes(compile({
      a: { b: 2 },
      'a.b': 6,
      'a/b': 1,
      '': 3,
      ':': 4,
      '😀': 5,
    }).root).map((node) => node.id)).toEqual(ids);

    const numericIdentity = requirePath(compile([1]).root, [0]).id.split(':').slice(1).join(':');
    const stringIdentity = requirePath(compile({ 0: 1 }).root, ['0']).id.split(':').slice(1).join(':');
    expect(numericIdentity).not.toBe(stringIdentity);
  });

  it('keeps explicit node identity independent from path and role while framing identity kinds', () => {
    const roleDelimiterLeft = compileWithRootIdentity('value', {
      role: 'a:b',
      nodeId: 'c',
    }).root.id;
    const roleDelimiterRight = compileWithRootIdentity('value', {
      role: 'a',
      nodeId: 'b:c',
    }).root.id;
    expect(roleDelimiterLeft).not.toBe(roleDelimiterRight);

    const absentRole = compileWithRootIdentity('value', {
      nodeId: 'same',
    }).root.id;
    const explicitDefaultRole = compileWithRootIdentity('value', {
      role: 'xnl',
      nodeId: 'same',
    }).root.id;
    expect(absentRole).toBe(explicitDefaultRole);

    const pathIdentity = requirePath(compile({ a: 1 }).root, ['a']).id;
    const nodeIdentity = compileWithRootIdentity('value', {
      role: 'record-entry',
      nodeId: 'pp1-s1-0061',
    }).root.id;
    expect(pathIdentity).not.toBe(nodeIdentity);
  });

  it('retains explicit #id plan identity across a move and rejects duplicate explicit ids', () => {
    const beforeMove = compile(rootFrom(`
      <Root #root [
        <Moved #stable-id>
      ]>
    `));
    const afterMove = compile(rootFrom(`
      <Root #root (
        <Moved #stable-id>
      )>
    `));
    const beforeNode = findByNodeId(beforeMove.root, 'stable-id');
    const afterNode = findByNodeId(afterMove.root, 'stable-id');

    expect(beforeNode?.domain.path).toEqual(['body', 0]);
    expect(beforeNode?.domain.role).toBe('body');
    expect(afterNode?.domain.path).toEqual(['extend', 'Moved']);
    expect(afterNode?.domain.role).toBe('extend');
    expect(beforeNode?.id).toBe(afterNode?.id);

    expect(() => compile(rootFrom(`
      <Root #root [
        <BodyCopy #duplicate-id>
      ] (
        <ExtendCopy #duplicate-id>
      )>
    `))).toThrow(/DUPLICATE_PLAN_NODE_ID/);
  });

  it('classifies every public XNL node family and records serializable element data', () => {
    const plan = compile({
      kind: 'DataElement',
      tag: 'Doc',
      metadata: {},
      attributes: {
        word: { kind: 'Word', namespace: ['dg'], name: 'Cell' },
        list: [1, false, null],
        rec: { nested: 'yes' },
      },
      body: [
        { kind: 'Comment', value: 'comment value' },
        { kind: 'TextElement', tag: 'Text', metadata: {}, text: 'Hello', textMarker: 'm' },
      ],
    });

    const comment = requirePath(plan.root, ['body', 0]);
    const text = requirePath(plan.root, ['body', 1]);
    expect(comment.classification.id).toBe(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.comment);
    expect(comment.data).toMatchObject({ kind: 'Comment', value: 'comment value' });
    expect(text.classification.id).toBe(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.textElement);
    expect(text.data).toMatchObject({ kind: 'TextElement', tag: 'Text', text: 'Hello', textMarker: 'm' });

    const attrs = plan.root.data as { attributes: Array<{ key: string; value: unknown }> };
    expect(attrs.attributes).toEqual([
      { key: 'list', value: { kind: 'array', length: 3, items: [
        { kind: 'literal.number', value: 1 },
        { kind: 'literal.boolean', value: false },
        { kind: 'literal.null', value: null },
      ] } },
      { key: 'rec', value: { kind: 'record', entries: [{ key: 'nested', value: { kind: 'literal.string', value: 'yes' } }] } },
      { key: 'word', value: { kind: 'Word', namespace: ['dg'], name: 'Cell', value: 'dg.Cell' } },
    ]);
  });

  it('does not mutate the XNL input while compiling', () => {
    const input = rootFrom('<Root #root { writer = "domain-data" } [<Child>]>');
    const before = JSON.stringify(input);

    const plan = compile(input);

    expect(JSON.stringify(input)).toBe(before);
    expect(validateXnlProjectionPlan(plan)).toEqual({ ok: true, issues: [] });
    expect(JSON.stringify(plan.root.data)).toContain('writer');
  });

  it('emits explicit diagnostics for unknown kind-bearing records', () => {
    const plan = compile({ kind: 'UnexpectedNode', value: 1 } as unknown as XnlNode);

    expect(plan.root.classification.id).toBe(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.unknown);
    expect(plan.root.diagnostics?.filter((diagnostic) => diagnostic.code === 'UNKNOWN_XNL_NODE_KIND')).toHaveLength(1);
    expect(plan.diagnostics?.filter((diagnostic) => diagnostic.code === 'UNKNOWN_XNL_NODE_KIND')).toHaveLength(1);
  });

  it('allows classification and default presenter ids to be overridden without implementation objects', () => {
    const runtime = createXnlProjectionCompilerRuntime({
      dialects: [createDefaultXnlProjectionDialect({
        classifications: { dataElement: 'business.document-node' },
        presenters: { dataElement: 'business.presenter.document-card' },
      })],
    });

    const plan = compileXnlProjection(runtime, createXnlProjectionRootInput(rootFrom('<Doc>')));

    expect(plan.root.classification.id).toBe('business.document-node');
    expect(plan.root.presenter.id).toBe('business.presenter.document-card');
  });

  it('keeps every generated default processor observably three-argument', () => {
    const dialect = createDefaultXnlProjectionDialect();

    expect(dialect.children).toHaveLength(3);
    expect(dialect.classify).toHaveLength(3);
    for (const transformer of Object.values(dialect.transformers)) {
      expect(transformer).toHaveLength(3);
    }
  });

  it('exports frozen readonly default maps whose mutation cannot affect later dialects', () => {
    const classificationId = XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.dataElement;
    const presenterId = XNL_PROJECTION_DEFAULT_PRESENTER_IDS.dataElement;

    expect(Object.isFrozen(XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS)).toBe(true);
    expect(Object.isFrozen(XNL_PROJECTION_DEFAULT_PRESENTER_IDS)).toBe(true);
    expect(Reflect.set(
      XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS,
      'dataElement',
      'mutated.classification',
    )).toBe(false);
    expect(Reflect.set(
      XNL_PROJECTION_DEFAULT_PRESENTER_IDS,
      'dataElement',
      'mutated.presenter',
    )).toBe(false);

    const plan = compile(rootFrom('<Document>'));
    expect(plan.root.classification.id).toBe(classificationId);
    expect(plan.root.presenter.id).toBe(presenterId);
  });

  it('does not share default presenter refs between compiled plans and runtime bindings', () => {
    const runtime = createXnlProjectionCompilerRuntime({
      dialects: [createDefaultXnlProjectionDialect()],
    });
    const input = createXnlProjectionRootInput(rootFrom('<Document #doc>'), {
      role: 'document',
    });
    const first = compileXnlProjection(runtime, input);

    first.root.presenter.id = 'consumer.mutated';
    const second = compileXnlProjection(runtime, input);

    expect(second.root.presenter.id).toBe(
      XNL_PROJECTION_DEFAULT_PRESENTER_IDS.dataElement,
    );
    expect(second.root.presenter).not.toBe(first.root.presenter);
  });
});

if (false) {
  // @ts-expect-error exported defaults are readonly.
  XNL_PROJECTION_DEFAULT_CLASSIFICATION_IDS.dataElement = 'mutated.classification';
  // @ts-expect-error exported defaults are readonly.
  XNL_PROJECTION_DEFAULT_PRESENTER_IDS.dataElement = 'mutated.presenter';
}
