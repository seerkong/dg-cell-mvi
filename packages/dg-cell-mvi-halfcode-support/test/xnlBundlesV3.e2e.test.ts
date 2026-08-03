/**
 * Latest XNL DSL fixture corpus for halfcode bundle design.
 *
 * These fixtures validate the canonical DSL surface at parse/shape level and
 * keep the fixture corpus independent from retired bundle formats.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { parseXnl } from 'xnl-core';

const workspaceRoot = new URL('./fixtures/xnl-bundles', import.meta.url).pathname;

const latestApps = [
  'basic-admin',
  'embedded-admin',
  'import-admin',
  'data-graph-admin',
  'data-graph-counter',
  'runtime-counter',
  'flow-showcase',
] as const;
const migratedApps = latestApps;

const retiredTokenPattern =
  /runtime-|halfcode-|dev-fixture|editor-workspace|state-seed:\/\/|state-def:\/\/|state\.def|state\.seed|stateDef|stateSeed|(?<!scope\.)effects:\/\/|graphs:\/\/|parentRef/;
const refSuffixedAttributePattern = /\b[A-Za-z_$][A-Za-z0-9_$]*Ref\s*=/;

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

function xnlFiles(scope: string): string[] {
  return walkFiles(path.join(workspaceRoot, scope)).filter((file) => file.endsWith('.xnl'));
}

describe('latest xnl-bundles DSL corpus', () => {
  it('parses every latest app fixture and shared prefab as XNL', () => {
    const files = [
      ...latestApps.flatMap((app) => xnlFiles(app)),
      ...xnlFiles('shared'),
    ];
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const doc = parseXnl(readFileSync(file, 'utf8'));
      expect(doc.nodes.length, `expected parseable XNL with nodes: ${file}`).toBeGreaterThan(0);
    }
  });

  it('uses manifest.xnl and canonical domain file names in migrated apps', () => {
    for (const app of migratedApps) {
      const root = path.join(workspaceRoot, app);
      const allFiles = walkFiles(root);
      expect(allFiles).toContain(path.join(root, 'manifest.xnl'));
      expect(allFiles.some((file) => path.basename(file) === 'bundle.xnl')).toBe(false);

      for (const file of allFiles.filter((candidate) => candidate.endsWith('.xnl'))) {
        const base = path.basename(file);
        expect(base, `old app/page/component-prefixed domain file: ${file}`).not.toMatch(/^(app|page|component)\./);
      }
    }
  });

  it('removes legacy manifest registry and every nameRef attribute from migrated apps', () => {
    for (const app of migratedApps) {
      for (const file of xnlFiles(app)) {
        const content = readFileSync(file, 'utf8');
        expect(content, `retired token remains in ${file}`).not.toMatch(retiredTokenPattern);
        expect(content, `Ref-suffixed attribute remains in ${file}`).not.toMatch(refSuffixedAttributePattern);
      }
    }
  });

  it('declares app and unit identity from manifest roots instead of paths', () => {
    const expectedAppRoots = {
      'basic-admin': '#dg.admin.basic.App',
      'embedded-admin': '#dg.admin.embedded.App',
      'import-admin': '#dg.admin.imports.App',
      'data-graph-admin': '#dg.admin.graph.App',
      'data-graph-counter': '#dg.demo.counter.App',
      'runtime-counter': '#dg.demo.runtime.App',
      'flow-showcase': '#dg.demo.flow.Showcase',
    };

    for (const app of latestApps) {
      const manifest = readFileSync(path.join(workspaceRoot, app, 'manifest.xnl'), 'utf8');
      expect(manifest).toContain('<AppBundle');
      expect(manifest).toContain(expectedAppRoots[app]);
      expect(manifest).toContain('<Units [');
      expect(manifest).toContain('src="vfs://');
    }
  });

  it('keeps flow-showcase on canonical depa-flows products and metadata', () => {
    const root = path.join(workspaceRoot, 'flow-showcase');
    const manifest = readFileSync(path.join(root, 'manifest.xnl'), 'utf8');
    const flowFiles = xnlFiles('flow-showcase').filter((file) => file !== path.join(root, 'manifest.xnl'));

    expect(manifest.match(/kind="instant-ctrl-flow"/g)).toHaveLength(2);
    expect(manifest.match(/kind="work-ctrl-flow"/g)).toHaveLength(1);
    expect(manifest.match(/kind="bp-ctrl-flow"/g)).toHaveLength(1);
    expect(manifest.match(/kind="eager-data-flow"/g)).toHaveLength(3);
    expect(manifest).not.toMatch(/kind="(?:ctrl-flow|data-flow)"/);
    for (const file of flowFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `canonical product root missing in ${file}`).toMatch(/^<(?:InstantCtrlFlow|WorkCtrlFlow|BPCtrlFlow|EagerDataFlow)\b/);
      expect(content, `apiVersion missing in ${file}`).toContain('apiVersion="depa.flows/v1"');
      expect(content, `version missing in ${file}`).toMatch(/\bversion="[^"]+"/);
      expect(content, `legacy Flow syntax remains in ${file}`).not.toMatch(
        /<(?:CtrlFlow|DataFlow)\b|ctrl-flow:\/\/|(?<!eager-)data-flow:\/\//,
      );
      if (/^<(?:InstantCtrlFlow|WorkCtrlFlow|BPCtrlFlow)\b/.test(content)) {
        expect(content.match(/<FlowContract\b/g), `CtrlFlow contract count in ${file}`).toHaveLength(1);
        expect(content, `CtrlFlow input type missing in ${file}`).toMatch(
          /\binput\s*=\s*"vfs:\/\/[^"]+#[A-Za-z_$][A-Za-z0-9_$]*"/,
        );
        expect(content, `CtrlFlow output type missing in ${file}`).toMatch(
          /\boutput\s*=\s*"vfs:\/\/[^"]+#[A-Za-z_$][A-Za-z0-9_$]*"/,
        );
      }
    }
  });

  it('keeps frontend pages free of route/mount/props ownership leaks', () => {
    const pageDomainFiles = latestApps
      .flatMap((app) => xnlFiles(app))
      .filter((file) => file.includes(`${path.sep}pages${path.sep}`));
    expect(pageDomainFiles.length).toBeGreaterThan(0);

    for (const file of pageDomainFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `route= must not appear in ${file}`).not.toMatch(/\broute\s*=/);
      expect(content, `mount= must not appear in ${file}`).not.toMatch(/\bmount\s*=/);
      expect(content, `<Props> must not appear in ${file}`).not.toMatch(/<Props[\s>{(]/);
    }
  });
});
