/**
 * dg-cell-mvi-admin-element-plus · common/httpCrudRequest — the crud↔HttpPort request bridge (app layer).
 *
 * DEPA 统一传输 (single transport seam): instead of each data page calling its own in-memory mockService,
 * a page can route its CRUD requests through the chassis `HttpPort` — the SAME port the session actor uses.
 * Going through that one seam means every data request automatically inherits the port's interceptors:
 *   - the injected auth header (`getAuthToken`),
 *   - 401 → `onUnauthorized` (the app wires this to logout),
 *   - the `{ code, msg, data }` envelope unwrap (so `request()` resolves the bare payload).
 * mock vs real is decided ONLY by which HttpPort impl the app injected (dev = mockHttpPort, prod = axios) —
 * this bridge is identical either way, and the crud package is never touched (pure assembly).
 *
 * This module is intentionally framework-neutral (no vue import) so it is unit-testable with a fake
 * HttpPort. It produces exactly the crud `request` callbacks — `pageRequest / addRequest / editRequest /
 * delRequest` (the contract names, see dg-cell-mvi-crud `crudOptions.ts`). It does NOT supply
 * `transformQuery` / `transformRes`: those stay in `common/commonCrudOptions` and are merged in by
 * useCrud's deep-merge (commonOptions ⊕ page crudOptions), so the limit/offset contract is shared with
 * the mockService pages unchanged.
 *
 * Request/response shape (matches commonCrudOptions + the envelope unwrap):
 *   - `pageRequest(query)` — `query` is ALREADY the transformed page query
 *     (`{ page:{limit,offset}, query, sort }`, produced by commonCrudOptions.transformQuery in the crud
 *     reducer BEFORE pageRequest runs). We send it as the POST body to `listUrl`; the port unwraps the
 *     envelope and resolves the raw page res `{ records, total, limit, offset }`, which the crud effect
 *     then feeds to commonCrudOptions.transformRes. So this fn returns the RAW res untouched.
 *   - `addRequest({form})` / `editRequest({form,row})` — POST the form; `editRequest` first stamps the id
 *     from `row` onto the form (mirrors the mockService pages' crud.tsx). Resolves the saved row.
 *   - `delRequest({row})` — sends the row id to `delUrl`. Resolves whatever the backend returns (ignored).
 */
import type { HttpMethod, HttpPort } from 'dg-cell-mvi-admin-contract';

/**
 * The endpoint + verb descriptor for one CRUD resource. Only `listUrl` is strictly required to render a
 * read-only page; add/edit/del are optional so a list-only resource needs no write endpoints. Verbs and
 * the id placement default to the reference convention (POST list/add/edit, id in the del body) and can
 * be overridden per resource without touching this bridge.
 */
export interface HttpCrudResource {
  /** list/page endpoint. Receives the transformed page query as its body (POST) or params (GET). */
  listUrl: string;
  /** create endpoint. Receives the form as the body. Omit for a read-only resource. */
  addUrl?: string;
  /** update endpoint. Receives the form (with `id` stamped from the row) as the body. */
  editUrl?: string;
  /** delete endpoint. Receives the row id (see `idField`/`delBy`). */
  delUrl?: string;

  /** verb for the list call. Default `'post'` (the page query travels in the body, matching the mock). */
  listMethod?: HttpMethod;
  /** verb for add. Default `'post'`. */
  addMethod?: HttpMethod;
  /** verb for edit. Default `'post'`. */
  editMethod?: HttpMethod;
  /** verb for delete. Default `'post'`. */
  delMethod?: HttpMethod;

  /** the row's primary-key field. Default `'id'`. Stamped onto the edit form + read for delete. */
  idField?: string;
  /**
   * how the delete request carries the id:
   *   - `'body'`  (default) → `{ [idField]: id }` as the request body (matches the mock backend).
   *   - `'params'`          → `{ [idField]: id }` as a querystring param.
   * Override for a backend that takes the id in the query.
   */
  delBy?: 'body' | 'params';
}

/** The crud `request` callback set this bridge produces (the names crud's optionsBuild reads). */
export interface HttpCrudRequest {
  pageRequest: (query: any) => Promise<any>;
  addRequest: (ctx: { form: Record<string, any> }) => Promise<any>;
  editRequest: (ctx: { form: Record<string, any>; row: any }) => Promise<any>;
  delRequest: (ctx: { row: any; index?: number }) => Promise<any>;
}

/**
 * Build the crud `request` callbacks for one resource, all routed through the injected `HttpPort`.
 *
 * @param http     the chassis HttpPort (same instance the session actor uses → shared auth/401/envelope).
 * @param resource the resource's endpoints + verbs (see {@link HttpCrudResource}).
 * @returns the `{ pageRequest, addRequest, editRequest, delRequest }` set to spread into a page's
 *          `crudOptions.request` (transformQuery/transformRes come from commonCrudOptions via the merge).
 *
 * @example
 *   request: {
 *     ...createHttpCrudRequest(chassisHttp, { listUrl: '/user/page', addUrl: '/user/add', ... }),
 *   }
 */
export function createHttpCrudRequest(http: HttpPort, resource: HttpCrudResource): HttpCrudRequest {
  const idField = resource.idField ?? 'id';
  const listMethod = resource.listMethod ?? 'post';
  const addMethod = resource.addMethod ?? 'post';
  const editMethod = resource.editMethod ?? 'post';
  const delMethod = resource.delMethod ?? 'post';
  const delBy = resource.delBy ?? 'body';

  return {
    // `query` is already the transformed page query ({page:{limit,offset},query,sort}). For a POST list it
    // rides in the body; for a GET list it becomes the querystring. The port unwraps the envelope and
    // resolves the raw page res ({records,total,limit,offset}) — commonCrudOptions.transformRes maps it.
    pageRequest(query: any): Promise<any> {
      const isBody = listMethod !== 'get' && listMethod !== 'GET';
      return http.request({
        url: resource.listUrl,
        method: listMethod,
        ...(isBody ? { data: query } : { params: query as Record<string, unknown> }),
      });
    },

    addRequest({ form }: { form: Record<string, any> }): Promise<any> {
      if (!resource.addUrl) {
        return Promise.reject(new Error('httpCrudRequest: addUrl not configured for this resource'));
      }
      return http.request({ url: resource.addUrl, method: addMethod, data: form });
    },

    // mirror the mockService pages: stamp the row id onto the form so the backend updates the right row.
    editRequest({ form, row }: { form: Record<string, any>; row: any }): Promise<any> {
      if (!resource.editUrl) {
        return Promise.reject(new Error('httpCrudRequest: editUrl not configured for this resource'));
      }
      const body = { ...form, [idField]: row?.[idField] };
      return http.request({ url: resource.editUrl, method: editMethod, data: body });
    },

    delRequest({ row }: { row: any }): Promise<any> {
      if (!resource.delUrl) {
        return Promise.reject(new Error('httpCrudRequest: delUrl not configured for this resource'));
      }
      const id = row?.[idField];
      const payload = { [idField]: id };
      return http.request({
        url: resource.delUrl,
        method: delMethod,
        ...(delBy === 'params' ? { params: payload } : { data: payload }),
      });
    },
  };
}
