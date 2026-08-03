import {
  validateXnlProjectionDiagnostics,
  validateXnlProjectionPlan,
  type XnlProjectionDiagnostic,
  type XnlProjectionPlan,
  type XnlProjectionPlanNode,
  type XnlProjectionPresenterInvocationConfig,
  type XnlProjectionPresenterInput,
  type XnlProjectionSerializableRecord,
} from 'dg-cell-mvi-halfcode-contract';
import {
  isStableXnlProjectionId,
  snapshotXnlProjectionPureData,
  snapshotXnlProjectionSerializableRecord,
  snapshotXnlProjectionSerializableValue,
} from './presenterData';
import {
  isXnlProjectionPresenterRegistry,
  type XnlProjectionPresenterRegistry,
  type XnlProjectionPresenterRuntimeFacet,
  type XnlProjectionRegisteredPresenterRuntime,
  type XnlProjectionRegisteredPresenterAdapter,
  type XnlProjectionRegisteredPresenterOutput,
} from './presenterRegistry';
import { resolveOwnedXnlProjectionPresenterFacet } from './presenterCapabilityOwnership';

const EMPTY_PRESENTER_CONFIG = Object.freeze({}) as XnlProjectionSerializableRecord;
const PRESENTER_OUTPUT_KEYS = new Set([
  'surfaceId',
  'value',
  'diagnostics',
  'metadata',
]);

export interface XnlProjectionPresentationRunnerRuntime<
  TRuntime extends object = Record<string, never>,
> {
  readonly presenterRegistry: XnlProjectionPresenterRegistry<TRuntime>;
  readonly presenterRuntime: XnlProjectionPresenterRuntimeFacet<TRuntime>;
}

export interface XnlProjectionPresentationRunnerInput {
  readonly plan: XnlProjectionPlan;
  readonly surfaceState?: XnlProjectionSerializableRecord;
}

export interface XnlProjectionPresentationRunnerConfig {
  readonly surfaceId: string;
}

export type XnlProjectionPresentationResult =
  | Readonly<{
      ok: true;
      surfaceId: string;
      output: XnlProjectionRegisteredPresenterOutput;
      diagnostics: readonly XnlProjectionDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly XnlProjectionDiagnostic[];
    }>;

export async function presentXnlProjection<
  TRuntime extends object = Record<string, never>,
>(
  runtime: XnlProjectionPresentationRunnerRuntime<TRuntime>,
  input: XnlProjectionPresentationRunnerInput,
  config: XnlProjectionPresentationRunnerConfig,
): Promise<XnlProjectionPresentationResult> {
  if (!isXnlProjectionPresenterRegistry<TRuntime>(runtime?.presenterRegistry)) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_RUNTIME',
      'Presentation runtime must contain a registry created by this support capsule.',
    ));
  }
  const presenterFacet = resolveOwnedXnlProjectionPresenterFacet(runtime.presenterRuntime);
  if (presenterFacet === undefined) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_RUNTIME',
      'Presentation runtime must contain an immutable support-owned Presenter runtime facet with matching protocol and facade provenance.',
    ));
  }
  if (!isStableXnlProjectionId(config?.surfaceId)) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_SURFACE_ID',
      'Presentation runner config must contain a stable surface id.',
    ));
  }

  const parsedInput = parsePresentationRunnerInput(input);
  if (!parsedInput.ok) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PRESENTER_INPUT',
      parsedInput.message,
    ));
  }

  const validation = validateXnlProjectionPlan(parsedInput.plan);
  if (!validation.ok) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PLAN',
      `Presentation runner received an invalid ProjectionPlan (${validation.issues.length} validation issues).`,
    ));
  }
  const validatedPlan = parsedInput.plan as XnlProjectionPlan;
  const planSnapshot = snapshotXnlProjectionPureData(
    validatedPlan,
    'projection plan',
  );
  if (!planSnapshot.ok) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_PLAN',
      planSnapshot.message,
    ));
  }
  const surfaceState = parsedInput.surfaceState === undefined
    ? undefined
    : snapshotXnlProjectionSerializableRecord(
      parsedInput.surfaceState,
      'presentation surface state',
    );
  if (surfaceState !== undefined && !surfaceState.ok) {
    return presentationFailure(diagnostic(
      'INVALID_XNL_PROJECTION_SURFACE_STATE',
      surfaceState.message,
    ));
  }

  const presented = await presentNode(
    runtime.presenterRegistry,
    presenterFacet.facade as XnlProjectionRegisteredPresenterRuntime<TRuntime>,
    planSnapshot.value.root,
    surfaceState?.ok ? surfaceState.value : undefined,
    config.surfaceId,
  );
  if (!presented.ok) return presented;

  return Object.freeze({
    ok: true,
    surfaceId: config.surfaceId,
    output: presented.output,
    diagnostics: Object.freeze([
      ...(planSnapshot.value.diagnostics ?? []),
      ...presented.diagnostics,
    ]),
  });
}

function parsePresentationRunnerInput(
  value: unknown,
):
  | Readonly<{
      ok: true;
      plan: unknown;
      surfaceState: unknown;
    }>
  | Readonly<{ ok: false; message: string }> {
  try {
    if (value === null || typeof value !== 'object') {
      return { ok: false, message: 'Presentation runner input must be an object.' };
    }
    const allowedKeys = new Set<PropertyKey>(['plan', 'surfaceState']);
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => !allowedKeys.has(key))) {
      return {
        ok: false,
        message: 'Presentation runner input may contain only plan and surfaceState.',
      };
    }

    const plan = readRunnerInputDataProperty(value, 'plan', true);
    if (!plan.ok) return plan;
    const surfaceState = readRunnerInputDataProperty(value, 'surfaceState', false);
    if (!surfaceState.ok) return surfaceState;
    return {
      ok: true,
      plan: plan.value,
      surfaceState: surfaceState.value,
    };
  } catch (error) {
    return {
      ok: false,
      message: `Presentation runner input could not be inspected safely: ${errorMessage(error)}`,
    };
  }
}

function readRunnerInputDataProperty(
  value: object,
  key: 'plan' | 'surfaceState',
  required: boolean,
): Readonly<{ ok: true; value: unknown }> | Readonly<{ ok: false; message: string }> {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) {
    return required
      ? { ok: false, message: `Presentation runner input requires own data property ${key}.` }
      : { ok: true, value: undefined };
  }
  if (!('value' in descriptor)) {
    return {
      ok: false,
      message: `Presentation runner input ${key} must be an own data property.`,
    };
  }
  return { ok: true, value: descriptor.value };
}

type PresentNodeResult =
  | Readonly<{
      ok: true;
      output: XnlProjectionRegisteredPresenterOutput;
      diagnostics: readonly XnlProjectionDiagnostic[];
    }>
  | Readonly<{
      ok: false;
      diagnostics: readonly XnlProjectionDiagnostic[];
    }>;

async function presentNode<TRuntime extends object>(
  registry: XnlProjectionPresenterRegistry<TRuntime>,
  presenterRuntime: XnlProjectionRegisteredPresenterRuntime<TRuntime>,
  node: XnlProjectionPlanNode,
  surfaceState: XnlProjectionSerializableRecord | undefined,
  surfaceId: string,
): Promise<PresentNodeResult> {
  const childOutputs: XnlProjectionRegisteredPresenterOutput[] = [];
  const diagnostics: XnlProjectionDiagnostic[] = [];
  for (const child of node.children) {
    const childResult = await presentNode(
      registry,
      presenterRuntime,
      child,
      surfaceState,
      surfaceId,
    );
    if (!childResult.ok) {
      return presentationFailure(...diagnostics, ...childResult.diagnostics);
    }
    childOutputs.push(childResult.output);
    diagnostics.push(...childResult.diagnostics);
  }

  const resolution = registry.resolve(node.presenter.id);
  if (!resolution.ok) {
    return presentationFailure(...diagnostics, {
      ...resolution.diagnostic,
      path: node.domain.path,
      planNodeId: node.id,
    });
  }
  if (resolution.adapter.surfaceId !== surfaceId) {
    return presentationFailure(...diagnostics, nodeDiagnostic(
      node,
      'XNL_PROJECTION_PRESENTER_SURFACE_MISMATCH',
      `Presenter "${resolution.id}" targets surface "${resolution.adapter.surfaceId}", not "${surfaceId}".`,
      {
        presenterId: resolution.id,
        adapterSurfaceId: resolution.adapter.surfaceId,
        requestedSurfaceId: surfaceId,
      },
    ));
  }

  const adapterInput: XnlProjectionPresenterInput<XnlProjectionRegisteredPresenterOutput> =
    Object.freeze({
      node,
      childOutputs: Object.freeze(childOutputs),
      ...(surfaceState !== undefined ? { surfaceState } : {}),
    });
  const adapterConfig: XnlProjectionPresenterInvocationConfig<XnlProjectionSerializableRecord> =
    Object.freeze({
      surfaceId,
      options: mergePresenterOptions(
        resolution.adapter.config,
        node.presenter.options,
      ),
    });

  let rawOutput: unknown;
  try {
    rawOutput = await resolution.adapter.present(
      presenterRuntime,
      adapterInput,
      adapterConfig,
    );
  } catch (error) {
    return presentationFailure(...diagnostics, nodeDiagnostic(
      node,
      'XNL_PROJECTION_PRESENTER_FAILED',
      `Presenter "${resolution.id}" failed: ${errorMessage(error)}`,
      { presenterId: resolution.id },
    ));
  }

  const output = snapshotPresenterOutput(
    rawOutput,
    resolution.adapter,
    node,
  );
  if (!output.ok) {
    return presentationFailure(...diagnostics, output.diagnostic);
  }
  return Object.freeze({
    ok: true,
    output: output.value,
    diagnostics: Object.freeze([
      ...diagnostics,
      ...(output.value.diagnostics ?? []),
    ]),
  });
}

function snapshotPresenterOutput<TRuntime extends object>(
  value: unknown,
  adapter: XnlProjectionRegisteredPresenterAdapter<TRuntime>,
  node: XnlProjectionPlanNode,
):
  | Readonly<{ ok: true; value: XnlProjectionRegisteredPresenterOutput }>
  | Readonly<{ ok: false; diagnostic: XnlProjectionDiagnostic }> {
  if (!isPlainRecord(value)) {
    return invalidPresenterOutput(adapter, node, 'Presenter output must be a plain object.');
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !PRESENTER_OUTPUT_KEYS.has(key)) {
      return invalidPresenterOutput(adapter, node, 'Presenter output contains unsupported fields.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor)) {
      return invalidPresenterOutput(adapter, node, `Presenter output field "${String(key)}" must be own data.`);
    }
    if (descriptor.value === undefined) {
      return invalidPresenterOutput(adapter, node, `Presenter output field "${String(key)}" must not be undefined.`);
    }
  }
  if (value.surfaceId !== adapter.surfaceId) {
    return invalidPresenterOutput(
      adapter,
      node,
      `Presenter output surface "${String(value.surfaceId)}" does not match adapter surface "${adapter.surfaceId}".`,
    );
  }

  const surfaceValue = snapshotXnlProjectionSerializableValue(
    value.value,
    `presenter "${adapter.id}" output value`,
  );
  if (!surfaceValue.ok) {
    return invalidPresenterOutput(adapter, node, surfaceValue.message);
  }
  const metadata = value.metadata === undefined
    ? undefined
    : snapshotXnlProjectionSerializableRecord(
      value.metadata,
      `presenter "${adapter.id}" output metadata`,
    );
  if (metadata !== undefined && !metadata.ok) {
    return invalidPresenterOutput(adapter, node, metadata.message);
  }
  const outputDiagnostics = value.diagnostics === undefined
    ? undefined
    : snapshotDiagnostics(value.diagnostics, adapter, node);
  if (outputDiagnostics !== undefined && !outputDiagnostics.ok) {
    return outputDiagnostics;
  }

  return {
    ok: true,
    value: Object.freeze({
      surfaceId: adapter.surfaceId,
      value: surfaceValue.value,
      ...(outputDiagnostics?.ok
        ? { diagnostics: outputDiagnostics.value }
        : {}),
      ...(metadata?.ok ? { metadata: metadata.value } : {}),
    }),
  };
}

function snapshotDiagnostics<TRuntime extends object>(
  value: unknown,
  adapter: XnlProjectionRegisteredPresenterAdapter<TRuntime>,
  node: XnlProjectionPlanNode,
):
  | Readonly<{ ok: true; value: readonly XnlProjectionDiagnostic[] }>
  | Readonly<{ ok: false; diagnostic: XnlProjectionDiagnostic }> {
  const snapshot = snapshotXnlProjectionPureData(
    value,
    `presenter "${adapter.id}" output diagnostics`,
  );
  if (!snapshot.ok || !Array.isArray(snapshot.value)) {
    return invalidPresenterOutput(
      adapter,
      node,
      snapshot.ok
        ? 'Presenter output diagnostics must be an array.'
        : snapshot.message,
    );
  }
  const validation = validateXnlProjectionDiagnostics(snapshot.value);
  if (!validation.ok) {
    return invalidPresenterOutput(
      adapter,
      node,
      `Presenter output diagnostics violate the public contract: ${validation.issues
        .map((issue) => `${issue.path}${issue.code ? ` ${issue.code}` : ''}`)
        .join('; ')}.`,
    );
  }
  return {
    ok: true,
    value: snapshot.value as unknown as readonly XnlProjectionDiagnostic[],
  };
}

function invalidPresenterOutput<TRuntime extends object>(
  adapter: XnlProjectionRegisteredPresenterAdapter<TRuntime>,
  node: XnlProjectionPlanNode,
  message: string,
): Readonly<{ ok: false; diagnostic: XnlProjectionDiagnostic }> {
  return {
    ok: false,
    diagnostic: nodeDiagnostic(
      node,
      'INVALID_XNL_PROJECTION_PRESENTER_OUTPUT',
      message,
      { presenterId: adapter.id },
    ),
  };
}

function presentationFailure(
  ...diagnostics: readonly XnlProjectionDiagnostic[]
): Readonly<{ ok: false; diagnostics: readonly XnlProjectionDiagnostic[] }> {
  return Object.freeze({
    ok: false,
    diagnostics: Object.freeze([...diagnostics]),
  });
}

function nodeDiagnostic(
  node: XnlProjectionPlanNode,
  code: string,
  message: string,
  details?: XnlProjectionSerializableRecord,
): XnlProjectionDiagnostic {
  return Object.freeze({
    severity: 'error',
    code,
    message,
    path: node.domain.path,
    planNodeId: node.id,
    ...(details !== undefined ? { details: Object.freeze(details) } : {}),
  });
}

function diagnostic(
  code: string,
  message: string,
): XnlProjectionDiagnostic {
  return Object.freeze({
    severity: 'error',
    code,
    message,
  });
}

function mergePresenterOptions(
  registrationDefaults: XnlProjectionSerializableRecord | undefined,
  planOptions: XnlProjectionSerializableRecord | undefined,
): XnlProjectionSerializableRecord {
  if (registrationDefaults === undefined && planOptions === undefined) {
    return EMPTY_PRESENTER_CONFIG;
  }
  return Object.freeze({
    ...(registrationDefaults ?? EMPTY_PRESENTER_CONFIG),
    ...(planOptions ?? EMPTY_PRESENTER_CONFIG),
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
