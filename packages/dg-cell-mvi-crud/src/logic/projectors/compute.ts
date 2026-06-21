/**
 * dg-cell-mvi-crud · logic/projectors/compute — pure value->label dict selectors + the dict() helper.
 *
 * Used by DgCell (and the projector) to turn a stored value into display node(s). Port of
 * `Dict.getNodesFromDataMap`: look each value up in the value->node `dataMap`; for an unknown value,
 * emit a placeholder node `{ [valueField]: value }` so the cell still renders the raw value instead of
 * blanking. Pure — reads only the passed dataMap. `resolveCompute` (sync compute) lives in
 * support/compute.ts; this module is the dict-label half of the projector's render resolution.
 */
import type { DictConfig } from '../../support/dictRegistry';

export interface DictFieldNames {
  value?: string;
  label?: string;
  children?: string;
  color?: string;
  /**
   * Custom label builder. When provided, a node resolves to
   * `labelBuilder(node)` instead of `node[label]`. Additive: absent → the plain `node[label]`.
   */
  labelBuilder?: (item: any) => string;
}

/**
 * Resolve a value (or array of values) to its dict node(s) via the value->node map.
 * Unknown values fall back to a placeholder node carrying the raw value under the value field, so the
 * cell renders the value rather than nothing (the reference crud parity).
 */
export function getNodesFromDataMap(
  dataMap: Record<string, any> | undefined,
  value: any,
  fields?: DictFieldNames,
): any[] {
  if (value == null) {
    return [];
  }
  const valueField = fields?.value ?? 'value';
  const map = dataMap || {};
  const values = Array.isArray(value) ? value : [value];
  const nodes: any[] = [];
  for (const v of values) {
    const node = map[v];
    if (node) {
      nodes.push(node);
    } else {
      nodes.push({ [valueField]: v });
    }
  }
  return nodes;
}

/**
 * Resolve a value to its display label string (joining multiple with `, `). Convenience over
 * `getNodesFromDataMap` for the common single-label cell case; honors a custom label field.
 */
export function getLabelsFromDataMap(
  dataMap: Record<string, any> | undefined,
  value: any,
  fields?: DictFieldNames,
): string {
  const valueField = fields?.value ?? 'value';
  const labelField = fields?.label ?? 'label';
  const labelBuilder = fields?.labelBuilder;
  const nodes = getNodesFromDataMap(dataMap, value, fields);
  return nodes
    .map((n) => {
      // labelBuilder (port of Dict.getLabel) wins when provided; else the plain label field, falling
      // back to the raw value for an unknown/placeholder node.
      if (typeof labelBuilder === 'function') {
        const built = labelBuilder(n);
        return built == null ? String(n[valueField] ?? '') : String(built);
      }
      const label = n[labelField];
      return label == null ? String(n[valueField] ?? '') : String(label);
    })
    .join(', ');
}

/**
 * Minimal `dict(config)` authoring helper so crud.tsx can write `dict({ url, value, label })`.
 * Returns the config tagged with `__isDict` (the contract treats column `dict` as opaque; the dict
 * slice / registry read these fields). Mirrors the reference crud's `dict()` factory, minus the live instance.
 */
export function dict<T = any>(config: DictConfig<T>): DictConfig<T> & { __isDict: true } {
  return { ...config, __isDict: true };
}

/** Predicate: is this opaque value a dict config authored via `dict()`. */
export function isDict(value: any): value is DictConfig & { __isDict: true } {
  return !!value && typeof value === 'object' && (value as any).__isDict === true;
}
