/**
 * dg-cell-mvi-crud · support/editableEffects — the impure boundary for inline-edit persistence.
 *
 * Closes over the user's `table.editable.updateRow`/`updateCell` (falling back to the standard
 * add/editRequest when omitted), runs the backend call, and re-dispatches the
 * editableSaveRow/CellSucceeded|Failed feedback the editable reducer folds back in. Mirrors
 * removeEffects: describe-as-effect in the reducer, run-as-handler here.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import {
  editableSaveCellFailed,
  editableSaveCellSucceeded,
  editableSaveRowFailed,
  editableSaveRowSucceeded,
} from '../contract/events';
import type { CrudState } from '../contract/state';
import type { NormalizedCrudOptions } from './optionsBuild';

function normalizeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A response is usable as the merged row only when it's a plain object (else keep the local merge). */
function asRow(res: any): any | undefined {
  return res && typeof res === 'object' && !Array.isArray(res) ? res : undefined;
}

export interface CreateEditableEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
}

export function createEditableEffects<R = any>(
  opts: CreateEditableEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { config } = opts;

  const updateRow: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { rowId, index, row, isAdd } = req.payload as {
      rowId: any;
      index: number;
      row: any;
      isAdd: boolean;
    };
    try {
      let res: any;
      if (config.editable.updateRow) {
        res = await config.editable.updateRow({ rowId, row, isAdd });
      } else if (isAdd && config.request.addRequest) {
        res = await config.request.addRequest({ form: row });
      } else if (config.request.editRequest) {
        res = await config.request.editRequest({ form: row, row });
      }
      return editableSaveRowSucceeded({ rowId, index, row: asRow(res) ?? row });
    } catch (err) {
      return editableSaveRowFailed({ rowId, error: normalizeError(err) });
    }
  };

  const updateCell: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { rowId, index, key, value, row } = req.payload as {
      rowId: any;
      index: number;
      key: string;
      value: any;
      row: any;
    };
    try {
      let res: any;
      if (config.editable.updateCell) {
        res = await config.editable.updateCell({ rowId, row, key, value });
      } else if (config.request.editRequest) {
        res = await config.request.editRequest({ form: row, row });
      }
      return editableSaveCellSucceeded({ rowId, index, key, value, row: asRow(res) });
    } catch (err) {
      return editableSaveCellFailed({ rowId, key, error: normalizeError(err) });
    }
  };

  return {
    [CRUD_EFFECT.editableUpdateRow]: updateRow,
    [CRUD_EFFECT.editableUpdateCell]: updateCell,
  };
}
