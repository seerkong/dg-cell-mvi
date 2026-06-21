/**
 * admin.shell-state · suite `actors` · case `no-pinia`.
 *
 * The shell state SHALL NOT be carried by Pinia/Vuex (decisions §4 铁律). We assert the dependency
 * manifests of the three admin-* packages declare neither pinia nor vuex — the structural guarantee
 * that the four data-ownership actors run on `dg-cell-mvi-core`, not a Vue store library.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(here, '..', '..'); // .../frontend/packages

const ADMIN_PKGS = ['dg-cell-mvi-admin-contract', 'dg-cell-mvi-admin-logic', 'dg-cell-mvi-admin-support'];

function depNames(pkgDir: string): string[] {
  const json = JSON.parse(readFileSync(path.join(packagesDir, pkgDir, 'package.json'), 'utf8'));
  return [
    ...Object.keys(json.dependencies ?? {}),
    ...Object.keys(json.devDependencies ?? {}),
    ...Object.keys(json.peerDependencies ?? {}),
  ];
}

describe('no-pinia: admin-* shell state never depends on pinia/vuex', () => {
  for (const pkg of ADMIN_PKGS) {
    it(`${pkg} declares neither pinia nor vuex`, () => {
      const deps = depNames(pkg);
      expect(deps).not.toContain('pinia');
      expect(deps).not.toContain('vuex');
    });
  }
});
