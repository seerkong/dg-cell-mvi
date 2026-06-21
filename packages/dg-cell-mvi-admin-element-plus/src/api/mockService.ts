/**
 * dg-cell-mvi-admin-element-plus · api/mockService — a tiny in-memory mock backend.
 *
 * `buildMock(name, seedRows)` returns the four CRUD endpoints over a private in-memory array.
 * GetList honors the limit/offset contract (see common/commonCrudOptions) plus a simple per-field
 * form filter (substring for strings, equality otherwise). Pure JS — a small setTimeout simulates
 * network latency so loading states are exercised. Mirrors the reference admin's mock/base.ts behavior, trimmed
 * to what the demo needs (no children/lazy/byIds).
 */

/** Structural deep clone for plain mock data (no functions/dates) — keeps the store immutable-safe. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export interface MockListReq {
  page?: { limit?: number; offset?: number };
  query?: Record<string, any>;
  sort?: { prop?: string; order?: 'asc' | 'desc' | null; asc?: boolean };
}

export interface MockListRes {
  records: any[];
  total: number;
  limit: number;
  offset: number;
}

export interface MockService {
  GetList(req: MockListReq): Promise<MockListRes>;
  AddObj(form: Record<string, any>): Promise<any>;
  UpdateObj(form: Record<string, any>): Promise<any>;
  DelObj(id: any): Promise<null>;
}

const LATENCY = 120;
function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY));
}

/** Does one row pass every active filter in `query`? (substring for strings, === otherwise.) */
function matches(row: any, query: Record<string, any>): boolean {
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value == null || value === '') continue;
    const cell = row[key];
    if (typeof cell === 'string') {
      if (!cell.includes(String(value))) return false;
    } else if (cell !== value) {
      return false;
    }
  }
  return true;
}

export function buildMock(name: string, seedRows: any[]): MockService {
  // private dataset for this resource (cloned so callers can't mutate the seed)
  const list: any[] = clone(seedRows);
  let idGen = list.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0);

  return {
    GetList(req: MockListReq): Promise<MockListRes> {
      const limit = req.page?.limit ?? 20;
      const offset = req.page?.offset ?? 0;
      const query = req.query || {};

      let data = list.filter((row) => matches(row, query));

      const sort = req.sort;
      if (sort?.prop) {
        const { prop } = sort;
        const asc = sort.asc ?? sort.order !== 'desc';
        data = [...data].sort((a, b) => {
          const ret = a[prop] > b[prop] ? 1 : a[prop] < b[prop] ? -1 : 0;
          return asc ? ret : -ret;
        });
      }

      const total = data.length;
      const records = clone(data.slice(offset, offset + limit));
      return delay({ records, total, limit, offset });
    },

    AddObj(form: Record<string, any>): Promise<any> {
      const row = clone(form);
      row.id = ++idGen;
      list.unshift(row);
      return delay(clone(row));
    },

    UpdateObj(form: Record<string, any>): Promise<any> {
      const idx = list.findIndex((r) => r.id === form.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...clone(form) };
      return delay(idx >= 0 ? clone(list[idx]) : null);
    },

    DelObj(id: any): Promise<null> {
      const idx = list.findIndex((r) => r.id === id);
      if (idx >= 0) list.splice(idx, 1);
      return delay(null);
    },
  };
}
