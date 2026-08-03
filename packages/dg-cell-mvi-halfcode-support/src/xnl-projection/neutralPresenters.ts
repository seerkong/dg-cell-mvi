import type {
  XnlProjectionSerializableRecord,
  XnlProjectionSerializableValue,
} from 'dg-cell-mvi-halfcode-contract';
import {
  isStableXnlProjectionId,
  snapshotXnlProjectionSerializableRecord,
} from './presenterData';
import type {
  XnlProjectionPresenterRegistryRuntime,
  XnlProjectionRegisteredPresenterAdapter,
} from './presenterRegistry';

export const XNL_PROJECTION_OUTLINE_SURFACE_ID =
  'xnl-projection.surface.outline';
export const XNL_PROJECTION_INSPECTION_SURFACE_ID =
  'xnl-projection.surface.inspection';

export interface CreateXnlProjectionNeutralPresenterAdapterInput {
  readonly id: string;
}

export type CreateXnlProjectionNeutralPresenterAdapterConfig =
  XnlProjectionSerializableRecord;

export function createXnlProjectionOutlinePresenterAdapter(
  _runtime: XnlProjectionPresenterRegistryRuntime,
  input: CreateXnlProjectionNeutralPresenterAdapterInput,
  config: CreateXnlProjectionNeutralPresenterAdapterConfig,
): XnlProjectionRegisteredPresenterAdapter {
  return createNeutralAdapter(
    input,
    config,
    XNL_PROJECTION_OUTLINE_SURFACE_ID,
    (_runtime, presenterInput, _config) => ({
      surfaceId: XNL_PROJECTION_OUTLINE_SURFACE_ID,
      value: {
        kind: 'xnl-projection.outline-node',
        planNodeId: presenterInput.node.id,
        label: presenterInput.node.domain.tag
          ?? presenterInput.node.domain.nodeId
          ?? presenterInput.node.classification.id,
        children: presenterInput.childOutputs.map((child) => child.value),
      },
    }),
  );
}

export function createXnlProjectionInspectionPresenterAdapter(
  _runtime: XnlProjectionPresenterRegistryRuntime,
  input: CreateXnlProjectionNeutralPresenterAdapterInput,
  config: CreateXnlProjectionNeutralPresenterAdapterConfig,
): XnlProjectionRegisteredPresenterAdapter {
  return createNeutralAdapter(
    input,
    config,
    XNL_PROJECTION_INSPECTION_SURFACE_ID,
    (_runtime, presenterInput, _config) => ({
      surfaceId: XNL_PROJECTION_INSPECTION_SURFACE_ID,
      value: {
        kind: 'xnl-projection.inspection-node',
        planNodeId: presenterInput.node.id,
        domain: copyDefined({
          path: [...presenterInput.node.domain.path],
          nodeId: presenterInput.node.domain.nodeId,
          tag: presenterInput.node.domain.tag,
          sourceKind: presenterInput.node.domain.sourceKind,
          role: presenterInput.node.domain.role,
          sourceRef: presenterInput.node.domain.sourceRef,
        }),
        classification: {
          id: presenterInput.node.classification.id,
          traits: [...(presenterInput.node.classification.traits ?? [])],
        },
        presenter: copyDefined({
          id: presenterInput.node.presenter.id,
          options: presenterInput.node.presenter.options,
        }),
        childCount: presenterInput.childOutputs.length,
        children: presenterInput.childOutputs.map((child) => child.value),
      },
    }),
  );
}

function createNeutralAdapter(
  input: CreateXnlProjectionNeutralPresenterAdapterInput,
  config: CreateXnlProjectionNeutralPresenterAdapterConfig,
  surfaceId: string,
  present: XnlProjectionRegisteredPresenterAdapter['present'],
): XnlProjectionRegisteredPresenterAdapter {
  if (!isStableXnlProjectionId(input?.id)) {
    throw new Error('Neutral presenter adapter requires a stable presenter id.');
  }
  const configSnapshot = snapshotXnlProjectionSerializableRecord(
    config,
    `neutral presenter "${input.id}" config`,
  );
  if (!configSnapshot.ok) throw new Error(configSnapshot.message);
  return Object.freeze({
    id: input.id,
    surfaceId,
    present,
    config: configSnapshot.value,
  });
}

function copyDefined(
  value: Record<string, XnlProjectionSerializableValue | undefined>,
): XnlProjectionSerializableRecord {
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, XnlProjectionSerializableValue] =>
      entry[1] !== undefined),
  );
}
