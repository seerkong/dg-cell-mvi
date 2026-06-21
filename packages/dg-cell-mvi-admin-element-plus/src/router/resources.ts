/**
 * dg-cell-mvi-admin-element-plus · router/resources — the menu / route resource TREE.
 *
 * The single source of truth for both the sidebar menu and the route table. As of P4·T4.2 this is a
 * MULTI-LEVEL tree: top entries are CATEGORIES (a `title` + `icon` + `children`, NO `component`) that
 * group the leaf pages; the LEAVES are the actual pages (`component` = the view folder name under
 * src/views/<name>/index.vue, lazy-loaded by the router). A category renders as an expandable
 * `el-sub-menu`; only LEAVES become routes (router/index.ts walks the tree and maps the leaves — a
 * category is menu-only, never routable). Every leaf `path` from the old flat list is preserved verbatim
 * (no demo is lost; only their grouping/order in the menu changed).
 *
 * Why a tree here and not a menu store: `menu = projection(routes × permission)` (decisions §9) — the
 * sidebar consumes a PURE projection of this tree, recomputed deterministically, never written back.
 * Icons are iconify names (`<Icon :icon>` via @iconify/vue), mirroring the reference admin's
 * `meta.icon = "ant-design:..."` convention.
 */
export interface ResourceNode {
  title: string;
  path: string;
  /**
   * i18n message key for the menu/breadcrumb title (P6·T6.1). When set, the sidebar/breadcrumb render
   * `t(i18nKey, title)` so the label follows the app language; the literal `title` is the fallback (and
   * what the route table / document title still use). Categories + the main pages carry one; a leaf
   * without it simply shows its literal `title` in every locale (acceptable — only main items must switch).
   */
  i18nKey?: string;
  /** the view folder under src/views/<component>/index.vue. ABSENT on a category (menu-only group). */
  component?: string;
  /** iconify icon name (e.g. `ant-design:appstore-outlined`). */
  icon?: string;
  /**
   * required permission code (T5.1, RBAC). When set, this node (and its subtree) appears in the sidebar
   * ONLY if the user holds this code — `menu = projection(routes × permission.codes)` filters by it
   * (menuProjection.hasPermission). Absent ⇒ no gate (always shown). The codes come from the permission
   * actor's remote load; mirrors the reference admin's `meta.permission` convention.
   */
  permission?: string;
  /** child resources — present on a category, absent/empty on a leaf page. */
  children?: ResourceNode[];
}

const resources: ResourceNode[] = [
  // ── 底盘 / Chassis ────────────────────────────────────────────────────────
  {
    title: '底盘',
    i18nKey: 'menu.cat.chassis',
    path: '/cat/chassis',
    icon: 'ant-design:deployment-unit-outlined',
    children: [
      { title: '★底盘证明(session)', path: '/chassis-proof', component: '_chassis-proof', icon: 'ant-design:safety-certificate-outlined' },
      // RBAC functional pages (T5.3): both gated by their `:view` code AND granted by the dev mock, so they
      // are REACHABLE and serve as the assignment UIs (用户分配角色 / 角色分配权限).
      { title: '用户管理', i18nKey: 'menu.user', path: '/user', component: 'user', icon: 'ant-design:user-outlined', permission: 'user:view' },
      { title: '角色管理', i18nKey: 'menu.role', path: '/role', component: 'role', icon: 'ant-design:team-outlined', permission: 'role:view' },
      // Canonical AppBundle bundle preview: loads the
      // xnl-bundles/basic-admin fixture through loadHalfcodeUnitBundle → compileHalfcodeUnitBundle
      // and renders the admin shell / wiring / unit render plans structurally.
      { title: 'DSL Unit Bundle(v3)', path: '/halfcode-unit-bundles', component: 'halfcode-unit-bundles', icon: 'ant-design:apartment-outlined' },
      // GATED demo (T5.3): gated by `system:admin`, which the dev mock's codes WITHHOLD → this item is
      // FILTERED OUT of the sidebar after login AND a direct visit to /system is redirected to /403 — the
      // visible proof that the menu filters + the route guard blocks by real codes (delta admin.rbac
      // `menu-filter` + route-guard). Kept SEPARATE from role/user so those stay reachable+assignable.
      { title: '系统设置', i18nKey: 'menu.system', path: '/system', component: 'system', icon: 'ant-design:setting-outlined', permission: 'system:admin' },
      { title: '演示', i18nKey: 'menu.demo', path: '/demo', component: 'demo', icon: 'ant-design:experiment-outlined' },
    ],
  },

  // ── CRUD 数据 / CRUD & nested ─────────────────────────────────────────────
  {
    title: 'CRUD 数据',
    i18nKey: 'menu.cat.crud',
    path: '/cat/crud',
    icon: 'ant-design:database-outlined',
    children: [
      { title: '嵌套CRUD(虚拟model)', path: '/nest', component: 'nest' },
      { title: '嵌套CRUD(子api)', path: '/nest-api', component: 'nest-api' },
      { title: '子CRUD(可编辑子表)', path: '/sub-crud', component: 'sub-crud' },
      { title: '行编辑(editable-row)', path: '/editable-row', component: 'editable-row' },
      { title: '单元格编辑(editable-cell)', path: '/editable-cell', component: 'editable-cell' },
      { title: '自由编辑(editable-free)', path: '/editable-free', component: 'editable-free' },
      { title: '编辑细化(只读/触发/更新)', path: '/editable-knobs', component: 'editable-knobs' },
      { title: '提交钩子', path: '/form-hooks', component: 'form-hooks' },
      { title: '删除钩子', path: '/remove-hooks', component: 'remove-hooks' },
      { title: '渲染钩子', path: '/comp-render-hooks', component: 'comp-render-hooks' },
    ],
  },

  // ── 表单 / Forms ──────────────────────────────────────────────────────────
  {
    title: '表单',
    i18nKey: 'menu.cat.form',
    path: '/cat/form',
    icon: 'ant-design:form-outlined',
    children: [
      { title: '抽屉表单(drawer)', path: '/form-drawer', component: 'form-drawer' },
      { title: 'Grid布局表单', path: '/form-grid', component: 'form-grid' },
      { title: 'Flex表单', path: '/form-flex', component: 'form-flex' },
      { title: '单列表单', path: '/form-single-column', component: 'form-single-column' },
      { title: '分组表单', path: '/form-group', component: 'form-group' },
      { title: '分组Tabs表单', path: '/form-group-tabs', component: 'form-group-tabs' },
      { title: '表单高级(wrapper)', path: '/form-wrapper', component: 'form-wrapper' },
      { title: '动态配置(compute)', path: '/comp-compute', component: 'comp-compute' },
    ],
  },

  // ── 表格特性 / Table features ─────────────────────────────────────────────
  {
    title: '表格特性',
    i18nKey: 'menu.cat.table',
    path: '/cat/table',
    icon: 'ant-design:table-outlined',
    children: [
      { title: '序号列', path: '/feature-index', component: 'feature-index' },
      { title: '多选', path: '/feature-selection', component: 'feature-selection' },
      { title: '快速筛选(tabs)', path: '/feature-tabs', component: 'feature-tabs' },
      { title: '固定列', path: '/feature-fixed', component: 'feature-fixed' },
      { title: '树形表格', path: '/feature-tree', component: 'feature-tree' },
      { title: '导出CSV', path: '/feature-export', component: 'feature-export' },
      { title: '列设置', path: '/feature-columns-filter', component: 'feature-columns-filter' },
      { title: '操作列(下拉/分组)+字典', path: '/feature-rowhandle', component: 'feature-rowhandle' },
      { title: '高级查询(col/valueResolve/插槽)', path: '/feature-search-adv', component: 'feature-search-adv' },
      { title: '多级表头+列导出控制', path: '/feature-multiheader', component: 'feature-multiheader' },
      { title: '虚拟表格(table-v2 大数据)', path: '/feature-virtual', component: 'feature-virtual' },
      { title: 'Card列表布局(card)', path: '/feature-card', component: 'feature-card' },
    ],
  },

  // ── 组件 / Form-control widgets ───────────────────────────────────────────
  {
    title: '组件',
    i18nKey: 'menu.cat.comp',
    path: '/cat/comp',
    icon: 'ant-design:appstore-outlined',
    children: [
      { title: '单选(radio)', path: '/comp-radio', component: 'comp-radio' },
      { title: '多选(checkbox)', path: '/comp-checkbox', component: 'comp-checkbox' },
      { title: '级联(cascader)', path: '/comp-cascader', component: 'comp-cascader' },
      { title: '树形选择(tree-select)', path: '/comp-tree', component: 'comp-tree' },
      { title: '表格选择', path: '/comp-table-select', component: 'comp-table-select' },
      { title: '手机号', path: '/comp-phone', component: 'comp-phone' },
    ],
  },

  // ── 富组件 / Rich widgets ─────────────────────────────────────────────────
  {
    title: '富组件',
    i18nKey: 'menu.cat.rich',
    path: '/cat/rich',
    icon: 'ant-design:picture-outlined',
    children: [
      { title: '图片上传', path: '/comp-uploader', component: 'comp-uploader' },
      { title: 'JSON编辑器', path: '/comp-json', component: 'comp-json' },
      { title: '代码编辑器', path: '/comp-code', component: 'comp-code' },
      { title: '图标(icon)', path: '/comp-icon', component: 'comp-icon' },
      { title: '富文本(tiptap)', path: '/comp-richtext', component: 'comp-richtext' },
    ],
  },

  // ── 字典与插槽 / Dict & slots & misc features ─────────────────────────────
  {
    title: '字典与插槽',
    i18nKey: 'menu.cat.dict',
    path: '/cat/dict',
    icon: 'ant-design:tags-outlined',
    children: [
      { title: '共享字典', path: '/dict-shared', component: 'dict-shared' },
      { title: '独立字典(cloneable)', path: '/dict-cloneable', component: 'dict-cloneable' },
      { title: '单元格插槽', path: '/slots-cell', component: 'slots-cell' },
      { title: '布局/表单插槽', path: '/slots-layout', component: 'slots-layout' },
      { title: '国际化(i18n)', i18nKey: 'menu.i18n', path: '/feature-i18n', component: 'feature-i18n' },
      { title: '按钮权限(permission)', i18nKey: 'menu.permission', path: '/feature-permission', component: 'feature-permission' },
      { title: '配置插件(plugins)', path: '/feature-plugins', component: 'feature-plugins' },
    ],
  },
];

export default resources;

/**
 * Flatten the resource tree to its LEAF pages (nodes that carry a `component`). Categories — nodes with
 * `children` and no `component` — are menu-only and produce NO route. Used by router/index.ts to build a
 * flat route table from the multi-level menu tree (the routes stay flat; only the MENU is nested).
 */
export function leafResources(nodes: ResourceNode[] = resources): ResourceNode[] {
  const out: ResourceNode[] = [];
  for (const node of nodes) {
    if (node.children && node.children.length) {
      out.push(...leafResources(node.children));
    } else if (node.component) {
      out.push(node);
    }
  }
  return out;
}
