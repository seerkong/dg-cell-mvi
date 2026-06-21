/**
 * halfcode-unit-bundles · preview model (track add-halfcode-v3-compiler-projection, P3/T3.2).
 *
 * Pure, framework-free projection: raw fixture files (Vite raw-glob in the
 * page, plain fs in the test) → in-memory VFS resolver → loadHalfcodeUnitBundle
 * (v3 loader) → compileHalfcodeUnitBundle (v3 compiler) → flat view model for
 * the page template (route/menu rows, wiring rows, diagnostics, structured
 * render-plan tree lines). Kept out of the .vue file so the module has a
 * plain node unit test (T3.2-AC1) alongside the build-time check.
 */
import type { ImportResolver } from 'xnl-core';
import { loadHalfcodeUnitBundle } from 'dg-cell-mvi-halfcode-support';
import { compileHalfcodeUnitBundle } from 'dg-cell-mvi-halfcode-logic';
import type {
  AdminShellRoutePlanV3,
  RenderNodePlan,
  UnitRenderPlan,
} from 'dg-cell-mvi-halfcode-contract';

export interface UnitBundleRouteRow {
  id: string;
  path: string;
  title: string;
  pageFqn: string;
  depth: number;
  menu: string;
  permissionRef: string;
}

export interface UnitBundleMenuRow {
  title: string;
  routeId: string;
  icon: string;
  order?: number;
}

export interface UnitBundleDiagnosticRow {
  severity: 'warning' | 'error';
  source: 'loader' | 'compiler';
  code: string;
  message: string;
}

export interface UnitRenderTreeModel {
  unitFqn: string;
  unitKind: string;
  title?: string;
  lines: string[];
}

export interface UnitBundlePreviewModel {
  bundleId: string;
  productName: string;
  routes: UnitBundleRouteRow[];
  menu: UnitBundleMenuRow[];
  wires: string[];
  diagnostics: UnitBundleDiagnosticRow[];
  renderTrees: UnitRenderTreeModel[];
}

function normalizePath(value: string): string {
  const path = value.startsWith('/') ? value : `/${value}`;
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function createResolver(files: Record<string, string>): ImportResolver {
  const normalized = Object.fromEntries(
    Object.entries(files).map(([file, content]) => [normalizePath(file), content]),
  );
  return {
    readFile(path) {
      return normalized[normalizePath(path)] ?? null;
    },
    isDir(path) {
      const prefix = `${normalizePath(path).replace(/\/$/, '')}/`;
      return Object.keys(normalized).some((file) => file.startsWith(prefix));
    },
    readDir(path) {
      const prefix = `${normalizePath(path).replace(/\/$/, '')}/`;
      const entries = Object.keys(normalized)
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length).split('/')[0]);
      return entries.length ? [...new Set(entries)] : null;
    },
  };
}

function flattenRoutes(routes: AdminShellRoutePlanV3[], depth = 0): UnitBundleRouteRow[] {
  return routes.flatMap((route) => [
    {
      id: route.id,
      path: route.path,
      title: route.title ?? '',
      pageFqn: route.pageFqn,
      depth,
      menu: route.menu ? JSON.stringify(route.menu) : '',
      permissionRef: route.permissionBinding ?? '',
    },
    ...flattenRoutes(route.children ?? [], depth + 1),
  ]);
}

function menuRows(routes: AdminShellRoutePlanV3[]): UnitBundleMenuRow[] {
  const rows: UnitBundleMenuRow[] = [];
  const visit = (route: AdminShellRoutePlanV3): void => {
    if (route.menu) {
      rows.push({
        title: route.title ?? route.path,
        routeId: route.id,
        icon: route.menu.icon ?? '',
        order: route.menu.order,
      });
    }
    for (const child of route.children ?? []) visit(child);
  };
  for (const route of routes) visit(route);
  return rows.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));
}

function nodeLabel(node: RenderNodePlan): string {
  const parts: string[] = [`[${node.kind}]`];
  if (node.kind === 'capsule') {
    parts.push(`#${node.id}`);
    if (node.scopeId) parts.push(`scope=${node.scopeId}`);
    return parts.join(' ');
  }
  parts.push(`<${node.tag}>`, `#${node.id}`);
  if (node.kind === 'atom' && node.library) parts.push(`library=${node.library}`);
  if (node.kind === 'page-embed') {
    parts.push(`page=${node.pageFqn}`);
    if (node.urlInputsBinding) parts.push(`urlInputs=${node.urlInputsBinding}`);
  }
  if (node.kind === 'component') parts.push(`fqn=${node.fqn}`);
  if ('inlineProps' in node && node.inlineProps && Object.keys(node.inlineProps).length) {
    parts.push(`inlineProps=${JSON.stringify(node.inlineProps)}`);
  }
  if ('propsBinding' in node && node.propsBinding) parts.push(`props=${node.propsBinding}`);
  if ('commandBinding' in node && node.commandBinding) parts.push(`command=${node.commandBinding}`);
  if (node.scopeId) parts.push(`scope=${node.scopeId}`);
  return parts.join(' ');
}

function treeLines(nodes: RenderNodePlan[], depth = 0, out: string[] = []): string[] {
  const indent = '  '.repeat(depth);
  for (const node of nodes) {
    out.push(`${indent}${nodeLabel(node)}`);
    treeLines(node.children ?? [], depth + 1, out);
    for (const slot of node.slots ?? []) {
      out.push(`${indent}  (slot) #${slot.id}`);
      treeLines(slot.children, depth + 2, out);
    }
  }
  return out;
}

function renderTreeModel(plan: UnitRenderPlan): UnitRenderTreeModel {
  return {
    unitFqn: plan.unitFqn,
    unitKind: plan.unitKind,
    title: plan.title,
    lines: treeLines(plan.root),
  };
}

/**
 * Load + compile a v3 unit bundle from an in-memory file map and project the
 * plans into the page view model. Throws on unrecoverable load errors (the
 * page surfaces the message); loader/compiler diagnostics are returned as rows.
 */
export function createHalfcodeUnitBundlePreview(
  files: Record<string, string>,
  src = 'vfs://@/basic-admin/',
): UnitBundlePreviewModel {
  const bundle = loadHalfcodeUnitBundle(createResolver(files), src, {
    baseDir: '/',
    workspaceRoot: '/',
    uiLibraries: ['elementPlus'],
  });
  const result = compileHalfcodeUnitBundle(bundle);

  return {
    bundleId: result.adminShellPlan.bundleId,
    productName: result.adminShellPlan.product?.name ?? result.adminShellPlan.product?.id ?? '',
    routes: flattenRoutes(result.adminShellPlan.routes),
    menu: menuRows(result.adminShellPlan.routes),
    wires: result.wiringPlan.wires.map(
      (wire) =>
        `#${wire.fromRouteId} (${wire.fromPageFqn}) --${wire.message}--> #${wire.toRouteId} (${wire.toPageFqn})`,
    ),
    diagnostics: [
      ...bundle.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        source: 'loader' as const,
        code: diagnostic.code,
        message: diagnostic.message,
      })),
      ...result.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        source: 'compiler' as const,
        code: diagnostic.code,
        message: diagnostic.message,
      })),
    ],
    renderTrees: result.renderPlans.map(renderTreeModel),
  };
}
