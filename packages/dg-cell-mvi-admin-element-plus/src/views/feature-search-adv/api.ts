/**
 * dg-cell-mvi-admin-element-plus · views/feature-search-adv/api — advanced-search demo backend.
 *
 * A self-contained in-memory list (rows carry name / dept / level / createTime) with a bespoke
 * `GetList` that honors the SPLIT daterange query the search `valueResolve` produces
 * (`createTimeStart` / `createTimeEnd`) as a real range filter — so picking a date range actually
 * narrows the list (demonstrating valueResolve end-to-end), alongside the usual name/dept filters.
 */
const seed = [
  { id: 1, name: '张伟', dept: '研发部', level: 'p7', createTime: '2026-01-05' },
  { id: 2, name: '王芳', dept: '市场部', level: 'p6', createTime: '2026-02-11' },
  { id: 3, name: '李娜', dept: '研发部', level: 'p8', createTime: '2026-03-02' },
  { id: 4, name: '刘洋', dept: '财务部', level: 'p6', createTime: '2026-03-20' },
  { id: 5, name: '陈静', dept: '研发部', level: 'p7', createTime: '2026-04-14' },
  { id: 6, name: '杨磊', dept: '市场部', level: 'p5', createTime: '2026-04-28' },
  { id: 7, name: '黄敏', dept: '人事部', level: 'p6', createTime: '2026-05-09' },
  { id: 8, name: '赵雷', dept: '研发部', level: 'p8', createTime: '2026-05-22' },
  { id: 9, name: '周琳', dept: '财务部', level: 'p7', createTime: '2026-06-01' },
  { id: 10, name: '吴刚', dept: '市场部', level: 'p6', createTime: '2026-06-12' },
  { id: 11, name: '徐梅', dept: '人事部', level: 'p5', createTime: '2026-06-15' },
  { id: 12, name: '孙强', dept: '研发部', level: 'p8', createTime: '2026-06-16' },
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const list: any[] = clone(seed);
let idGen = list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
const delay = <T>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 120));

/** GetList over the limit/offset contract, honoring name/dept substring + the split daterange range. */
export function GetList(req: any) {
  const limit = req.page?.limit ?? 20;
  const offset = req.page?.offset ?? 0;
  const q = req.query || {};
  const data = list.filter((row) => {
    if (q.name && !String(row.name).includes(String(q.name))) return false;
    if (q.dept && !String(row.dept).includes(String(q.dept))) return false;
    if (q.level && row.level !== q.level) return false;
    // the search valueResolve splits the daterange into createTimeStart / createTimeEnd:
    if (q.createTimeStart && row.createTime < q.createTimeStart) return false;
    if (q.createTimeEnd && row.createTime > q.createTimeEnd) return false;
    return true;
  });
  const total = data.length;
  const records = clone(data.slice(offset, offset + limit));
  return delay({ records, total, limit, offset });
}

export function AddObj(form: Record<string, any>) {
  const row = clone(form);
  row.id = ++idGen;
  list.unshift(row);
  return delay(clone(row));
}
export function UpdateObj(form: Record<string, any>) {
  const idx = list.findIndex((r) => r.id === form.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...clone(form) };
  return delay(clone(list[idx]));
}
export function DelObj(id: any) {
  const idx = list.findIndex((r) => r.id === id);
  if (idx >= 0) list.splice(idx, 1);
  return delay(null);
}
