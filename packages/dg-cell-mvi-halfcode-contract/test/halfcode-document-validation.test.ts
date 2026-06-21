import { describe, expect, it } from 'vitest';
import { validateHalfcodeDocument, type HalfcodeDocument } from '../src';

const validDocument = {
  kind: 'HalfcodeDocument',
  apiVersion: 'halfcode.dg-cell-mvi/v1',
  product: {
    id: 'product.admin',
    version: '1.0.0',
    name: 'Admin',
  },
  modules: [
    {
      id: 'module.users',
      version: '1.0.0',
      materialRefs: [{ id: 'view.users', version: '1.0.0' }],
    },
  ],
  materials: [
    {
      kind: 'view',
      id: 'view.users',
      version: '1.0.0',
      root: {
        id: 'root',
        component: { kind: 'component-ref', ref: 'admin.UserList' },
        props: {
          title: 'Users',
          items: { kind: 'binding', path: 'users.items' },
        },
      },
    },
  ],
} satisfies HalfcodeDocument;

describe('HalfcodeDocument validation', () => {
  it('accepts serializable canonical documents', () => {
    expect(validateHalfcodeDocument(validDocument)).toEqual({ ok: true, issues: [] });
  });

  it('rejects functions inside canonical document values', () => {
    const result = validateHalfcodeDocument({
      ...validDocument,
      product: {
        ...validDocument.product,
        metadata: {
          onLoad: () => undefined,
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes('Functions'))).toBe(true);
  });

  it('rejects direct fetch fields', () => {
    const result = validateHalfcodeDocument({
      ...validDocument,
      resources: [
        {
          id: 'resource.users',
          version: '1.0.0',
          kind: 'http-resource',
          fetch: 'direct',
          operations: [],
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path.endsWith('.fetch'))).toBe(true);
  });

  it('rejects component constructors', () => {
    class Component {}

    const result = validateHalfcodeDocument({
      ...validDocument,
      materials: [
        {
          ...validDocument.materials[0],
          root: {
            ...validDocument.materials[0].root,
            componentConstructor: Component,
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path.includes('componentConstructor'))).toBe(true);
  });

  it('rejects unknown top-level escape fields', () => {
    const result = validateHalfcodeDocument({
      ...validDocument,
      runtimeEscape: {
        anything: true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === '$.runtimeEscape')).toBe(true);
  });

  it('accepts v2 ElementTree documents with Scope and frontend ElementContract refs', () => {
    const result = validateHalfcodeDocument({
      kind: 'HalfcodeDocument',
      apiVersion: 'halfcode.dg-cell-mvi/v2',
      product: { id: 'product.admin', version: '1.0.0' },
      modules: [],
      materials: [],
      elementTree: {
        root: 'users-page',
        elements: [{
          kind: 'page',
          id: 'users-page',
          version: '1.0.0',
          route: '/users',
          scopeRef: 'scopes:users-page',
          contractRef: 'contracts:users-page',
          children: [{
            kind: 'atomic',
            id: 'users-title',
            version: '1.0.0',
            tag: 'h1',
            text: '用户',
          }],
        }],
      },
      scopes: [{ id: 'users-page', version: '1.0.0', configRef: 'config:users-page' }],
      contracts: [{ id: 'users-page', version: '1.0.0', propsDefRef: 'contracts-def:users-page.props' }],
    });

    expect(result).toEqual({ ok: true, issues: [] });
  });

  it('rejects frontend ElementContract input and output fields', () => {
    const result = validateHalfcodeDocument({
      ...validDocument,
      apiVersion: 'halfcode.dg-cell-mvi/v2',
      contracts: [{
        id: 'bad-contract',
        version: '1.0.0',
        input: 'runtime-input',
        output: 'runtime-output',
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.contracts[0].input' }),
      expect.objectContaining({ path: '$.contracts[0].output' }),
    ]));
  });
});
