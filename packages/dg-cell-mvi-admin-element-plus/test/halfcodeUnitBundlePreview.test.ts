/**
 * halfcode-unit-bundles page module test (T3.2-AC1): the pure preview builder
 * (src/views/halfcode-unit-bundles/preview.ts) is exercised in node against the
 * real xnl-bundles/basic-admin fixtures — same file map shape the page's
 * Vite raw-glob produces — so the page's load→compile→project pipeline is
 * verified without a browser.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createHalfcodeUnitBundlePreview } from '../src/views/halfcode-unit-bundles/preview';

const FIXTURES = path.resolve(
  __dirname,
  '../../dg-cell-mvi-halfcode-support/test/fixtures/xnl-bundles',
);

function collectFiles(dir: string, base = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = `${base}/${name}`;
    if (statSync(full).isDirectory()) {
      Object.assign(out, collectFiles(full, rel));
    } else if (name.endsWith('.xnl')) {
      out[rel] = readFileSync(full, 'utf8');
    }
  }
  return out;
}

describe('halfcode-unit-bundles preview model', () => {
  const files = collectFiles(FIXTURES);
  const preview = createHalfcodeUnitBundlePreview(files, 'vfs://@/basic-admin/');

  it('projects the admin shell plan into route and menu rows', () => {
    expect(preview.bundleId).toBe('dg.admin.basic.App');
    expect(preview.productName).toBe('dg.admin.basic.App');

    expect(preview.routes.map((row) => row.id)).toEqual([
      'users-route',
    ]);
    const users = preview.routes[0];
    expect(users).toMatchObject({ path: '/users', title: '用户', depth: 0 });

    expect(preview.menu).toEqual([
      { title: '用户', routeId: 'users-route', icon: 'user', order: 1 },
    ]);
  });

  it('projects the wiring plan and surfaces the unwired-message warning without errors', () => {
    expect(preview.wires).toHaveLength(0);

    expect(preview.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(
      preview.diagnostics.some(
        (d) => d.code === 'HALFCODE_MESSAGE_UNWIRED' && d.message.includes('users.selected'),
      ),
    ).toBe(true);
  });

  it('loads and compiles all six canonical fixture apps without errors', () => {
    for (const fixture of [
      'basic-admin',
      'embedded-admin',
      'import-admin',
      'data-graph-admin',
      'data-graph-counter',
      'runtime-counter',
    ]) {
      const model = createHalfcodeUnitBundlePreview(files, `vfs://@/${fixture}/`);
      expect(model.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), fixture).toEqual([]);
    }
  });

  it('renders the users page unit render plan as a structured tree', () => {
    const usersTree = preview.renderTrees.find(
      (tree) => tree.unitFqn === 'dg.admin.basic.UsersPage',
    );
    expect(usersTree).toBeDefined();
    expect(usersTree?.title).toBe('用户');

    const text = usersTree?.lines.join('\n') ?? '';
    expect(text).toContain('[atom] <h1> #users-title');
    expect(text).toContain('[capsule] #users-filter');
    expect(text).toContain('[atom] <elementPlus.ElInput> #keyword-input library=elementPlus');
    expect(text).toContain('[atom] <elementPlus.DataTable> #users-table library=elementPlus');
    expect(preview.renderTrees).toHaveLength(2);
  });
});
