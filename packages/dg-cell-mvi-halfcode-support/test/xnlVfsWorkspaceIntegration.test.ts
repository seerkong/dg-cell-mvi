import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MemoryRevisionedVfsAuthority,
  type RevisionedVfsAuthority,
} from 'xnl-vfs/revisioned-persistence';

const ROOT = resolve(__dirname, '../../..');
const SUPPORT_ROOT = resolve(__dirname, '..');
const XNL_PACKAGES_ROOT = resolve(ROOT, '../../lang/xnl.ts/packages');
const LOCKFILE = resolve(ROOT, 'bun.lock');
const supportRequire = createRequire(resolve(SUPPORT_ROOT, 'package.json'));
const vfsRequire = createRequire(supportRequire.resolve('xnl-vfs/revisioned-persistence'));

const XNL_WORKSPACES = {
  'xnl-core': 'core',
  'xnl-collab-core': 'collab-core',
  'xnl-vfs': 'vfs',
} as const;
const XNL_WORKSPACE_REFERENCES = {
  'xnl-core': '../../lang/xnl.ts/packages/core',
  'xnl-collab-core': '../../lang/xnl.ts/packages/collab-core',
  'xnl-vfs': '../../lang/xnl.ts/packages/vfs',
} as const;

function readJson(path: string): {
  readonly version?: string;
  readonly workspaces?: readonly string[];
  readonly dependencies?: Readonly<Record<string, string>>;
} {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function resolvedPackageRoot(packageName: keyof typeof XNL_WORKSPACES): string {
  const specifier = packageName === 'xnl-vfs'
    ? 'xnl-vfs/revisioned-persistence'
    : packageName;
  const packageRequire = packageName === 'xnl-collab-core' ? vfsRequire : supportRequire;
  return realpathSync(resolve(dirname(packageRequire.resolve(specifier)), '..'));
}

function gitCheckIgnore(path: string): string {
  try {
    return execFileSync('git', ['check-ignore', '-v', '--', path], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      error.status === 1
    ) {
      return '';
    }
    throw error;
  }
}

function lockWorkspaceSection(lockfile: string, workspaceReference: string): string {
  const escapedReference = workspaceReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = lockfile.match(new RegExp(
    `^    "${escapedReference}": \\{[\\s\\S]*?^    \\},`,
    'm',
  ));
  expect(match, `missing bun.lock workspace section for ${workspaceReference}`).not.toBeNull();
  return match?.[0] ?? '';
}

describe('local xnl-vfs workspace integration', () => {
  it('keeps the canonical Bun workspace lock present and eligible for version control', () => {
    expect(existsSync(LOCKFILE)).toBe(true);
    expect(gitCheckIgnore('bun.lock')).toBe('');
  });

  it('resolves root workspaces and the support dependency graph to the local xnl packages', () => {
    const rootPackage = readJson(resolve(ROOT, 'package.json'));
    const supportPackage = readJson(resolve(SUPPORT_ROOT, 'package.json'));

    for (const [packageName, directory] of Object.entries(XNL_WORKSPACES)) {
      const workspaceReference = `../../lang/xnl.ts/packages/${directory}`;
      const expectedRoot = realpathSync(resolve(XNL_PACKAGES_ROOT, directory));
      expect(rootPackage.workspaces).toContain(workspaceReference);
      expect(resolvedPackageRoot(packageName as keyof typeof XNL_WORKSPACES)).toBe(expectedRoot);
    }

    expect(supportPackage.dependencies).toMatchObject({
      'xnl-core': 'workspace:^',
      'xnl-vfs': 'workspace:^',
    });
    expect(supportPackage.dependencies).not.toHaveProperty('xnl-vcs');
    expect(readJson(resolve(XNL_PACKAGES_ROOT, 'vfs/package.json')).dependencies).toMatchObject({
      'xnl-collab-core': readJson(resolve(XNL_PACKAGES_ROOT, 'collab-core/package.json')).version,
      'xnl-core': readJson(resolve(XNL_PACKAGES_ROOT, 'core/package.json')).version,
    });
  });

  it('locks one local xnl-core instance and all three packages as workspace resolutions', () => {
    const lockfile = readFileSync(LOCKFILE, 'utf8');
    const xnlCoreVersion = readJson(resolve(XNL_PACKAGES_ROOT, 'core/package.json')).version;
    const dependencyTree = execFileSync('bun', ['pm', 'ls', '--all'], {
      cwd: ROOT,
      encoding: 'utf8',
    });

    for (const [packageName, workspaceReference] of Object.entries(XNL_WORKSPACE_REFERENCES)) {
      const workspaceSection = lockWorkspaceSection(lockfile, workspaceReference);
      expect(workspaceSection).toContain(`"name": "${packageName}",`);
      if (packageName === 'xnl-core') {
        expect(workspaceSection).toContain(`"version": "${xnlCoreVersion}",`);
      }
      expect(lockfile).toContain(`"${packageName}": ["${packageName}@workspace:${workspaceReference}"]`);
      expect(dependencyTree).toContain(
        `${packageName}@workspace:${workspaceReference}`,
      );
    }

    expect(xnlCoreVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lockfile.match(/^    "xnl-core": \[/gm)).toHaveLength(1);
    expect(lockfile.match(/^\s*"xnl-core": \["xnl-core@workspace:[^"]+"\],$/gm)).toHaveLength(1);
    expect(lockfile).not.toContain('"xnl-core": ["xnl-core@npm:');
    expect(lockfile).not.toMatch(/"xnl-core": \["xnl-core@\d/);
    expect(dependencyTree.match(/xnl-core@workspace:/g)).toHaveLength(1);
    expect(lockfile).not.toContain('xnl-vcs');
    expect(dependencyTree).not.toContain('xnl-vcs');
  });

  it('loads the browser-safe revisioned-persistence entry through ESM and CJS', async () => {
    const esmModule = await import('xnl-vfs/revisioned-persistence');
    const cjsModule = supportRequire('xnl-vfs/revisioned-persistence') as Record<string, unknown>;
    const typedAuthorityConstructor: new (...args: never[]) => RevisionedVfsAuthority =
      MemoryRevisionedVfsAuthority as never;

    expect(esmModule.MemoryRevisionedVfsAuthority).toBeTypeOf('function');
    expect(esmModule.applyRevisionedVfsMutations).toBeTypeOf('function');
    expect(cjsModule.MemoryRevisionedVfsAuthority).toBeTypeOf('function');
    expect(cjsModule.applyRevisionedVfsMutations).toBeTypeOf('function');
    expect(typedAuthorityConstructor).toBeTypeOf('function');
    expect(() => supportRequire.resolve('xnl-vcs')).toThrow();
  });
});
