/**
 * Pure dictionary control projection + interaction-to-command translation.
 *
 * This module is deliberately framework/provider agnostic. A Vue/Element control can consume the
 * projected data and dispatch the returned commands, but cannot reach a provider, URL, or cache.
 */
import type { AppEvent } from 'dg-cell-mvi-core';

import type {
  DictBinding,
  DictBindingParam,
  DictSerializableRecord,
  DictSerializableValue,
} from '../../contract/dict';
import {
  hydrateDict,
  invalidateDict,
  loadDict,
  refreshDict,
  searchDict,
  type DictCommandContext,
} from '../../contract/events';
import type { CrudState, DictEntry, DictSlice, DictStatus } from '../../contract/state';
import type { NormalizedCrudOptions } from '../../support/optionsBuild';

export interface DictControlDescriptor {
  dictId: string;
  providerId?: string;
  scope?: string;
  context?: DictSerializableRecord;
  knownByValue?: Record<string, any>;
}

export interface DictControlProjectionOptions extends DictControlDescriptor {
  valueField?: string;
  labelField?: string;
  /** Current control value(s), used only to expose labels already present in knownByValue. */
  selectedValue?: DictSerializableValue | DictSerializableValue[];
  disabled?: boolean;
  dependencies?: string[];
  triggers?: DictBinding['triggers'];
  searchDebounceMs?: number;
}

export interface DictControlBinding
  extends DictEntry,
    Required<Pick<DictControlDescriptor, 'dictId'>> {
  providerId?: string;
  scope: string;
  context: DictSerializableRecord;
  dependencies: string[];
  triggers: NonNullable<DictBinding['triggers']>;
  searchDebounceMs: number;
  status: DictStatus;
  visibleNodes: any[];
  options: any[];
  /**
   * Selected values known only through hydration. Element adapters consume this separate surface to
   * resolve labels without adding the nodes to the dropdown's visible options.
   */
  selectedOptions: any[];
  knownByValue: Record<string, any>;
  /** Compatibility aliases retained for existing CRUD consumers. */
  data: any[];
  dataMap: Record<string, any>;
  loading: boolean;
  error: string | null;
  disabled: boolean;
  accessible: boolean;
  ariaBusy: boolean;
  ariaInvalid: boolean;
}

const EMPTY_NODES: any[] = [];
const EMPTY_MAP: Record<string, any> = {};

export function projectDictControl(
  entry: DictEntry | undefined,
  options: DictControlProjectionOptions,
): DictControlBinding {
  const visibleNodes = entry?.visibleNodes ?? EMPTY_NODES;
  const knownByValue = entry?.knownByValue ?? EMPTY_MAP;
  const valueField = options.valueField ?? 'value';
  const labelField = options.labelField ?? 'label';
  const disabled = options.disabled === true;
  const visibleOptions = visibleNodes.map((node) => ({
    ...node,
    value: node?.[valueField],
    label: String(node?.[labelField] ?? node?.[valueField] ?? ''),
  }));
  const visibleValues = new Set(visibleOptions.map((option) => String(option.value)));
  const selectedValues =
    options.selectedValue === undefined
      ? []
      : Array.isArray(options.selectedValue)
        ? options.selectedValue
        : [options.selectedValue];
  const selectedOptions = selectedValues.flatMap((value) => {
    if (value === null || visibleValues.has(String(value))) return [];
    const node = knownByValue[String(value)];
    if (node === undefined) return [];
    return [{
      ...node,
      value: node?.[valueField] ?? value,
      label: String(node?.[labelField] ?? node?.[valueField] ?? value),
    }];
  });

  return {
    dictId: options.dictId,
    providerId: options.providerId,
    scope: options.scope ?? entry?.scope ?? 'global',
    context: options.context ?? {},
    dependencies: options.dependencies ?? [],
    triggers: options.triggers ?? [],
    searchDebounceMs: options.searchDebounceMs ?? 300,
    status: entry?.status ?? 'idle',
    generation: entry?.generation ?? 0,
    activeRequest: entry?.activeRequest ?? null,
    ...(entry?.visibleCacheKey ? { visibleCacheKey: entry.visibleCacheKey } : {}),
    visibleNodes,
    options: visibleOptions,
    selectedOptions,
    knownByValue,
    data: visibleNodes,
    dataMap: knownByValue,
    loading: entry?.status === 'loading',
    error: entry?.error ?? null,
    disabled,
    accessible: !disabled,
    ariaBusy: entry?.status === 'loading',
    ariaInvalid: entry?.status === 'error',
  };
}

function getPath(source: unknown, path: string): unknown {
  if (!path) return source;
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, source);
}

function isContextRef(value: DictBindingParam): value is Extract<DictBindingParam, { from: any }> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'from' in value &&
    'path' in value
  );
}

/**
 * Resolve declarative binding params from state already owned by CRUD. It never calls user code.
 * Dependencies are projected from form state under their own names unless an explicit param wins.
 */
export function resolveDictBindingContext(
  binding: DictBinding | undefined,
  state: CrudState,
): DictSerializableRecord {
  if (!binding) return {};
  const context: DictSerializableRecord = {};
  for (const dependency of binding.dependencies ?? []) {
    const value = getPath(state.form.form, dependency);
    if (value !== undefined) context[dependency] = value as DictSerializableValue;
  }

  const sources: Record<string, unknown> = {
    form: state.form.form,
    search: state.search.form,
    row: state.form.row,
    list: state.list,
    tenant: (state as any).tenant,
    context: (state as any).context,
  };
  for (const [key, param] of Object.entries(binding.params ?? {})) {
    if (!isContextRef(param)) {
      context[key] = param;
      continue;
    }
    const resolved = getPath(sources[param.from], param.path);
    if (resolved !== undefined) {
      context[key] = resolved as DictSerializableValue;
    } else if (param.default !== undefined) {
      context[key] = param.default;
    }
  }
  return context;
}

export type DictControlInteraction =
  | { type: 'open' }
  | { type: 'dependencies-changed' }
  | { type: 'value-changed'; value: DictSerializableValue | DictSerializableValue[] | undefined }
  | { type: 'remote-search'; query: string }
  | { type: 'invalidate' };

function commandContext(descriptor: DictControlDescriptor): DictCommandContext {
  return {
    dictId: descriptor.dictId,
    ...(descriptor.providerId ? { providerId: descriptor.providerId } : {}),
    scope: descriptor.scope ?? 'global',
    context: descriptor.context ?? {},
  };
}

function valueKey(value: DictSerializableValue): string {
  return String(value);
}

/** Translate one control interaction into existing CRUD commands. No command performs I/O itself. */
export function translateDictControlInteraction(
  descriptor: DictControlDescriptor,
  interaction: DictControlInteraction,
): AppEvent<any>[] {
  const context = commandContext(descriptor);
  switch (interaction.type) {
    case 'open':
      return [loadDict(context)];
    case 'dependencies-changed':
      return [
        invalidateDict({ dictId: descriptor.dictId, scope: context.scope }),
        refreshDict(context),
      ];
    case 'value-changed': {
      const values = interaction.value === undefined
        ? []
        : Array.isArray(interaction.value)
          ? interaction.value
          : [interaction.value];
      const known = descriptor.knownByValue ?? {};
      const missing = values.filter(
        (value, index, all) =>
          value !== null &&
          known[valueKey(value)] === undefined &&
          all.findIndex((candidate) => valueKey(candidate) === valueKey(value)) === index,
      );
      return missing.length ? [hydrateDict({ ...context, values: missing })] : [];
    }
    case 'remote-search':
      return [searchDict({ ...context, query: interaction.query })];
    case 'invalidate':
      return [invalidateDict({ dictId: descriptor.dictId, scope: context.scope })];
  }
}

function findDictConfig(config: NormalizedCrudOptions, dictId: string): any {
  const registered = (config.raw as any).dicts?.[dictId];
  if (registered) return registered;
  const column = config.columns.find((candidate) => candidate.dictId === dictId);
  return column?.dict;
}

function projectionOptions(
  dictId: string,
  dictConfig: any,
  state: CrudState,
  disabled = false,
  selectedValue?: DictSerializableValue | DictSerializableValue[],
): DictControlProjectionOptions {
  const binding = dictConfig?.binding as DictBinding | undefined;
  return {
    dictId,
    providerId: dictConfig?.providerId ?? dictConfig?.source?.providerId,
    scope: binding?.scope ?? 'global',
    context: resolveDictBindingContext(binding, state),
    valueField: dictConfig?.fields?.value ?? dictConfig?.value ?? 'value',
    labelField: dictConfig?.fields?.label ?? dictConfig?.label ?? 'label',
    selectedValue,
    disabled,
    dependencies: binding?.dependencies,
    triggers: binding?.triggers,
    searchDebounceMs: binding?.searchDebounceMs,
  };
}

export function projectDictSlice(
  state: CrudState,
  config: NormalizedCrudOptions,
): Record<string, DictControlBinding> {
  const ids = new Set(Object.keys(state.dict));
  for (const column of config.columns) if (column.dictId) ids.add(column.dictId);
  if (config.tabs?.dictId) ids.add(config.tabs.dictId);
  const projected: Record<string, DictControlBinding> = {};
  for (const dictId of ids) {
    projected[dictId] = projectDictControl(
      state.dict[dictId],
      projectionOptions(dictId, findDictConfig(config, dictId), state),
    );
  }
  return projected;
}

export function projectColumnDictControl(
  state: CrudState,
  dictId: string,
  dictConfig: any,
  disabled = false,
  selectedValue?: DictSerializableValue | DictSerializableValue[],
): DictControlBinding {
  return projectDictControl(
    state.dict[dictId],
    projectionOptions(dictId, dictConfig, state, disabled, selectedValue),
  );
}
