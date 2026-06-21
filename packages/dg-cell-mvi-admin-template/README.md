# Admin Template (`dg-cell-mvi-admin-template`)

A **minimal, runnable admin starter** on the `@dg-cell-mvi` admin chassis. Out of the box it gives you:

- **Login** (mock auth — any credentials work in dev) on a centered outside shell.
- **Layout shell** — collapsible sidebar (multi-level menu + icons), header (breadcrumb + user dropdown +
  language switch + settings gear), multi-tab bar with keep-alive, dark mode + theme-color settings drawer.
- **One example CRUD page** (`商品管理` / Products) — full list / search / add / edit / delete wired through
  the chassis `HttpPort`, with button-level permissions and i18n chrome.
- **RBAC** (route + menu + button gating), **auth guards**, **404 / 403**, **vue-i18n** (zh-CN / en),
  **EP-native dark theme**, a **global error sink**, and **build optimizations** (gzip + vendor chunking).

It **consumes** the chassis packages — it does not re-implement them. You copy this folder, replace the
example page with your own, and you have a new backend.

---

## Quick start

> Node ≥ 18 is required (Vite 5+). This template lives inside the `eidolon-workbench/frontend` monorepo and
> consumes the `dg-cell-mvi-*` packages **from source** via workspace aliases.

```bash
# from the monorepo frontend root (installs all workspace packages, including this template)
cd eidolon-workbench/frontend
bun install

# dev server (in-process mock backend — no API needed)
cd packages/dg-cell-mvi-admin-template
bun run dev          # → http://localhost:5175/

# production build
bun run build        # → dist/  (gzip + vendor-split chunks)
bun run preview      # serve the built dist locally

# type-check
bun run typecheck
```

Log in with **any** username + password (the dev mock accepts everything), land on the Products page,
and the table loads from the in-process mock store. The row **delete** button is hidden because the mock
withholds the `product:remove` code — that is the RBAC button gate working (see below).

### Scaffold a NEW project from this template

```bash
# copy the template to a new package
cp -r packages/dg-cell-mvi-admin-template packages/my-admin
# edit packages/my-admin/package.json → rename "name"
bun install
cd packages/my-admin && bun run dev
```

Then rename the example `product` page to your first entity (next section) and delete what you don't need.

**Taking it OUT of the monorepo / onto published packages:** the chassis is consumed from source via the
`dg-cell-mvi-*` + `depa-data-graph-*` aliases in `vite.config.ts` (and the matching `paths` in
`tsconfig.json`). When you depend on **published** `dg-cell-mvi-*` packages instead, delete those aliases
(Vite/TS then resolve from `node_modules`) and remove the `server.fs.allow` / `DEPA_ROOT` lines.

---

## Project structure

```
src/
  main.ts                 app bootstrap — installs EP + i18n + v-permission + error sink + chassis provide
  App.vue                 root shell — el-config-provider + the locale/theme APPLY watches (装配根 seam)
  chassis/
    stores.ts             ASSEMBLY ROOT — builds the 4 shared actors (session/tabs/permission/settings),
                          injects the HttpPort (dev mock / axios) + StoragePort, bridges auth→permission
    layout.ts             shared sidebar-collapse ref (cross-component UI state)
    mockHttpPort.ts       DEV-only in-process HttpPort: /login /mine /permissions + registered CRUD resources
    errorHandler.ts       global error sink (Vue errorHandler + window rejection/error → throttled toast)
  router/
    index.ts              routes built from the resource tree; login/403/404; installs guards
    guards.ts             router-as-effect: auth gate + permission gate + title + NProgress + tabs回流
    resources.ts          the menu/route resource TREE (single source for sidebar + routes)
  layout/
    LayoutFramework.vue   the admin chrome (sidebar + header + tabs + breadcrumb + settings drawer)
    LocaleSwitch.vue      header language switcher
  i18n/
    index.ts              the vue-i18n instance + the chassis I18nPort + EP locale mapping
    messages.ts           zh-CN / en catalogs (chrome + menu + crud built-in keys)
  theme/index.ts          the EP-native ThemePort (html.dark + --el-color-primary)
  common/
    commonCrudOptions.ts  the app-wide request/response contract (limit/offset transform)
    httpCrudRequest.ts    the crud↔HttpPort bridge (builds pageRequest/add/edit/delRequest for a resource)
  api/mockService.ts      tiny in-memory CRUD backend (used by the dev mock only)
  views/
    login/  403/  404/    the outside-shell pages
    product/              ← THE EXAMPLE CRUD PAGE (copy this to make your own)
      resource.ts         endpoint urls + mock seed (the single source both sides of the HttpPort agree on)
      crud.tsx            crudOptions (columns/form/search + button permissions + request via HttpPort)
      index.vue           binds useCrud + the i18n port + the permission predicate; renders <FsCrud>
```

---

## How to add a CRUD page

Say you want a `用户 (user)` page backed by `/user/*`:

**1. Create `src/views/user/resource.ts`** — the endpoints + (mock) seed:

```ts
import type { HttpCrudResource } from '../../common/httpCrudRequest';

export const USER_RESOURCE: HttpCrudResource = {
  listUrl: '/user/page',
  addUrl: '/user/add',
  editUrl: '/user/update',
  delUrl: '/user/delete',
};

export const USER_SEED = [
  { id: 1, name: 'Alice', status: 'on', createTime: '2026-06-01 10:00:00' },
  // … mock rows (dev only)
];
```

**2. Create `src/views/user/crud.tsx`** — the crud config, requests routed through the chassis HttpPort:

```tsx
import { createHttpCrudRequest } from '../../common/httpCrudRequest';
import { chassis } from '../../chassis/stores';
import { USER_RESOURCE } from './resource';

export default function () {
  return {
    crudOptions: {
      request: createHttpCrudRequest(chassis.http, USER_RESOURCE),  // auth/401/envelope for free
      pagination: { pageSize: 10 },
      // button permissions — each button is dropped unless the user holds the code (see index.vue predicate)
      actionbar: { buttons: { add: { permission: 'user:add' } } },
      rowHandle: { buttons: { edit: { permission: 'user:edit' }, remove: { permission: 'user:remove' } } },
      columns: {
        id: { title: 'ID', form: { show: false }, column: { width: 70 } },
        name: { title: '名称', search: { show: true }, form: { rules: [{ required: true, message: '必填' }] } },
        status: { title: '状态', type: 'select', dict: { value: 'value', label: 'label',
          data: [{ value: 'on', label: '启用' }, { value: 'off', label: '禁用' }] } },
      },
    },
  };
}
```

**3. Create `src/views/user/index.vue`** — bind useCrud (copy the example verbatim, swap the import):

```vue
<template>
  <FsCrud :key="codesKey" :crud-binding="crudBinding" :commands="commands" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { FsCrud, useCrud, useAdminStore } from 'dg-cell-mvi-element-plus';
import { hasPermission } from 'dg-cell-mvi-admin-logic';
import createCrudOptions from './crud';
import commonOptions from '../../common/commonCrudOptions';
import { useChassis } from '../../chassis/stores';
import { i18nPort } from '../../i18n';

const chassis = useChassis();
const { binding: permission } = useAdminStore(chassis.permission);
const { binding: settings } = useAdminStore(chassis.settings);
const codesKey = computed(() => `${permission.value.codes.join(',')}|${settings.value.locale}`);

const { crudBinding, commands } = useCrud({
  createCrudOptions,
  commonOptions,
  i18n: i18nPort,
  permission: (code: string) => hasPermission(chassis.permission.state().codes, code),
});
</script>
```

**4. Register the route + menu entry** in `src/router/resources.ts`:

```ts
{ title: '用户管理', i18nKey: 'menu.user', path: '/user', component: 'user',
  icon: 'ant-design:user-outlined', permission: 'user:view' },
```

`component: 'user'` must match the folder name (`src/views/user/index.vue`). The route, menu item, breadcrumb
and keep-alive are all derived from this one entry. `permission` (optional) gates it (hidden from the menu +
a direct visit redirects to /403 unless the user holds the code).

**5. (dev mock only) register the resource** in `src/chassis/stores.ts` so the mock serves `/user/*`:

```ts
resources: [
  { ...PRODUCT_RESOURCE, seed: PRODUCT_SEED },
  { ...USER_RESOURCE, seed: USER_SEED },   // ← add this
],
```

That's it. With a **real backend** you skip step 5 entirely — set `VITE_APP_MOCK=false` and the axios
HttpPort hits your real `/user/*` endpoints through the same bridge.

---

## Auth / RBAC / i18n / theme — how they work here

- **Login flow:** `views/login/index.vue` dispatches the `login` command on the shared `session` actor;
  on success the token is persisted and you are redirected to `?redirect=` (set by the auth guard) or home.
  Mock: any credentials pass (`chassis/mockHttpPort.ts`). Real: point at your `/login` (returns
  `{ token, userInfo }`).
- **Permission codes** are loaded automatically after login (`chassis/stores.ts` watches `authenticated →
  loadPermissions`). The dev mock returns `['product:view','product:add','product:edit']`. They drive:
  - **menu** — a `permission`-tagged resource is hidden unless the code is held (`projectMenu`).
  - **routes** — a direct visit to a gated route without the code redirects to **/403** (the permission guard).
  - **buttons** — a crud button with a `permission` is dropped unless the code is held (the `permission`
    predicate in `index.vue`). Try granting `product:remove` in the mock to see the delete button appear.
  - **`v-permission`** — `<el-button v-permission="'product:add'">` removes itself when the code is absent.
- **i18n:** `setLocale` on the `settings` actor is the single write path; `App.vue` applies it to vue-i18n +
  Element-Plus + the crud chrome together. Add keys in `i18n/messages.ts`, use `$t('your.key')`.
- **Theme:** `setTheme('dark')` / `setPrimaryColor('#hex')` on the `settings` actor (the settings drawer
  dispatches these); `App.vue` toggles `html.dark` + the `--el-color-primary` family. Both persist + restore
  on reload via the StoragePort.

---

## Build

```bash
bun run build            # production (gzip-able assets + named vendor chunks)
bun run build:staging    # build with .env.staging (multi-mode)
```

The build splits big stable deps into long-cache vendor chunks (`vendor-element-plus`, `vendor-vue`,
`vendor-iconify`, `vendor-lodash`) and keeps per-route code in its own chunks. See `vite.config.ts`.

---

For the chassis architecture (DEPA layering, what each `dg-cell-mvi-*` package owns) and the rich-component
extension points, see the **ecosystem README** at `../dg-cell-mvi-admin-element-plus/README.md`.
