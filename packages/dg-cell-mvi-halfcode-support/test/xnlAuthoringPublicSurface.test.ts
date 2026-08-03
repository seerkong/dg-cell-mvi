import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as support from '../src';

const CONTRACT_AUTHORING_SRC = resolve(__dirname, '../../dg-cell-mvi-halfcode-contract/src/xnl-authoring');
const LOGIC_AUTHORING_SRC = resolve(__dirname, '../../dg-cell-mvi-halfcode-logic/src/xnl-authoring');
const SUPPORT_AUTHORING_SRC = resolve(__dirname, '../src/xnl-authoring');
const DOCUMENT_RUNTIME_ASSEMBLY_SRC = resolve(__dirname, '../src/documentRuntimeAssembly.ts');
const DOCUMENT_CONTRACT_SRC = resolve(
  __dirname,
  '../../dg-cell-mvi-halfcode-contract/src/unit/document.ts',
);
const CONTRACT_PACKAGE = resolve(__dirname, '../../dg-cell-mvi-halfcode-contract/package.json');
const LOGIC_PACKAGE = resolve(__dirname, '../../dg-cell-mvi-halfcode-logic/package.json');
const SUPPORT_PACKAGE = resolve(__dirname, '../package.json');

function sourceFiles(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : extname(path) === '.ts'
        ? [path]
        : [];
  });
}

function readSources(root: string): string {
  return sourceFiles(root)
    .map((file) => `// ${relative(root, file)}\n${readFileSync(file, 'utf8')}`)
    .join('\n');
}

function packageJson(path: string): {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('xnl authoring public authority surface', () => {
  it('exports host factory and Scope facet constructors without a global session registry', () => {
    expect(support.createXnlAuthoringSessionFactory).toBeTypeOf('function');
    expect(support.createXnlAuthoringEditScopeFacet).toBeTypeOf('function');
    expect(support.createXnlAuthoringViewScopeFacet).toBeTypeOf('function');

    const viewScope = support.createXnlAuthoringViewScopeFacet();
    expect(Object.keys(viewScope)).toEqual(['mode']);
    expect(viewScope).toEqual({ mode: 'view' });
    expect(viewScope).not.toHaveProperty('proposal');
    expect(viewScope).not.toHaveProperty('submit');

    const supportSource = readSources(SUPPORT_AUTHORING_SRC);
    expect(supportSource).not.toMatch(/^\s*(?:const|let|var)\s+\w*(?:session|registry|authority)\w*\s*=\s*new\s+(?:Map|WeakMap|Set)\b/mi);
    expect(supportSource).not.toMatch(/\bglobalThis\.(?:session|registry|authority|document|window)\b/);

    const documentAssemblySource = readFileSync(DOCUMENT_RUNTIME_ASSEMBLY_SRC, 'utf8');
    expect(documentAssemblySource).not.toMatch(
      /^(?:const|let|var)\s+\w*(?:session|writer|authoring)\w*\s*=\s*new\s+(?:Map|WeakMap|Set)\b/m,
    );
    expect(documentAssemblySource).not.toMatch(
      /\bglobalThis\.(?:session|registry|authority|document|window)\b/,
    );

    const documentContractSource = readFileSync(DOCUMENT_CONTRACT_SRC, 'utf8');
    expect(documentContractSource).toMatch(
      /export type DocumentRuntimeConfig = Readonly<Record<string, never>>/,
    );
    const planStart = documentContractSource.indexOf('export interface DocumentUnitPlan');
    const planEnd = documentContractSource.indexOf(
      'export interface DocumentRuntimeDiagnostic',
      planStart,
    );
    expect(documentContractSource.slice(planStart, planEnd)).not.toMatch(/documentAuthoring|factory|control/);
  });

  it('isolates trusted proposal implementations behind an exact getter-safe frozen Scope facade', () => {
    const proposal = Object.freeze({
      state: () => ({ kind: 'xnl-authoring-session-state' }),
      subscribe: () => () => undefined,
      submit: () => Promise.resolve({ status: 'unchanged' }),
    });
    const plainFacet = support.createXnlAuthoringEditScopeFacet(proposal as never);
    expect(plainFacet.mode).toBe('edit');
    expect(plainFacet.proposal).not.toBe(proposal);
    expect(plainFacet.proposal.state()).toEqual({ kind: 'xnl-authoring-session-state' });
    expect(Object.keys(plainFacet.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);

    const mutableProposal = {
      state: proposal.state,
      subscribe: proposal.subscribe,
      submit: proposal.submit,
    };
    const isolated = support.createXnlAuthoringEditScopeFacet(mutableProposal as never);
    mutableProposal.submit = (() => Promise.reject(new Error('replaced'))) as never;
    Object.assign(mutableProposal, { control: { dispose: () => undefined } });
    expect(Object.isFrozen(isolated)).toBe(true);
    expect(Object.isFrozen(isolated.proposal)).toBe(true);
    expect(isolated.proposal).not.toBe(mutableProposal);
    expect(Object.keys(isolated.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);
    expect(isolated.proposal.submit).not.toBe(proposal.submit);
    expect(isolated.proposal).not.toHaveProperty('control');

    let getterCalls = 0;
    const accessorProposal = {
      subscribe: proposal.subscribe,
      submit: proposal.submit,
    } as Record<string, unknown>;
    Object.defineProperty(accessorProposal, 'state', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return proposal.state;
      },
    });
    const inheritedProposal = Object.create(proposal) as Record<string, unknown>;
    const inheritedFacet = support.createXnlAuthoringEditScopeFacet(inheritedProposal as never);
    expect(inheritedFacet.proposal.state()).toEqual({ kind: 'xnl-authoring-session-state' });
    expect(Object.keys(inheritedFacet.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);

    for (const trustedWithInternalFields of [
      { ...proposal, control: { dispose: () => undefined } },
      { ...proposal, writer: { write: () => undefined } },
      { ...proposal, persistence: { persist: () => Promise.resolve() } },
    ]) {
      const facet = support.createXnlAuthoringEditScopeFacet(trustedWithInternalFields as never);
      expect(Object.keys(facet.proposal).sort()).toEqual(['state', 'submit', 'subscribe']);
      expect(facet.proposal).not.toHaveProperty('control');
      expect(facet.proposal).not.toHaveProperty('writer');
      expect(facet.proposal).not.toHaveProperty('persistence');
    }

    for (const invalid of [
      { state: proposal.state, subscribe: proposal.subscribe },
      accessorProposal,
    ]) {
      expect(() => support.createXnlAuthoringEditScopeFacet(invalid as never))
        .toThrowError(/^Invalid XNL authoring (?:edit Scope facet|proposal capability):/);
    }
    expect(getterCalls).toBe(0);
  });

  it('keeps package dependencies on the contract <- logic <- support boundary', () => {
    const contractPackage = packageJson(CONTRACT_PACKAGE);
    const logicPackage = packageJson(LOGIC_PACKAGE);
    const supportPackage = packageJson(SUPPORT_PACKAGE);

    expect(contractPackage.dependencies ?? {}).not.toHaveProperty('xnl-core');
    expect(contractPackage.dependencies ?? {}).not.toHaveProperty('xnl-vfs');
    expect(logicPackage.dependencies ?? {}).not.toHaveProperty('xnl-core');
    expect(logicPackage.dependencies ?? {}).not.toHaveProperty('xnl-vfs');
    expect(supportPackage.dependencies ?? {}).toHaveProperty('xnl-core');
    expect(supportPackage.dependencies).toMatchObject({
      'xnl-core': 'workspace:*',
      'xnl-vfs': 'workspace:*',
    });
    expect(supportPackage.dependencies ?? {}).not.toHaveProperty('xnl-vcs');
  });

  it('keeps production authoring code renderer-neutral outside support-only XNL adapters', () => {
    const forbiddenContractLogicImport =
      /(?:from|import\s*\()\s*['"](?:xnl-core|xnl-vfs|xnl-vcs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom)(?:\/[^'"]*)?['"]/;
    const forbiddenRendererRuntime =
      /\b(?:window|globalThis\.document|document\.|querySelector|HTMLElement|NodeView)\b/;
    const forbiddenSupportImport =
      /(?:from|import\s*\()\s*['"](?:xnl-vcs|vue|@vue\/|tiptap|@tiptap\/|prosemirror|@?prosemirror-|react|react-dom)(?:\/[^'"]*)?['"]/;

    for (const root of [CONTRACT_AUTHORING_SRC, LOGIC_AUTHORING_SRC]) {
      const source = readSources(root);
      expect(source, relative(SUPPORT_AUTHORING_SRC, root)).not.toMatch(forbiddenContractLogicImport);
      expect(source, relative(SUPPORT_AUTHORING_SRC, root)).not.toMatch(forbiddenRendererRuntime);
    }

    const supportSource = readSources(SUPPORT_AUTHORING_SRC);
    expect(supportSource).not.toMatch(forbiddenSupportImport);
    expect(supportSource).not.toMatch(forbiddenRendererRuntime);
    const xnlVfsImports = [...supportSource.matchAll(
      /(?:from|import\s*\()\s*['"](xnl-vfs(?:\/[^'"]*)?)['"]/g,
    )].map((match) => match[1]);
    expect(xnlVfsImports.every((specifier) => specifier === 'xnl-vfs/revisioned-persistence')).toBe(true);
  });
});
