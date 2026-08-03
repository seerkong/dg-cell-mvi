import { describe, expect, it } from 'vitest';
import {
  HALFCODE_BUILTIN_SCHEMES,
  HALFCODE_REF_UNRESOLVED,
  HALFCODE_SCHEME_TABLE,
  HALFCODE_UNIT_FQN_PARSE_ERROR,
  HALFCODE_UNIT_REGISTRY_DOMAIN,
  HalfcodeUnitContractError,
  canonicalDomainForDomain,
  domainToScheme,
  parseHalfcodeRef,
  parseUnitFqn,
  schemeToDomain,
  schemesForDomain,
  sectionTagForDomain,
} from '../src';

describe('parseHalfcodeRef', () => {
  it('parses hierarchical path refs', () => {
    expect(parseHalfcodeRef('route://reports/:id')).toEqual({
      scheme: 'route',
      path: 'reports/:id',
    });
    expect(parseHalfcodeRef('page://dg.admin.basic.UsersPage')).toEqual({
      scheme: 'page',
      path: 'dg.admin.basic.UsersPage',
    });
  });

  it('parses node id refs', () => {
    expect(parseHalfcodeRef('scope://#users-filter')).toEqual({
      scheme: 'scope',
      id: 'users-filter',
    });
    expect(parseHalfcodeRef('scope-effect://#users.query')).toEqual({
      scheme: 'scope-effect',
      id: 'users.query',
    });
    expect(parseHalfcodeRef('scope-runtime://#users-page')).toEqual({
      scheme: 'scope-runtime',
      id: 'users-page',
    });
  });

  it('parses id + sub-path refs, with "/" as the only structural separator', () => {
    expect(parseHalfcodeRef('config://#users-filter/keywordInput')).toEqual({
      scheme: 'config',
      id: 'users-filter',
      subPath: 'keywordInput',
    });
    expect(parseHalfcodeRef('config://#users-filter/toolbar/search')).toEqual({
      scheme: 'config',
      id: 'users-filter',
      subPath: 'toolbar/search',
    });
  });

  it('allows dots inside ids (FQN-style command ids), never as sub-path separators', () => {
    expect(parseHalfcodeRef('command://#users.search')).toEqual({
      scheme: 'command',
      id: 'users.search',
    });
    // `.` carries no structural meaning outside FQNs: this is one id, not id+sub-path.
    expect(parseHalfcodeRef('config://#a.b')).toEqual({ scheme: 'config', id: 'a.b' });
  });

  it('passes vfs refs through verbatim without structural interpretation', () => {
    expect(parseHalfcodeRef('vfs://./pages/users/')).toEqual({
      scheme: 'vfs',
      path: './pages/users/',
    });
    expect(parseHalfcodeRef('vfs://@/shared/badge.xnl')).toEqual({
      scheme: 'vfs',
      path: '@/shared/badge.xnl',
    });
    // Even '#' stays part of the raw body for vfs.
    expect(parseHalfcodeRef('vfs://./page.config.xnl#frag')).toEqual({
      scheme: 'vfs',
      path: './page.config.xnl#frag',
    });
  });

  it.each([
    ['', 'empty string'],
    ['scope', 'no ://'],
    ['scope:users-page', 'retired <scheme>:<name> form'],
    ['config:a.b', 'retired dotted sub-path form'],
    ['://#x', 'empty scheme'],
    ['Config://#x', 'uppercase scheme'],
    ['config://', 'empty body'],
    ['config://#', 'empty id'],
    ['config://#id//x', 'empty sub-path segment'],
    ['config://#id/', 'trailing empty sub-path'],
    ['route://a//b', 'empty path segment'],
    ['config://a#b', 'anchor not directly after ://'],
    ['config:// a', 'whitespace'],
  ])('rejects malformed ref %j (%s) with HALFCODE_REF_UNRESOLVED', (input) => {
    expect(() => parseHalfcodeRef(input)).toThrowError(HalfcodeUnitContractError);
    try {
      parseHalfcodeRef(input);
    } catch (error) {
      expect((error as HalfcodeUnitContractError).code).toBe(HALFCODE_REF_UNRESOLVED);
    }
  });
});

describe('parseUnitFqn', () => {
  it('parses dot-separated FQNs into namespace + name', () => {
    expect(parseUnitFqn('dg.materials.CrudTable')).toEqual({
      fqn: 'dg.materials.CrudTable',
      namespace: ['dg', 'materials'],
      name: 'CrudTable',
    });
    expect(parseUnitFqn('elementPlus.ElInput').name).toBe('ElInput');
  });

  it.each([
    ['', 'empty string'],
    ['CrudTable', 'no namespace'],
    ['dg..CrudTable', 'empty segment'],
    ['.dg.CrudTable', 'leading dot'],
    ['dg.materials.', 'trailing dot'],
    ['dg.materials.Crud-Table', 'non-identifier segment'],
    ['dg.materials.Crud Table', 'whitespace'],
  ])('rejects malformed FQN %j (%s) with a coded error', (input) => {
    expect(() => parseUnitFqn(input)).toThrowError(HalfcodeUnitContractError);
    try {
      parseUnitFqn(input);
    } catch (error) {
      expect((error as HalfcodeUnitContractError).code).toBe(HALFCODE_UNIT_FQN_PARSE_ERROR);
    }
  });
});

describe('HALFCODE_SCHEME_TABLE', () => {
  it('pairs every main domain with its def companion scheme', () => {
    const mains = HALFCODE_SCHEME_TABLE.filter((entry) => entry.defScheme !== undefined);
    expect(mains.map((entry) => entry.scheme).sort()).toEqual(
      ['command', 'config', 'contract', 'event'].sort(),
    );
    for (const main of mains) {
      const def = HALFCODE_SCHEME_TABLE.find((entry) => entry.scheme === main.defScheme);
      expect(def, `def companion for ${main.domain}`).toBeDefined();
      expect(def?.defOf).toBe(main.scheme);
      expect(def?.layers).toEqual(main.layers);
    }
    // No dangling def rows: every defOf points back at a main with matching defScheme.
    for (const def of HALFCODE_SCHEME_TABLE.filter((entry) => entry.defOf !== undefined)) {
      const main = HALFCODE_SCHEME_TABLE.find((entry) => entry.scheme === def.defOf);
      expect(main?.defScheme).toBe(def.scheme);
    }
  });

  it('marks app-exclusive domains as app-only', () => {
    for (const domain of ['routes', 'product', 'wiring']) {
      const entry = HALFCODE_SCHEME_TABLE.find((row) => row.domain === domain);
      expect(entry?.layers, domain).toEqual(['app']);
    }
  });

  it('gives every file-backed schemed domain a single-file section tag', () => {
    for (const entry of HALFCODE_SCHEME_TABLE) {
      if (entry.scheme !== null && !entry.derived) {
        expect(entry.sectionTag, `sectionTag for scheme ${entry.scheme}`).toBeTruthy();
      }
    }
  });

  it('contains the canonical runtime and data graph schemes without type catalogs', () => {
    expect(schemeToDomain('runtime')).toBe('runtime');
    expect(schemeToDomain('data-graph')).toBe('data.graph');
    expect(schemeToDomain('data-graph-seed')).toBe('data.graph.seed');
    expect(schemeToDomain('scope-runtime')).toBe('scope.runtime');
    expect(schemeToDomain('scope-effect')).toBe('scope.effects');
    expect(schemeToDomain('scope-data-graph')).toBe('scope.data.graph');
    expect(schemeToDomain('effect-type')).toBeNull();
    expect(schemeToDomain('data-graph-logic-type')).toBeNull();
  });

  it('keeps only canonical domains in the scheme table', () => {
    expect(canonicalDomainForDomain('config')).toBe('config');
    expect(canonicalDomainForDomain('commands')).toBe('commands');
    expect(HALFCODE_SCHEME_TABLE.every((entry) => !('legacy' in entry))).toBe(true);
  });

  it('keeps scheme names unique and contains the built-in schemes', () => {
    const schemes = HALFCODE_SCHEME_TABLE
      .map((entry) => entry.scheme)
      .filter((scheme): scheme is string => scheme !== null);
    expect(new Set(schemes).size).toBe(schemes.length);
    expect(schemes).not.toContain('vfs');
    for (const builtin of HALFCODE_BUILTIN_SCHEMES) {
      const entry = HALFCODE_SCHEME_TABLE.find((row) => row.scheme === builtin);
      expect(entry?.builtin, builtin).toBe(true);
    }
  });

  it('keeps projection domains scheme-less and section-less', () => {
    for (const domain of ['workspace', 'fixtures']) {
      const entry = HALFCODE_SCHEME_TABLE.find((row) => row.domain === domain);
      expect(entry?.projection).toBe(true);
      expect(entry?.scheme).toBeNull();
      expect(entry?.sectionTag).toBeNull();
    }
  });

  it('answers domain/scheme/section lookups from the single table', () => {
    expect(domainToScheme('config')).toBe('config');
    expect(domainToScheme('elements')).toBeNull();
    expect(schemeToDomain('config-def')).toBe('config.def');
    expect(schemeToDomain('unknown')).toBeNull();
    expect(sectionTagForDomain('wiring')).toBe('Wiring');
    // The built-in unit registry exposes frontend refs plus the real eager subflow ref.
    expect(schemesForDomain(HALFCODE_UNIT_REGISTRY_DOMAIN).sort()).toEqual([
      'component',
      'document',
      'eager-data-flow',
      'page',
    ]);
    expect(domainToScheme(HALFCODE_UNIT_REGISTRY_DOMAIN)).toBeNull();
  });
});
