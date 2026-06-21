import {
  MakeWord,
  parseXnlSingleNode,
  stringifyLineBlock,
  type DataElementNode,
  type XnlDocument,
  type XnlNode,
} from 'xnl-core';
import {
  asUnitFqn,
  snapshotSerializableValue,
  validateEditorPlan,
  type EditorPlan,
  type SchemaEditorContractRecord,
  type SchemaEditorContractValue,
  type SchemaEditorValidationIssue,
} from 'dg-cell-mvi-halfcode-contract';

export interface LowerEditorPlanInput {
  readonly plan: EditorPlan;
}

export interface LowerEditorPlanConfig {
  readonly target: 'halfcode';
  readonly unitFqn: string;
  readonly scopeId: string;
  readonly valueHostId: string;
  readonly sessionId: string;
  readonly uiLibrary: 'schemaEditor';
}

export interface LoweredEditorPlanSourceBundle {
  readonly manifestUri: string;
  readonly sourceMap: Readonly<Record<string, string>>;
  readonly uiLibrary: 'schemaEditor';
  readonly logicalUnitFqn: string;
  readonly runtimeUnitFqn: string;
}

interface LoweringSnapshot {
  readonly plan: EditorPlan;
  readonly config: LowerEditorPlanConfig;
}

const SOURCE_ROOT = '/schema-editor-runtime';
const SHELL_CONFIG_ID = 'schema-editor-shell';

export function lowerEditorPlan(
  _runtime: unknown,
  input: LowerEditorPlanInput,
  config: LowerEditorPlanConfig,
): LoweredEditorPlanSourceBundle {
  const snapshot = snapshotLoweringInput(input, config);
  const sourceIdentity = deriveSourceIdentity(snapshot.config.unitFqn);
  const sourceMap = Object.freeze({
    [`${sourceIdentity.sourceRoot}/manifest.xnl`]: renderAppManifest(
      sourceIdentity.runtimeUnitFqn,
      sourceIdentity.appBundleId,
    ),
    [`${sourceIdentity.sourceRoot}/editor/manifest.xnl`]: renderPageManifest(
      sourceIdentity.runtimeUnitFqn,
    ),
    [`${sourceIdentity.sourceRoot}/editor/config.xnl`]: renderConfig(snapshot),
    [`${sourceIdentity.sourceRoot}/editor/elements.xnl`]: renderElements(snapshot.config),
    [`${sourceIdentity.sourceRoot}/editor/scopes.xnl`]: renderScopes(snapshot.config.scopeId),
  });
  return Object.freeze({
    manifestUri: sourceIdentity.manifestUri,
    sourceMap,
    uiLibrary: snapshot.config.uiLibrary,
    logicalUnitFqn: snapshot.config.unitFqn,
    runtimeUnitFqn: sourceIdentity.runtimeUnitFqn,
  });
}

function snapshotLoweringInput(
  input: LowerEditorPlanInput,
  config: LowerEditorPlanConfig,
): LoweringSnapshot {
  const issues: SchemaEditorValidationIssue[] = [];
  const inputSnapshot = snapshotSerializableValue(input, '$.input', issues);
  const configSnapshot = snapshotSerializableValue(config, '$.config', issues);
  if (issues.length > 0 || !isRecord(inputSnapshot) || !isRecord(configSnapshot)) {
    throw new Error(formatSnapshotFailure(issues));
  }

  const plan = inputSnapshot.plan;
  const planValidation = validateEditorPlan(plan);
  if (!planValidation.ok) {
    throw new Error(
      `Schema editor lowering requires a valid EditorPlan: ${formatIssues(planValidation.issues)}`,
    );
  }

  const normalizedConfig = readLoweringConfig(configSnapshot);
  return {
    plan: plan as unknown as EditorPlan,
    config: normalizedConfig,
  };
}

function readLoweringConfig(config: SchemaEditorContractRecord): LowerEditorPlanConfig {
  if (config.target !== 'halfcode') {
    throw new Error('Schema editor lowering config target must be "halfcode".');
  }
  return {
    target: 'halfcode',
    unitFqn: readUnitFqn(config),
    scopeId: readXnlIdentifier(config, 'scopeId'),
    valueHostId: readStableString(config, 'valueHostId'),
    sessionId: readStableString(config, 'sessionId'),
    uiLibrary: readSchemaEditorUiLibrary(config),
  };
}

function readUnitFqn(config: SchemaEditorContractRecord): string {
  const value = readNonEmptyString(config, 'unitFqn');
  try {
    asUnitFqn(value);
  } catch {
    throw new Error(
      'Schema editor lowering config unitFqn must be a canonical dot-separated Unit FQN.',
    );
  }
  return value;
}

function readXnlIdentifier(
  config: SchemaEditorContractRecord,
  field: keyof LowerEditorPlanConfig,
): string {
  const value = readNonEmptyString(config, field);
  assertXnlWord(value, false, field);
  return value;
}

function readNonEmptyString(
  config: SchemaEditorContractRecord,
  field: keyof LowerEditorPlanConfig,
): string {
  const value = config[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Schema editor lowering config ${field} must be a non-empty string.`);
  }
  return value;
}

function assertXnlWord(value: string, allowNamespace: boolean, field: string): void {
  try {
    const node = parseXnlSingleNode(`<Identity #${value}>`).node;
    if (
      !isDataElementNode(node)
      || !node.id
      || (!allowNamespace && node.id.namespace.length > 0)
      || [...node.id.namespace, node.id.name].join('.') !== value
    ) {
      throw new Error('identity mismatch');
    }
  } catch {
    throw new Error(
      `Schema editor lowering config ${field} must be a valid XNL ${
        allowNamespace ? 'dotted identifier' : 'identifier'
      }.`,
    );
  }
}

function readSchemaEditorUiLibrary(
  config: SchemaEditorContractRecord,
): LowerEditorPlanConfig['uiLibrary'] {
  if (config.uiLibrary !== 'schemaEditor') {
    throw new Error(
      'Schema editor lowering config uiLibrary must be the canonical "schemaEditor" namespace.',
    );
  }
  return 'schemaEditor';
}

function readStableString(
  config: SchemaEditorContractRecord,
  field: keyof LowerEditorPlanConfig,
  pattern: RegExp = /^[A-Za-z0-9][A-Za-z0-9._:/#-]*$/,
): string {
  const value = config[field];
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`Schema editor lowering config ${field} must be a stable non-empty string.`);
  }
  return value;
}

function deriveSourceIdentity(unitFqn: string): {
  readonly sourceRoot: string;
  readonly manifestUri: string;
  readonly appBundleId: string;
  readonly runtimeUnitFqn: string;
} {
  const unitPath = unitFqn.split('.').map(encodeURIComponent).join('/');
  const sourceRoot = `${SOURCE_ROOT}/${unitPath}`;
  const runtimeUnitFqn = encodeUnitFqnAsXnlWord(unitFqn);
  return {
    sourceRoot,
    manifestUri: `vfs://@${sourceRoot}/`,
    appBundleId: `${runtimeUnitFqn}.SchemaEditorApp`,
    runtimeUnitFqn,
  };
}

function encodeUnitFqnAsXnlWord(unitFqn: string): string {
  return unitFqn
    .split('.')
    .map((segment) => [...segment].map((character) => {
      if (character === '_') return '__';
      if (character === '$') return '_d';
      return character;
    }).join(''))
    .join('.');
}

function renderAppManifest(unitFqn: string, appBundleId: string): string {
  return renderDocument(element(
    'AppBundle',
    appBundleId,
    {
      apiVersion: 'halfcode.dg-cell-mvi/v1',
      version: '1',
    },
    undefined,
    [container('Units', [
      element('Unit', undefined, {
        kind: 'page',
        fqn: unitFqn,
        src: 'vfs://./editor/manifest.xnl',
      }),
    ])],
  ));
}

function renderPageManifest(unitFqn: string): string {
  return renderDocument(element('Page', unitFqn, { version: '1' }));
}

function renderConfig(snapshot: LoweringSnapshot): string {
  return renderDocument(container('Config', [
    element('ConfigEntry', SHELL_CONFIG_ID, {
      plan: snapshot.plan as unknown as XnlNode,
      scopeBridge: {
        valueHostId: snapshot.config.valueHostId,
        sessionId: snapshot.config.sessionId,
      },
      uiLibrary: snapshot.config.uiLibrary,
    }),
  ], 'schema-editor-config'));
}

function renderElements(config: LowerEditorPlanConfig): string {
  return renderDocument(element(
    'Elements',
    'schema-editor-elements',
    {},
    [element('schemaEditor.Editor', SHELL_CONFIG_ID, {
      props: `config://#${SHELL_CONFIG_ID}`,
    })],
    [element('Scope', undefined, { ref: config.scopeId })],
  ));
}

function renderScopes(scopeId: string): string {
  return renderDocument(container('Scopes', [
    element('Scope', scopeId, {
      config: `config://#${SHELL_CONFIG_ID}`,
    }),
  ], 'schema-editor-scopes'));
}

function container(tag: string, body: XnlNode[], id?: string): DataElementNode {
  return element(tag, id, {}, body);
}

function element(
  tag: string,
  id?: string,
  attributes: Record<string, XnlNode> = {},
  body?: XnlNode[],
  domainChildren?: DataElementNode[],
): DataElementNode {
  return {
    kind: 'DataElement',
    tag,
    ...(id ? { id: MakeWord(id) } : {}),
    metadata: {},
    attributes,
    ...(body ? { body } : {}),
    ...(domainChildren
      ? {
          extend: {
            order: domainChildren.map((child) => child.tag),
            children: Object.fromEntries(domainChildren.map((child) => [child.tag, child])),
          },
        }
      : {}),
  };
}

function renderDocument(root: DataElementNode): string {
  const document: XnlDocument = { nodes: [root] };
  return stringifyLineBlock(document);
}

function isRecord(value: SchemaEditorContractValue | undefined): value is SchemaEditorContractRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDataElementNode(value: XnlNode): value is DataElementNode {
  return (
    value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && 'kind' in value
    && value.kind === 'DataElement'
  );
}

function formatSnapshotFailure(issues: readonly SchemaEditorValidationIssue[]): string {
  return issues.length > 0
    ? `Schema editor lowering input is not safe serializable data: ${formatIssues(issues)}`
    : 'Schema editor lowering input must contain plain serializable plan and config records.';
}

function formatIssues(issues: readonly SchemaEditorValidationIssue[]): string {
  return issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
}
