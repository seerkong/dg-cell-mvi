/**
 * dg-cell-mvi-crud · support/formDraftEffects — the impure boundary for form-draft storage (P5).
 *
 * Reuses the F5 injected-storage-port pattern (support/columnsFilterEffects.ts): the reducer's form
 * slice stays pure; reading/writing the draft is IO so it funnels here. Three handlers:
 *   - loadFormDraft   → read storage[`crud:formDraft:<id>`]; if a draft exists, pop the restore confirm
 *                       through the injected CrudUiPort (the same UI abstraction confirmRemove uses)
 *                       and, on accept, re-dispatch `setFormData(draft)`. On cancel / no draft / no
 *                       storage → no-op.
 *   - persistFormDraft→ write the current form data back under the same key (on every edit).
 *   - clearFormDraft  → remove the saved draft (on a successful submit).
 *
 * The storage backend is an injected port (the Vue layer supplies localStorage; tests pass a fake).
 * All handlers no-op when no id / no storage. Storage absence/parse errors are swallowed — drafting is
 * best-effort and must never break the loop.
 */
import type { EffectHandler } from 'dg-cell-mvi-core';

import { CRUD_EFFECT } from '../contract/effects';
import { setFormData } from '../contract/events';
import type { CrudState } from '../contract/state';
import type { CrudUiPort } from './requestEffects';
import type { NormalizedCrudOptions } from './optionsBuild';

/** A minimal storage backend for drafts — getItem/setItem (+ optional removeItem) of Web Storage. */
export interface FormDraftStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** the localStorage key for a form's saved draft. */
export function formDraftStorageKey(id: string): string {
  return `crud:formDraft:${id}`;
}

export interface CreateFormDraftEffectsOptions<R = any> {
  config: NormalizedCrudOptions<R>;
  storage?: FormDraftStoragePort;
  ui?: CrudUiPort;
}

export function createFormDraftEffects<R = any>(
  opts: CreateFormDraftEffectsOptions<R>,
): Record<string, EffectHandler<CrudState<R>>> {
  const { storage, ui } = opts;

  const loadFormDraft: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { id } = req.payload as { id?: string };
    if (!storage || !id) return;
    let draft: Record<string, any> | null = null;
    try {
      const raw = storage.getItem(formDraftStorageKey(id));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') draft = parsed as Record<string, any>;
      }
    } catch {
      return; // unreadable draft — skip restore.
    }
    if (!draft) return;
    // restoring is a user choice → confirm through the UI port (no confirm port = auto-restore).
    const confirmed = ui
      ? await ui.confirm({ title: '提示', message: '检测到未提交的草稿，是否恢复？' })
      : true;
    if (confirmed) return setFormData(draft);
    // declined: leave the form as-is (the draft stays in storage for next time).
  };

  const persistFormDraft: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { id, form } = req.payload as { id?: string; form: Record<string, any> };
    if (!storage || !id) return;
    try {
      storage.setItem(formDraftStorageKey(id), JSON.stringify(form ?? {}));
    } catch {
      // best-effort: a quota/serialization failure must not break the loop.
    }
  };

  const clearFormDraft: EffectHandler<CrudState<R>> = async (_rt, req) => {
    const { id } = req.payload as { id?: string };
    if (!storage || !id) return;
    const key = formDraftStorageKey(id);
    try {
      if (typeof storage.removeItem === 'function') storage.removeItem(key);
      else storage.setItem(key, '');
    } catch {
      // best-effort.
    }
  };

  return {
    [CRUD_EFFECT.loadFormDraft]: loadFormDraft,
    [CRUD_EFFECT.persistFormDraft]: persistFormDraft,
    [CRUD_EFFECT.clearFormDraft]: clearFormDraft,
  };
}
