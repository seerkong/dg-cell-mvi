/**
 * dg-cell-mvi-admin-template · router/resources — the menu / route resource TREE.
 *
 * The single source of truth for BOTH the sidebar menu and the route table. Top entries are CATEGORIES
 * (a `title` + `icon` + `children`, NO `component`) that group the leaf pages; the LEAVES are the actual
 * pages (`component` = the view folder name under src/views/<name>/index.vue, lazy-loaded by the router).
 * A category renders as an expandable `el-sub-menu`; only LEAVES become routes (router/index.ts walks the
 * tree and maps the leaves — a category is menu-only, never routable).
 *
 * `menu = projection(routes × permission)`: the sidebar consumes a PURE projection of this tree filtered
 * by the user's codes — never written back. Icons are iconify names (`<Icon :icon>` via @iconify/vue).
 *
 * ── Add a page: add a leaf `{ title, path, component, icon, permission? }` here (the `component` must be a
 *    folder under src/views/<component>/index.vue). Set `permission` to a code to gate it (hidden from the
 *    menu + a direct visit redirects to /403 unless the user holds the code). See the project README.
 */
export interface ResourceNode {
  title: string;
  path: string;
  /** i18n message key for the menu/breadcrumb title. Falls back to the literal `title` when absent. */
  i18nKey?: string;
  /** the view folder under src/views/<component>/index.vue. ABSENT on a category (menu-only group). */
  component?: string;
  /** iconify icon name (e.g. `ant-design:appstore-outlined`). */
  icon?: string;
  /**
   * required permission code (RBAC). When set, this node appears in the sidebar ONLY if the user holds this
   * code, and a direct visit to its route redirects to /403 without it. Absent ⇒ no gate (always shown).
   */
  permission?: string;
  /** child resources — present on a category, absent/empty on a leaf page. */
  children?: ResourceNode[];
}

const resources: ResourceNode[] = [
  {
    title: '主导航',
    i18nKey: 'menu.cat.main',
    path: '/cat/main',
    icon: 'ant-design:appstore-outlined',
    children: [
      // The single example CRUD page. Gated by `product:view` (granted by the dev mock → reachable). Copy
      // this entry (+ the src/views/product folder) to add your own pages.
      {
        title: '商品管理',
        i18nKey: 'menu.product',
        path: '/product',
        component: 'product',
        icon: 'ant-design:shopping-outlined',
        permission: 'product:view',
      },
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
