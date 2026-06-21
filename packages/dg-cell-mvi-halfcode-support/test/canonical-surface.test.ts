import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as support from '../src';

const ROOT = resolve(__dirname, '..');

describe('canonical support surface', () => {
  it('contains no retired browser schema/data/style, renderer effect, or expression modules', () => {
    for (const file of ['browserPorts.ts', 'effects.ts', 'expression.ts']) {
      expect(existsSync(resolve(ROOT, 'src', file)), file).toBe(false);
    }

    const index = readFileSync(resolve(ROOT, 'src/index.ts'), 'utf8');
    expect(index).not.toMatch(/\.\/(browserPorts|effects|expression)/);
  });

  it('keeps artifact and canonical app-runtime support at the package root', () => {
    expect(support.createMemoryArtifactPort).toBeTypeOf('function');
    expect(support.createHalfcodeAppRuntime).toBeTypeOf('function');
    expect(support.loadHalfcodeUnitBundle).toBeTypeOf('function');
  });
});
