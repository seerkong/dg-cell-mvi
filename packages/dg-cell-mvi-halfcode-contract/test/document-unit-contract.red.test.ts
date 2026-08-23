import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as contract from '../src';

type ValidationIssue = { path: string; code?: string; message: string };
type ValidationResult = { ok: boolean; issues: ValidationIssue[] };

interface DocumentInstanceRefShape {
  unitInstanceId: string;
  projectionRole: string;
  xId: string;
}

type DocumentContractSurface = typeof contract & {
  FRONTEND_UNIT_KINDS?: readonly string[];
  FLOW_UNIT_KINDS?: readonly string[];
  UNIT_KINDS?: readonly string[];
  validateDocumentContract?: (value: unknown) => ValidationResult;
  parseDocumentInstanceRef?: (value: string) => DocumentInstanceRefShape;
  formatDocumentInstanceRef?: (value: DocumentInstanceRefShape) => string;
};

const documentContract = contract as DocumentContractSurface;
const CONTRACT_SRC = resolve(__dirname, '../src');
const VALID_DOCUMENT_CONTRACT = {
  kind: 'document-contract',
  fqn: 'dg.docs.SystemDesign',
  mode: 'edit',
  source: 'xnl-source-ref',
  revision: 'string?',
  parameters: { locale: 'string?', audience: 'string?' },
  accepts: [{ ref: 'command://#document.refresh' }],
  sends: [{ ref: 'event://#document.changed' }],
  elementContracts: [{ id: 'review-panel' }],
  metadata: { owner: 'architecture' },
};

function allTypeScriptSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return allTypeScriptSources(path);
    return entry.name.endsWith('.ts') ? [readFileSync(path, 'utf8')] : [];
  });
}

describe('Document Unit canonical contract surface', () => {
  it('publishes Document as an independent frontend Unit kind from canonical constants', () => {
    expect(documentContract.FRONTEND_UNIT_KINDS).toEqual(['page', 'component', 'document']);
    expect(documentContract.FLOW_UNIT_KINDS).toEqual([
      'instant-ctrl-flow',
      'work-ctrl-flow',
      'bp-ctrl-flow',
      'eager-data-flow',
      'ai-ctrl-workflow',
      'ai-data-workflow',
    ]);
    expect(documentContract.UNIT_KINDS).toEqual([
      'page',
      'component',
      'document',
      'instant-ctrl-flow',
      'work-ctrl-flow',
      'bp-ctrl-flow',
      'eager-data-flow',
      'ai-ctrl-workflow',
      'ai-data-workflow',
    ]);
  });

  it('registers document:// as a static definition scheme, not unit-instance://', () => {
    expect(contract.HALFCODE_BUILTIN_SCHEMES).toEqual([
      'page',
      'component',
      'document',
      'eager-data-flow',
      'route',
    ]);
    expect(
      contract.HALFCODE_SCHEME_TABLE.find((entry) => entry.scheme === 'document'),
    ).toMatchObject({
      domain: contract.HALFCODE_UNIT_REGISTRY_DOMAIN,
      layers: ['app'],
      builtin: true,
      registryKind: 'document',
    });
    expect(contract.schemeToDomain('document')).toBe(contract.HALFCODE_UNIT_REGISTRY_DOMAIN);
    expect(contract.schemeToDomain('unit-instance')).toBeNull();
  });

  it('accepts source/revision/mode/parameters and message boundaries', () => {
    expect(documentContract.validateDocumentContract).toBeTypeOf('function');
    expect(documentContract.validateDocumentContract?.(VALID_DOCUMENT_CONTRACT)).toEqual({
      ok: true,
      issues: [],
    });
  });

  it('rejects Page/Component-only urlInputs, props, slots, and exposes channels', () => {
    expect(documentContract.validateDocumentContract).toBeTypeOf('function');
    for (const channel of ['urlInputs', 'props', 'slots', 'exposes'] as const) {
      const result = documentContract.validateDocumentContract?.({
        ...VALID_DOCUMENT_CONTRACT,
        [channel]: channel === 'slots' ? [] : {},
      });

      expect(result?.ok).toBe(false);
      expect(result?.issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: `$.${channel}` })]),
      );
    }
  });

  it('fails closed on missing or malformed descriptors, messages, element contracts, and data', () => {
    const missing = documentContract.validateDocumentContract?.({});
    expect(missing?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(['$.kind', '$.fqn', '$.mode']),
    );

    const malformed = documentContract.validateDocumentContract?.({
      ...VALID_DOCUMENT_CONTRACT,
      kind: 'page-contract',
      fqn: 'SystemDesign',
      mode: 'compose',
      source: { kind: 'external' },
      revision: 1,
      parameters: { locale: false },
      accepts: [{ ref: 'page://dg.docs.SystemDesign' }],
      sends: 'event://#document.changed',
      elementContracts: [{ id: 42 }],
      input: {},
      output: {},
      emits: [],
      metadata: { onOpen: () => undefined },
    });

    expect(malformed?.ok).toBe(false);
    expect(malformed?.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        '$.kind',
        '$.fqn',
        '$.mode',
        '$.source',
        '$.revision',
        '$.parameters.locale',
        '$.accepts[0].ref',
        '$.sends',
        '$.elementContracts[0].id',
        '$.input',
        '$.output',
        '$.emits',
        '$.metadata.onOpen',
      ]),
    );
  });

  it('keeps new Document Unit names isolated from legacy HalfcodeDocument', () => {
    expect(contract.validateHalfcodeDocument).toBeTypeOf('function');
    expect(documentContract.validateDocumentContract).not.toBe(contract.validateHalfcodeDocument);

    const source = allTypeScriptSources(resolve(CONTRACT_SRC, 'unit')).join('\n');
    expect(source).not.toMatch(
      /\bHalfcodeDocument(?:UnitManifest|ContractSpec|SourceDescriptor|AddressDescriptor|InstanceRef)\b/,
    );
  });
});

describe('Document Unit instance address protocol', () => {
  const instanceRef: DocumentInstanceRefShape = {
    unitInstanceId: 'system-design-01',
    projectionRole: 'main',
    xId: 'review.panel_2',
  };

  it('formats and parses the canonical three-segment URI as inverse operations', () => {
    expect(documentContract.formatDocumentInstanceRef).toBeTypeOf('function');
    expect(documentContract.parseDocumentInstanceRef).toBeTypeOf('function');

    const uri = documentContract.formatDocumentInstanceRef?.(instanceRef);
    expect(uri).toBe('unit-instance://system-design-01/main/review.panel_2');
    expect(documentContract.parseDocumentInstanceRef?.(uri!)).toEqual(instanceRef);
  });

  it('uses x-id for the runtime target while #id remains tree identity', () => {
    const staticDescriptor = {
      projectionRole: 'main',
      xId: 'heading-editor',
      documentNodeId: 'heading-tree-node',
      scopeId: 'document-root',
    };
    const runtimeRef = {
      unitInstanceId: 'system-design-01',
      projectionRole: staticDescriptor.projectionRole,
      xId: staticDescriptor.xId,
    };

    expect(staticDescriptor).not.toHaveProperty('unitInstanceId');
    expect(documentContract.formatDocumentInstanceRef?.(runtimeRef)).toBe(
      'unit-instance://system-design-01/main/heading-editor',
    );
    expect(documentContract.formatDocumentInstanceRef?.(runtimeRef)).not.toContain(
      staticDescriptor.documentNodeId,
    );
  });

  it('rejects malformed, foreign-scheme, and non-canonical instance addresses', () => {
    expect(documentContract.parseDocumentInstanceRef).toBeTypeOf('function');
    for (const uri of [
      'document://dg.docs.SystemDesign',
      'runtime-instance://#document-runtime',
      'unit-instance://system-design-01/main',
      'unit-instance://system-design-01//heading-editor',
      'unit-instance://system-design-01/main/',
      'unit-instance://system-design-01/main/heading/extra',
      'unit-instance://system design/main/heading-editor',
      'unit-instance://system-design-01/ma in/heading-editor',
      'unit-instance://system-design-01/main/heading editor',
      'unit-instance://system-design-01/main/#heading-editor',
      'unit-instance://system-design-01/main/heading?editor',
    ]) {
      expect(
        () => documentContract.parseDocumentInstanceRef?.(uri),
        uri,
      ).toThrow(contract.HalfcodeUnitContractError);
    }
  });

  it('refuses to format empty or reserved-character instance-ref segments', () => {
    expect(documentContract.formatDocumentInstanceRef).toBeTypeOf('function');
    for (const invalidRef of [
      { ...instanceRef, unitInstanceId: '' },
      { ...instanceRef, unitInstanceId: 'system/design' },
      { ...instanceRef, projectionRole: '' },
      { ...instanceRef, projectionRole: 'main#secondary' },
      { ...instanceRef, xId: '' },
      { ...instanceRef, xId: 'review?panel' },
      { ...instanceRef, xId: 'review panel' },
    ]) {
      expect(
        () => documentContract.formatDocumentInstanceRef?.(invalidRef),
        JSON.stringify(invalidRef),
      ).toThrow(contract.HalfcodeUnitContractError);
    }
  });
});
