# `@dg-cell-mvi` Admin Chassis

A **production-ready admin framework** for building backend/management apps fast, built on the
`dg-cell-mvi-crud` CRUD engine. It supplies everything that surrounds your CRUD pages — authentication,
RBAC, multi-tab layout, theming, app-level i18n, HTTP transport, routing/guards, and env/build wiring — as
a set of cleanly layered, framework-neutral packages plus an Element-Plus render layer.

> **Just want to start a new admin?** Jump to [Quick start](#quick-start) → copy the
> [`dg-cell-mvi-admin-template`](../dg-cell-mvi-admin-template/) starter and replace its one example page.

This package, **`dg-cell-mvi-admin-element-plus`**, is the **reference / demo application** — a full app
exercising every chassis capability and ~50 CRUD-engine demos. Use it to see features in action; use the
**template** to start your own project.

---

## What the chassis is — DEPA layering

The chassis follows **DEPA** (Data / Effect / Processor / Actor) layering: pure declarations at the bottom,
pure logic above them, framework-neutral effect implementations beside them, render adapters on top, and the
**app** as the assembly root that injects the concrete ports. Each layer depends only downward.

```
          ┌─────────────────────────────────────────────────────────────────┐
  app  →  │  YOUR APP  (dg-cell-mvi-admin-template / -admin-element-plus)     │
          │  the 消费方/装配根: owns the router + the shared actor singletons, │
          │  injects the concrete ports (HttpPort/StoragePort/I18nPort/Theme- │
          │  Port), applies locale/theme effects at the root (App.vue).       │
          └───────────────┬─────────────────────────────────┬───────────────┘
                          │                                 │
        render  ┌─────────▼──────────┐          ┌───────────▼────────────┐
                │ dg-cell-mvi-      │          │ dg-cell-mvi-vue        │
                │   element-plus     │          │ vue adapters: useAdmin- │
                │ pure-UI shells:    │          │ Store/bindCommands,      │
                │ FsLogin, FsAdmin-  │          │ createVueI18nPort,      │
                │ {Outside,Sidebar,  │          │ v-permission directive  │
                │ Header,Tabs,Bread- │          │ (all domain-neutral)    │
                │ crumb,Settings},   │          └───────────┬─────────────┘
                │ ThemePort (EP dark)│                      │
                └─────────┬──────────┘                      │
                          │                                 │
       support  ┌─────────▼─────────────────────────────────▼───────────────┐
                │ dg-cell-mvi-admin-support  (framework-neutral)            │
                │ axios HttpPort (auth header / 401 / envelope unwrap),      │
                │ localStorage StoragePort, env utils                        │
                └───────────────────────────┬───────────────────────────────┘
                                            │
        logic   ┌───────────────────────────▼───────────────────────────────┐
                │ dg-cell-mvi-admin-logic  (PURE — zero IO/vue/el)          │
                │ the 4 actors: session / tabs / permission / settings       │
                │ (single-writer reducers + effect factories);               │
                │ projectMenu / projectBreadcrumb / resolveAuthRedirect /    │
                │ resolveRoutePermission / hasPermission                     │
                └───────────────────────────┬───────────────────────────────┘
                                            │
       contract ┌───────────────────────────▼───────────────────────────────┐
                │ dg-cell-mvi-admin-contract  (pure declarations, no IO)    │
                │ state atoms, command/message creators, port SIGNATURES     │
                │ (HttpPort/StoragePort/I18nPort/ThemePort)                  │
                └───────────────────────────────────────────────────────────┘
```

### Package responsibilities

| Package | Layer | Owns |
|---|---|---|
| `dg-cell-mvi-admin-contract` | contract | State shapes (session/tabs/permission/settings), command + message creators, **port signatures** (HttpPort/StoragePort/I18nPort/ThemePort). No behavior, no IO. |
| `dg-cell-mvi-admin-logic` | logic | The 4 **data-ownership actors** (pure single-writer reducers + injectable effect factories) and the pure **projections/decisions** (`projectMenu`, `projectBreadcrumb`, `resolveAuthRedirect`, `resolveRoutePermission`, `hasPermission`). Zero IO / vue / el. |
| `dg-cell-mvi-admin-support` | support | Framework-neutral **port impls**: axios `HttpPort` (auth-header injection, `{code,msg,data}` envelope unwrap, 401→`onUnauthorized`), localStorage `StoragePort`, env accessors. |
| `dg-cell-mvi-vue` | render | Vue adapters: `useAdminStore` (actor viewModel → Vue ref), `bindCommands`, `createVueI18nPort`, the neutral `v-permission` directive factory. Domain-free. |
| `dg-cell-mvi-element-plus` | render | **Pure-UI** chassis shells (`FsLogin`, `FsAdminOutside/Sidebar/Header/Tabs/Breadcrumb/Settings`), the EP-native `ThemePort`, and the `useCrud` wrapper defaulting to the EP UI registry. |
| `dg-cell-mvi-crud` | engine | The CRUD engine (`useCrud`, `FsCrud`, columns/forms/dicts/editable/search/etc.). The hardest part — surrounded by, not part of, the admin chassis. |
| **your app** | assembly | Owns the router + the shared actor singletons; **injects** the concrete ports; applies locale/theme effects at the root. This is the only layer that picks mock-vs-real transport. |

**The core idea:** the logic never imports IO, vue, or Element-Plus — it depends only on **port signatures**.
The app injects the concrete ports at one assembly root (`src/chassis/stores.ts`). Swapping mock ↔ real
backend is just swapping which `HttpPort` you inject — no logic changes.

---

## Quick start

Start a new admin by copying the **template** (a minimal runnable skeleton: login + layout + one example
CRUD page). See [`dg-cell-mvi-admin-template/README.md`](../dg-cell-mvi-admin-template/) for the full guide.

```bash
cd eidolon-workbench/frontend
bun install
cp -r packages/dg-cell-mvi-admin-template packages/my-admin   # → rename "name" in package.json
bun install
cd packages/my-admin && bun run dev        # → http://localhost:5175/  (mock backend, any login works)
```

You get a working admin with login, the full layout chrome, and a Products CRUD page. Replace the example
`product` page with your own entity and you're building.

To run the **reference demo app** (this package) instead:

```bash
cd packages/dg-cell-mvi-admin-element-plus
bun run dev        # → http://localhost:5174/   (every chassis capability + ~50 crud demos)
```

---

## How to add a CRUD page

A CRUD page is three files + two registrations. (Full code in the
[template README](../dg-cell-mvi-admin-template/#how-to-add-a-crud-page).)

1. **`views/<entity>/resource.ts`** — the endpoint urls (`listUrl/addUrl/editUrl/delUrl`) + a mock seed.
   This is the single source both the page and the dev mock agree on.
2. **`views/<entity>/crud.tsx`** — `crudOptions`: columns/form/search/dicts + button `permission` codes,
   with `request: createHttpCrudRequest(chassis.http, <RESOURCE>)` so every request rides the chassis
   transport (auth header / 401→logout / envelope unwrap for free).
3. **`views/<entity>/index.vue`** — bind `useCrud({ createCrudOptions, commonOptions, i18n: i18nPort,
   permission })` and render `<FsCrud>`. (`createHttpCrudRequest` + `commonCrudOptions` live in
   `src/common/`.)
4. **Register the route + menu** in `src/router/resources.ts`:
   `{ title, i18nKey, path: '/<entity>', component: '<entity>', icon, permission? }`. The route, sidebar
   item, breadcrumb and keep-alive all derive from this one entry. An optional `permission` gates it.
5. **(dev mock only)** register `{ ...<RESOURCE>, seed: <SEED> }` in `src/chassis/stores.ts`. With a real
   backend (set `VITE_APP_MOCK=false`) you skip this — the axios port hits your real endpoints.

---

## Auth / RBAC / i18n / theme usage

### Authentication
The **login flow** dispatches the `login` command on the shared `session` actor; the auth effect calls the
backend, persists `{ token, userInfo }`, and the view redirects to `?redirect=` (set by the auth guard) or
home. The token persists via the StoragePort and re-hydrates on reload (still-logged-in across refresh).
**401** is handled once, end-to-end: the HttpPort's `onUnauthorized` (wired to `dispatch(logout())` in
`chassis/stores.ts`) clears the session → the nav guard bounces to `/login`.

### RBAC (permission codes)
Codes are flat `prefix:action` strings, **remote-loaded after login** (`chassis/stores.ts` watches
`authenticated → loadPermissions`). They gate four surfaces:
- **menu** — `projectMenu(routes × codes)` hides a `meta.permission` item the user lacks.
- **routes** — the permission guard redirects a direct visit to a gated route → **/403**
  (`resolveRoutePermission`), with a load-race-safe re-check once codes resolve.
- **buttons** — a crud button carrying a `permission` is dropped unless held (the `permission` predicate
  handed to `useCrud`, backed by `hasPermission(codes, code)`).
- **`v-permission`** — `<el-button v-permission="'role:add'">` removes itself when the code is absent (the
  directive is composed at the app root from the permission actor's live codes — `main.ts`).

### i18n
`settings.setLocale(locale)` is the single write path; `App.vue` applies it to **vue-i18n + Element-Plus +
the crud chrome together** (one fact fans out via `<el-config-provider :locale>` + `i18nPort.setLocale`).
Add keys in `i18n/messages.ts` (the catalog also re-authors the crud engine's `I18N_KEY` chrome keys so
crud buttons localize). The chosen locale persists + restores on reload.

### Theme
`settings.setTheme('dark' | 'light')` and `settings.setPrimaryColor('#hex')` (dispatched by the settings
drawer); `App.vue` applies them via the EP-native `ThemePort` — toggling `html.dark` (EP's dark CSS-var set)
and the `--el-color-primary` family. No Ant color engine. Both facts persist + restore on reload.

---

## Rich-component extension points

The reference app ships **rich form-control widgets** in
[`src/components/rich/`](src/components/rich/) (registered globally in `main.ts`, referenced from
`crudOptions` by string name): `ImageUploader`, `RichTextEditor` (tiptap), `CodeEditor`, `JsonEditor`,
`IconPicker`, `PhoneInput`, `TableSelect`. Two ship as **deliberate placeholders** — wire them to
production services when you need them:

- **Real upload** — `ImageUploader.vue` currently reads the file to a base64 data URL (`FileReader`,
  `before-upload` returns `false` to skip a real request). For production, POST to your backend / a
  signed-URL endpoint **through the chassis `HttpPort`** (so it inherits auth + 401), e.g. request a signed
  PUT url, upload to object storage, then store the returned URL as the field value. Swap the
  `before-upload`/`http-request` handler — the crud field shape stays the same.
- **Real Monaco editor** — `CodeEditor.vue` is a styled `<el-input type="textarea">` (no editor dep). Drop
  in `monaco-editor` / `@guolao/vue-monaco-editor` (or CodeMirror), keep the same
  `modelValue`/`update:modelValue` contract, and every crud form using `type: 'code'` upgrades with no
  page changes.

The pattern is the point: a rich widget is a plain Vue component registered by name; replacing its internals
never touches the crud config that references it.

---

## Build

Multi-mode builds + optimizations (see `vite.config.ts`):

```bash
bun run build            # production — gzip-able assets + named long-cache vendor chunks
bun run build:staging    # build with .env.staging (multi-mode: just selects .env.<mode>)
bun run build:analyze    # additionally emit a bundle treemap → dist/stats.html
bun run preview          # serve the built dist locally
```

Optimizations applied for `vite build` only (dev stays untouched for fast HMR):
**gzip pre-compression** (`.gz` beside each asset over 1 KB, for `gzip_static`-capable servers),
**vendor chunking** (`vendor-element-plus` / `vendor-vue` / `vendor-iconify` / `vendor-editor` /
`vendor-lodash` split out for independent long-term caching), and (on `--mode analyze`) a **bundle
visualizer** treemap.

Env files: `.env` (shared defaults) → `.env.<mode>` overrides. Key vars: `VITE_APP_API` (API base / dev
proxy prefix), `VITE_APP_PROXY_TARGET` (dev backend the proxy forwards to), `VITE_APP_MOCK` (`false` =
use the real axios transport even in dev), `VITE_APP_TITLE`, `VITE_APP_STORAGE`.

---

## Engineering / DX

`eslint` + `prettier` + `husky` pre-commit (`lint-staged`) are configured in this reference app. Scripts:
`lint` / `lint:fix` / `format` / `format:check` / `typecheck` / `test`.
