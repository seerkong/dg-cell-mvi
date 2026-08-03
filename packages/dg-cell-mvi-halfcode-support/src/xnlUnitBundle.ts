/**
 * Canonical AppBundle loader.
 *
 * Loads an `AppBundle` manifest, discovers its domains by content, resolves
 * its Unit registry, and projects frontend or Flow units into structured,
 * non-executable plans.
 *
 * The loader only parses and resolves references; it never executes adapters
 * or dynamic code.
 */

import {
  XNL,
  parseXnl,
  wordToString,
  type DataElementNode,
  type ImportSymbols,
  type ImportResolver,
  type ResolveImportsOptions,
  type XnlDocument,
  type XnlNode,
} from 'xnl-core';
import { loadEagerDataFlowSources } from 'eager-data-flow-logic/browser';
import { loadFlowBundleFromSources } from 'instant-ctrl-flow-logic/browser';
import {
  HALFCODE_DOCUMENT_DSL_INVALID,
  HALFCODE_MESSAGE_DSL_INVALID,
  HALFCODE_REF_PRIVACY_VIOLATION,
  HALFCODE_RUNTIME_DSL_UNSUPPORTED,
  HALFCODE_REF_UNRESOLVED,
  HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
  HALFCODE_SCHEME_TABLE,
  HALFCODE_UNIT_DIAGNOSTIC_SEVERITY,
  HALFCODE_UNIT_FQN_CONFLICT,
  HALFCODE_UNIT_KIND_MISMATCH,
  HALFCODE_UNIT_NOT_FOUND,
  HALFCODE_UNIT_REGISTRY_DOMAIN,
  FRONTEND_UNIT_KINDS,
  UNIT_KINDS,
  asHalfcodeRef,
  asUnitFqn,
  assertNever,
  canonicalDomainForDomain,
  isFlowUnitKind,
  isFrontendUnitKind,
  isUnitKind,
  parseHalfcodeRef,
  schemeTableEntry,
  type UnitLayer,
  type ComponentContractSpec,
  type CallableEffectBindingsSpec,
  type DataGraphBindingsSpec,
  type DataGraphLogicKind,
  type DocumentContractSpec,
  type DocumentPresentationSpec,
  type DocumentSourceDescriptor,
  type EagerDataFlowDiagnostic,
  type EagerDataFlowRegistry,
  type ElementsSpec,
  type FlowDiagnostic,
  type FlowUnitKind,
  type FrontendUnitKind,
  type HalfcodeFlowSpec,
  type MessagePolicySpec,
  type MessageRefSpec,
  type HalfcodeProductSpec,
  type HalfcodeRef,
  type HalfcodeUnitDiagnosticCode,
  type HalfcodeUnitManifest,
  type PageContractSpec,
  type RequiresSpec,
  type RuntimeInstanceSpec,
  type RuntimeScopeBindingSpec,
  type RuntimeSpec,
  type RouteMenuSpec,
  type RouteSpec,
  type SlotDefSpec,
  type SlotSpec,
  type ScopeUseSpec,
  type UnitContractSpec,
  type UnitDomainNodeSpec,
  type UnitDomainRegistration,
  type AppBundleUnitRef,
  type UnitElementContractSpec,
  type UnitElementNode,
  type UnitInstanceElement,
  type UnitFqn,
  type UnitKind,
  type UrlInputsSpec,
  type WireSpec,
  validateEventSpec,
  validateDocumentContract,
  validateRuntimeInstanceSpec,
} from 'dg-cell-mvi-halfcode-contract';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Loader-local filesystem boundary. `readDir` is optional because packaged
 * bundles can provide content-discovery filenames through domainFileInventory.
 */
export interface HalfcodeUnitBundleResolver extends Omit<ImportResolver, 'readDir'> {
  readDir?: ImportResolver['readDir'];
}

/**
 * Explicit content-discovery inventory for a packaged/read-only bundle.
 * Keys are container VFS directories and values are direct `<domain>.xnl`
 * filenames in that directory; the manifest file itself is not listed.
 */
export type HalfcodeDomainFileInventory = Readonly<Record<string, readonly string[]>>;

/** Diagnostic shape follows the v2 compiler style: code/message/path. */
export interface HalfcodeUnitBundleDiagnostic {
  severity: 'warning' | 'error';
  code: HalfcodeUnitDiagnosticCode;
  message: string;
  path?: string;
}

/**
 * Parsed domain document, same style as the v2 HalfcodeXnlDomainDocument.
 * Additionally carries `nodes` — the structured contract-level projection of
 * the document tree (UnitDomainNodeSpec), which makes this shape structurally
 * assignable to the compiler's UnitCompileDomainDocument (G4: the compiler
 * reads `nodes` and never re-walks raw XNL).
 */
export interface HalfcodeUnitDomainDocument {
  domain: string;
  /** Registered name (multi-file) or section tag (single-file). */
  name?: string;
  role?: 'input' | 'output';
  /** Physical file path; for single-file sections, the unit file path. */
  path: string;
  tag: string;
  id?: string;
  data: Record<string, unknown>;
  /** Structured projection of the document's top-level nodes (root included). */
  nodes: UnitDomainNodeSpec[];
  xnlDocument: XnlDocument;
}

export type HalfcodeUnitForm = 'folder' | 'single-file';

/** Raw XNL source retained without an HTML, DOM, editor, or writer projection. */
export interface HalfcodeDocumentRawSource {
  readonly path: string;
  readonly text: string;
  readonly xnlDocument: XnlDocument;
}

/** Ordered renderer-neutral assembly view of one inline Document body node. */
export interface HalfcodeDocumentSkeletonNode {
  readonly kind: 'domain-node' | 'component-embed' | 'capsule' | 'document-embed';
  readonly tag: string;
  readonly id?: string;
  readonly xId?: string;
  readonly projectionRole?: string;
  readonly scopeId?: string;
  readonly scope?: RuntimeScopeBindingSpec;
  readonly inlineProps?: Readonly<Record<string, unknown>>;
  readonly children: readonly HalfcodeDocumentSkeletonNode[];
}

/**
 * Document-specific loaded projection. Optional structural fields allow an
 * invalid definition to remain inspectable alongside error diagnostics.
 */
export interface LoadedHalfcodeDocumentProjection {
  readonly sourceDescriptor?: DocumentSourceDescriptor;
  readonly definitionSource: HalfcodeDocumentRawSource;
  readonly rawSource: HalfcodeDocumentRawSource;
  readonly contract?: DocumentContractSpec;
  readonly rootNodeId: string;
  readonly rootScope?: RuntimeScopeBindingSpec;
  readonly presentation?: DocumentPresentationSpec;
  readonly skeleton: readonly HalfcodeDocumentSkeletonNode[];
}

/** Both unit forms load into this same shape (D10). */
export interface LoadedHalfcodeUnit {
  fqn: UnitFqn;
  kind: UnitKind;
  form: HalfcodeUnitForm;
  /** Resolved physical path (folder or .xnl file). */
  path: string;
  manifest: HalfcodeUnitManifest;
  domains: Record<string, HalfcodeUnitDomainDocument>;
  elements?: ElementsSpec;
  contract?: UnitContractSpec;
  /** Present only for Document units; never lowered into ElementsSpec. */
  document?: LoadedHalfcodeDocumentProjection;
  runtime?: RuntimeSpec;
  scopeRuntimeBindings: RuntimeScopeBindingSpec[];
  /** Parse/validate/project-only Flow representation. Never contains executable code. */
  flow?: HalfcodeFlowSpec;
}

export interface HalfcodeUnitRegistryEntry {
  fqn: UnitFqn;
  kind: UnitKind;
  path: string;
}

export type HalfcodeUnitRegistry = Record<string, HalfcodeUnitRegistryEntry>;

export interface HalfcodeUnitBundleManifest {
  id: string;
  version?: string;
  apiVersion: string;
  /** Content-discovered app domains, projected for inspection only. */
  domains: UnitDomainRegistration[];
  /** Canonical AppBundle Unit registrations. */
  units: AppBundleUnitRef[];
}

/**
 * AppBundle unit registration (`<Unit kind fqn src>`, spec/frontend/nodes.md §2).
 * The registration carries the registry FQN and `src` points at the unit
 * manifest file (or single-file unit).
 */
export interface LoadedHalfcodeUnitBundleApp {
  product?: HalfcodeProductSpec;
  routes: RouteSpec[];
  wiring: WireSpec[];
  domains: Record<string, HalfcodeUnitDomainDocument>;
}

export interface LoadedHalfcodeUnitBundle {
  manifest: HalfcodeUnitBundleManifest;
  manifestPath: string;
  app: LoadedHalfcodeUnitBundleApp;
  units: Record<string, LoadedHalfcodeUnit>;
  registry: HalfcodeUnitRegistry;
  diagnostics: HalfcodeUnitBundleDiagnostic[];
}

export function resolveUnitConfigRef(unit: LoadedHalfcodeUnit, ref: HalfcodeRef | string): unknown {
  const parsed = parseHalfcodeRef(String(ref));
  if (parsed.scheme !== 'config' || !parsed.id) {
    throw new Error(`Halfcode unit config resolver expects config://#<id>, received: ${ref}`);
  }

  const found = findConfigNode(unit.domains.config?.nodes ?? [], parsed.id);
  if (!found) throw new Error(`Config entry #${parsed.id} not found in ${unit.fqn}`);

  let current: unknown = found.data;
  for (const segment of parsed.subPath?.split('/') ?? []) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function findConfigNode(
  nodes: readonly UnitDomainNodeSpec[],
  id: string,
): UnitDomainNodeSpec | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findConfigNode(node.children ?? [], id);
    if (child) return child;
  }
  return undefined;
}

export interface LoadHalfcodeUnitBundleOptions extends Partial<ResolveImportsOptions> {
  manifestFile?: string;
  /**
   * Optional replacement for resolver.readDir during content-based domain
   * discovery. Entries are keyed by normalized container directory.
   */
  domainFileInventory?: HalfcodeDomainFileInventory;
  /**
   * Namespace prefixes of external UI libraries (e.g. ['elementPlus']).
   * Dotted element tags under these namespaces resolve through the render
   * adapter's UI registry (spec §3), so the loader skips the unit-registry
   * existence check for them.
   */
  uiLibraries?: string[];
}

// ---------------------------------------------------------------------------
// XNL helpers (same conventions as the v2 loader)
// ---------------------------------------------------------------------------

const REF_LIKE_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*:\/\//;
const REF_SUFFIXED_ATTRIBUTE_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*Ref$/;

function isDataElement(value: unknown): value is DataElementNode {
  return !!value && typeof value === 'object' && (value as DataElementNode).kind === 'DataElement';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) && !isDataElement(value);
}

function normalizeAbsolutePath(path: string): string {
  const segments: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return `/${segments.join('/')}`;
}

function dirname(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? '/' : normalized.slice(0, index);
}

function basename(path: string): string {
  const normalized = normalizeAbsolutePath(path);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function joinPath(base: string, child: string): string {
  return normalizeAbsolutePath(`${base.replace(/\/$/, '')}/${child}`);
}

function assertXnlConfigPath(path: string, role: string): void {
  if (/\.(json|xml)$/i.test(path)) {
    throw new Error(`Halfcode unit bundle does not accept JSON/XML config for ${role}: ${path}`);
  }
  if (!path.endsWith('.xnl')) {
    throw new Error(`Halfcode unit bundle ${role} must be an .xnl file: ${path}`);
  }
}

function resolveVfs(src: string, options: ResolveImportsOptions): string {
  if (src.startsWith('vfs://')) {
    return XNL.import.resolveVfsSrc(src, options);
  }
  if (src.startsWith('/')) return normalizeAbsolutePath(src);
  return joinPath(options.baseDir, src);
}

function toWorkspaceRootVfsRef(path: string, workspaceRoot: string): HalfcodeRef {
  const normalizedPath = normalizeAbsolutePath(path);
  const normalizedRoot = normalizeAbsolutePath(workspaceRoot);
  const rootPrefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;

  if (!normalizedPath.startsWith(rootPrefix)) {
    throw new Error(
      `Halfcode unit source is outside workspace root "${normalizedRoot}": ${normalizedPath}`,
    );
  }

  return asHalfcodeRef(`vfs://@/${normalizedPath.slice(rootPrefix.length)}`);
}

function readRequiredFile(resolver: HalfcodeUnitBundleResolver, path: string): string {
  const content = resolver.readFile(path);
  if (content == null) throw new Error(`Halfcode unit bundle file not found: ${path}`);
  return content;
}

function firstDataElement(doc: XnlDocument): DataElementNode | undefined {
  // Imports are file prelude declarations, never a domain/container root.
  return doc.nodes.find(
    (node): node is DataElementNode => isDataElement(node) && node.tag !== 'Imports',
  );
}

function extendChild(node: DataElementNode, tag: string): DataElementNode | undefined {
  const child = node.extend?.children?.[tag];
  return isDataElement(child) ? child : undefined;
}

function bodyDataElements(node: DataElementNode | undefined): DataElementNode[] {
  if (!node?.body) return [];
  return node.body.filter(isDataElement);
}

function stringAttr(node: DataElementNode, key: string): string | undefined {
  const value = node.attributes?.[key] ?? node.metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

function requiredStringAttr(node: DataElementNode, key: string, label: string): string {
  const value = stringAttr(node, key);
  if (!value) throw new Error(`${label} requires ${key}`);
  return value;
}

function nodeId(node: DataElementNode): string | undefined {
  return wordToString(node.id);
}

function requiredNodeId(node: DataElementNode, label: string): string {
  const id = nodeId(node);
  if (!id) throw new Error(`${label} requires an #id`);
  return id;
}

function valueToPlain(value: XnlNode): unknown {
  if (isDataElement(value)) {
    return {
      tag: value.tag,
      id: nodeId(value),
      ...attrsToPlain({ ...value.metadata, ...(value.attributes ?? {}) }),
      ...(value.body ? { children: value.body.map(valueToPlain) } : {}),
    };
  }
  if (Array.isArray(value)) return value.map(valueToPlain);
  if (isPlainObject(value)) return attrsToPlain(value as Record<string, XnlNode>);
  return value;
}

function attrsToPlain(attrs: Record<string, XnlNode>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, valueToPlain(value)]));
}

/** Deep-walk every DataElement in a document: body, extend sections, attribute values. */
function walkDataElements(root: XnlNode | undefined, visit: (node: DataElementNode) => void): void {
  if (!root) return;
  if (isDataElement(root)) {
    visit(root);
    for (const child of Object.values(root.metadata ?? {})) walkDataElements(child, visit);
    for (const child of Object.values(root.attributes ?? {})) walkDataElements(child, visit);
    for (const child of root.body ?? []) walkDataElements(child, visit);
    for (const child of Object.values(root.extend?.children ?? {})) walkDataElements(child, visit);
    return;
  }
  if (Array.isArray(root)) {
    for (const child of root) walkDataElements(child, visit);
    return;
  }
  if (isPlainObject(root)) {
    for (const child of Object.values(root)) walkDataElements(child as XnlNode, visit);
  }
}

function parseCanonicalXnl(content: string, path: string): XnlDocument {
  const document = parseXnl(content);
  for (const root of document.nodes) {
    walkDataElements(root, (node) => {
      for (const key of Object.keys({ ...(node.metadata ?? {}), ...(node.attributes ?? {}) })) {
        if (!REF_SUFFIXED_ATTRIBUTE_PATTERN.test(key)) continue;
        const bare = key.slice(0, -'Ref'.length);
        throw new Error(
          `Canonical Halfcode XNL attribute "${key}" is retired; use bare "${bare}" or <${node.tag} ref="...">: ${path}`,
        );
      }
    });
  }
  return document;
}

/**
 * xnl-core imports direct exports and Prefabs nested on a host node. Halfcode
 * prefab packages also allow a document-level <Prefabs> root, so expose those
 * nodes through the same structured loader shape before import resolution.
 */
function exposeDocumentPrefabs(content: string): string {
  const document = parseXnl(content);
  const prefabRoots = document.nodes.filter(
    (node): node is DataElementNode => isDataElement(node) && node.tag === 'Prefabs',
  );
  const prefabs = prefabRoots.flatMap((root) => bodyDataElements(root));
  if (!prefabs.length) return content;

  const prefabHost: DataElementNode = {
    kind: 'DataElement',
    tag: 'HalfcodeImportedPrefabs',
    metadata: {},
    attributes: {},
    extend: {
      order: ['Prefabs'],
      children: {
        Prefabs: {
          kind: 'DataElement',
          tag: 'Prefabs',
          metadata: {},
          attributes: {},
          body: prefabs,
        },
      },
    },
  };
  return XNL.stringifyLineBlock({ ...document, nodes: [...document.nodes, prefabHost] });
}

function prefabAwareImportResolver(resolver: HalfcodeUnitBundleResolver): ImportResolver {
  return {
    readFile(path) {
      const content = resolver.readFile(path);
      return content == null ? null : exposeDocumentPrefabs(content);
    },
    isDir: (path) => resolver.isDir(path),
    readDir: (path) => resolver.readDir?.(path) ?? null,
  };
}

function importedPrototypeContext(symbols: ImportSymbols): {
  prototypes: Record<string, Record<string, DataElementNode>>;
} {
  const prototypes: Record<string, Record<string, DataElementNode>> = {};
  for (const namespace of Object.values(symbols)) {
    for (const [name, symbol] of Object.entries(namespace)) {
      if (!isDataElement(symbol)) continue;
      const byName = (prototypes[symbol.tag] ??= {});
      byName[name] ??= symbol;
    }
  }
  return { prototypes };
}

function parseCanonicalLoadedXnl(
  resolver: HalfcodeUnitBundleResolver,
  content: string,
  path: string,
  workspaceRoot: string,
): XnlDocument {
  const document = parseCanonicalXnl(content, path);
  const imported = XNL.import.resolve(document, prefabAwareImportResolver(resolver), {
    baseDir: dirname(path),
    workspaceRoot,
  });
  const context = importedPrototypeContext(imported.symbols);
  return {
    ...document,
    nodes: document.nodes.map((node) => (
      isDataElement(node) ? XNL.loader.loadNode(context, node, []) : node
    )),
  };
}

/** Collect every string value in ref form (`<scheme>://...`) from a value tree. */
function collectRefStrings(value: XnlNode | undefined, out: string[]): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (REF_LIKE_PATTERN.test(value)) out.push(value);
    return;
  }
  if (typeof value !== 'object') return;
  if (isDataElement(value)) {
    for (const child of Object.values(value.metadata ?? {})) collectRefStrings(child, out);
    for (const child of Object.values(value.attributes ?? {})) collectRefStrings(child, out);
    for (const child of value.body ?? []) collectRefStrings(child, out);
    for (const child of Object.values(value.extend?.children ?? {})) collectRefStrings(child, out);
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectRefStrings(child, out);
    return;
  }
  if (isPlainObject(value)) {
    for (const child of Object.values(value)) collectRefStrings(child as XnlNode, out);
  }
}

// ---------------------------------------------------------------------------
// Scheme table lookups
// ---------------------------------------------------------------------------

const PROJECTION_DOMAINS = new Set(
  HALFCODE_SCHEME_TABLE.filter((entry) => entry.projection).map((entry) => entry.domain),
);

/**
 * Scope-derived refs require the lexical scope chain of their use site. The
 * generic document ref pass has no such tree projection, so it validates only
 * their URI grammar and defers semantic visibility to a family-specific
 * resolver (for example resolveScopeRuntimeRef).
 */
const SCOPE_DERIVED_SCHEMES = new Set(['scope-runtime', 'scope-data-graph', 'scope-effect']);

// ---------------------------------------------------------------------------
// New-vocabulary (AppBundle) scheme table views
// ---------------------------------------------------------------------------

/** apiVersion of the new AppBundle vocabulary (spec/frontend/nodes.md §2). */
export const HALFCODE_APP_BUNDLE_API_VERSION = 'halfcode.dg-cell-mvi/v1';

/**
 * Canonical (non-derived) scheme table rows: the domains that can
 * exist as `<域名>.xnl` files and be discovered by content (files.md §1/§3).
 * The built-in unit registry pseudo-domain has no file form.
 */
const CANONICAL_DOMAIN_ROWS = HALFCODE_SCHEME_TABLE.filter(
  (entry) => !entry.derived && entry.domain !== HALFCODE_UNIT_REGISTRY_DOMAIN,
);

const DISCOVERABLE_DOMAINS = new Map(CANONICAL_DOMAIN_ROWS.map((entry) => [entry.domain, entry]));

/**
 * Section tag → canonical domain for the single-file forms (M-N6).
 */
const CANONICAL_SECTION_TAG_TO_DOMAIN = new Map<string, string>(
  CANONICAL_DOMAIN_ROWS.filter(
    (entry) => entry.sectionTag !== null && !entry.projection && entry.sectionTag !== 'Units',
  ).map((entry) => [entry.sectionTag as string, entry.domain]),
);

/** PascalCase projection of a domain name: `data.graph.seed` → `DataGraphSeed` (files.md §1). */
function pascalCaseDomain(domain: string): string {
  return domain
    .split('.')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

/**
 * Content-based domain discovery (files.md §3): scan a container directory for
 * `<域名>.xnl` files whose stem is a canonical scheme-table domain enabled on
 * this layer. The file's root tag must equal PascalCase(domain) (one name,
 * three projections, M-N2); a mismatching root means the domain is NOT
 * enabled and is reported instead of silently ignored. Projection domains
 * (workspace/fixtures) have no root-tag projection and are loaded as-is.
 */
function discoverDomainDocuments(
  resolver: HalfcodeUnitBundleResolver,
  dir: string,
  workspaceRoot: string,
  layer: UnitLayer,
  label: string,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  domainFileInventory?: HalfcodeDomainFileInventory,
): Record<string, HalfcodeUnitDomainDocument> {
  const inventoryEntries = domainInventoryEntries(domainFileInventory, dir);
  const entries = inventoryEntries ?? resolver.readDir?.(dir);
  if (entries == null) {
    throw new Error(
      `Halfcode ${label} uses content-based domain discovery (files.md §3), but neither domainFileInventory nor resolver.readDir(vfsPath) lists: ${dir}`,
    );
  }
  const domains: Record<string, HalfcodeUnitDomainDocument> = {};
  for (const entry of [...entries].sort()) {
    if (entry.includes('/') || entry.includes('\\')) {
      throw new Error(`Halfcode ${label} domain inventory entries must be direct file names: ${entry}`);
    }
    if (!entry.endsWith('.xnl') || entry === UNIT_MANIFEST_FILE) continue;
    const domain = entry.slice(0, -'.xnl'.length);
    const row = DISCOVERABLE_DOMAINS.get(domain);
    if (!row || !row.layers.includes(layer)) continue;
    const path = joinPath(dir, entry);
    const xnlDocument = parseCanonicalLoadedXnl(
      resolver,
      readRequiredFile(resolver, path),
      path,
      workspaceRoot,
    );
    const node = firstDataElement(xnlDocument);
    if (!node) {
      throw new Error(`Halfcode ${label} domain document is empty: ${path}`);
    }
    const expectedTag = pascalCaseDomain(domain);
    if (!row.projection && node.tag !== expectedTag) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_UNIT_KIND_MISMATCH,
        `Domain file "${entry}" in ${label} must have a <${expectedTag}> root (file name = domain name = root tag, files.md §1), got <${node.tag}>; the ${domain} domain is not enabled`,
        path,
      );
      continue;
    }
    domains[domain] = domainDocumentFromNode(node, { domain, name: domain, path }, xnlDocument);
  }
  return domains;
}

function domainInventoryEntries(
  inventory: HalfcodeDomainFileInventory | undefined,
  dir: string,
): readonly string[] | undefined {
  if (!inventory) return undefined;
  const normalizedDir = normalizeAbsolutePath(dir);
  for (const [inventoryDir, entries] of Object.entries(inventory)) {
    if (normalizeAbsolutePath(inventoryDir) === normalizedDir) return entries;
  }
  return undefined;
}

function domainLayers(domain: string): readonly string[] {
  const entry = HALFCODE_SCHEME_TABLE.find((row) => row.domain === domain);
  return entry ? entry.layers : [];
}

function domainByCanonical(
  domains: Record<string, HalfcodeUnitDomainDocument>,
  canonicalDomain: string,
): HalfcodeUnitDomainDocument | undefined {
  if (domains[canonicalDomain]) return domains[canonicalDomain];
  return Object.entries(domains).find(([domain]) => canonicalDomainForDomain(domain) === canonicalDomain)?.[1];
}

// ---------------------------------------------------------------------------
// AppBundle manifest (new vocabulary, spec/frontend/nodes.md §2)
// ---------------------------------------------------------------------------

function readAppBundleUnitRefs(host: DataElementNode | undefined): AppBundleUnitRef[] {
  return bodyDataElements(host)
    .filter((node) => node.tag === 'Unit')
    .map((node) => {
      const kind = requiredStringAttr(node, 'kind', 'Halfcode <Unit>');
      if (!isUnitKind(kind)) {
        throw new Error(
          `Halfcode <Unit> kind must be one of ${UNIT_KINDS.join('/')}: ${kind}`,
        );
      }
      return {
        kind,
        fqn: asUnitFqn(requiredStringAttr(node, 'fqn', 'Halfcode <Unit>')),
        src: asHalfcodeRef(requiredStringAttr(node, 'src', 'Halfcode <Unit>')),
      };
    });
}

/**
 * `apiVersion` sits in the metadata position of the AppBundle root and is
 * optional (fixtures may omit it); when present it must be the AppBundle
 * vocabulary version.
 */
function readAppBundleApiVersion(node: DataElementNode, path: string): string {
  const apiVersion = stringAttr(node, 'apiVersion');
  if (apiVersion !== undefined && apiVersion !== HALFCODE_APP_BUNDLE_API_VERSION) {
    throw new Error(
      `Halfcode AppBundle manifest apiVersion must be "${HALFCODE_APP_BUNDLE_API_VERSION}" when declared, got "${apiVersion}": ${path}`,
    );
  }
  return apiVersion ?? HALFCODE_APP_BUNDLE_API_VERSION;
}

interface AppBundleBundle {
  manifest: HalfcodeUnitBundleManifest;
  appDomains: Record<string, HalfcodeUnitDomainDocument>;
  /** Product identity is inline on the AppBundle root (M-N8), not a domain. */
  product: HalfcodeProductSpec;
  units: AppBundleUnitRef[];
}

/**
 * Read a `<AppBundle>` manifest. Two forms share the root tag (M-N6):
 * inline `( )` domain sections beside `<Units>` = single-file app; only
 * `<Units>` = multi-file app whose enabled domains are discovered from the
 * manifest directory by content (files.md §3). No `domains` declaration exists
 * in this vocabulary.
 */
function readAppBundleBundle(
  resolver: HalfcodeUnitBundleResolver,
  root: DataElementNode,
  path: string,
  workspaceRoot: string,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  domainFileInventory?: HalfcodeDomainFileInventory,
): AppBundleBundle {
  if (root.body?.length) {
    throw new Error(`Halfcode AppBundle has no element tree; remove the [...] segment: ${path}`);
  }
  const id = requiredNodeId(root, 'Halfcode <AppBundle>');
  const version = stringAttr(root, 'version');
  const settings = root.attributes?.settings;
  const product: HalfcodeProductSpec = {
    id,
    version: version ?? '',
    name: stringAttr(root, 'name'),
    settings: isPlainObject(settings)
      ? (attrsToPlain(settings as Record<string, XnlNode>) as HalfcodeProductSpec['settings'])
      : undefined,
  };

  const inlineSectionTags = (root.extend?.order ?? []).filter((tag) => tag !== 'Units');
  const inlineForm = inlineSectionTags.length > 0;
  let appDomains: Record<string, HalfcodeUnitDomainDocument>;
  if (inlineForm) {
    // Single-file app: inline sections carry the app domains (M-N6).
    appDomains = {};
    for (const tag of inlineSectionTags) {
      const section = root.extend?.children?.[tag];
      if (!isDataElement(section)) continue;
      const domain = CANONICAL_SECTION_TAG_TO_DOMAIN.get(tag);
      if (!domain || !domainLayers(domain).includes('app')) {
        throw new Error(`Halfcode AppBundle section <${tag}> has no app domain mapping: ${path}`);
      }
      appDomains[domain] = domainDocumentFromNode(section, { domain, name: tag, path }, {
        nodes: [section],
      });
    }
  } else {
    // Multi-file app: enabled domains discovered from the manifest directory.
    appDomains = discoverDomainDocuments(
      resolver,
      dirname(path),
      workspaceRoot,
      'app',
      `AppBundle "${id}"`,
      diagnostics,
      domainFileInventory,
    );
  }

  const units = readAppBundleUnitRefs(extendChild(root, 'Units'));
  return {
    manifest: {
      id,
      version,
      apiVersion: readAppBundleApiVersion(root, path),
      // Domains are discovered by content. This list is a loader projection,
      // not an input declaration.
      domains: inlineForm
        ? []
        : Object.values(appDomains).map((doc) => ({
            domain: doc.domain,
            path: asHalfcodeRef(`vfs://./${doc.domain}.xnl`),
            name: doc.name,
          })),
      units,
    },
    appDomains,
    product,
    units,
  };
}

// ---------------------------------------------------------------------------
// Domain documents
// ---------------------------------------------------------------------------

/**
 * Project a DataElement into the contract-level UnitDomainNodeSpec shape
 * (tag + #id + plain attribute data + body children). This is what the G4
 * compiler consumes for scope-chain / config / command lookups.
 */
function domainNodeSpecFromElement(node: DataElementNode): UnitDomainNodeSpec {
  const children = [
    ...bodyDataElements(node),
    ...Object.values(node.extend?.children ?? {}).filter(isDataElement),
  ].map(domainNodeSpecFromElement);
  return {
    tag: node.tag,
    id: nodeId(node),
    data: attrsToPlain({ ...(node.metadata ?? {}), ...(node.attributes ?? {}) }),
    ...(children.length ? { children } : {}),
  };
}

function domainDocumentFromNode(
  node: DataElementNode,
  meta: { domain: string; name?: string; role?: 'input' | 'output'; path: string },
  xnlDocument: XnlDocument,
): HalfcodeUnitDomainDocument {
  return {
    domain: meta.domain,
    name: meta.name,
    role: meta.role,
    path: meta.path,
    tag: node.tag,
    id: nodeId(node),
    data: attrsToPlain(node.attributes ?? {}),
    nodes: xnlDocument.nodes.filter(isDataElement).map(domainNodeSpecFromElement),
    xnlDocument,
  };
}

function parseDomainFile(
  resolver: HalfcodeUnitBundleResolver,
  registration: UnitDomainRegistration,
  baseDir: string,
  workspaceRoot: string,
): HalfcodeUnitDomainDocument {
  const path = resolveVfs(registration.path, { baseDir, workspaceRoot });
  assertXnlConfigPath(path, registration.domain);
  const xnlDocument = parseCanonicalLoadedXnl(
    resolver,
    readRequiredFile(resolver, path),
    path,
    workspaceRoot,
  );
  const node = firstDataElement(xnlDocument);
  if (!node) throw new Error(`Halfcode unit domain document is empty: ${path}`);
  return domainDocumentFromNode(node, {
    domain: registration.domain,
    name: registration.name,
    role: registration.role,
    path,
  }, xnlDocument);
}

// ---------------------------------------------------------------------------
// App composition parsing (routes / product / wiring)
// ---------------------------------------------------------------------------

function readRouteMenu(node: DataElementNode): RouteMenuSpec | undefined {
  const raw = node.attributes?.menu ?? node.metadata?.menu;
  if (!isPlainObject(raw)) return undefined;
  const plain = attrsToPlain(raw as Record<string, XnlNode>);
  const menu: RouteMenuSpec = {};
  if (typeof plain.icon === 'string') menu.icon = plain.icon;
  if (typeof plain.order === 'number') menu.order = plain.order;
  if (typeof plain.group === 'string') menu.group = plain.group;
  return menu;
}

function readRoute(node: DataElementNode): RouteSpec {
  const page = requiredStringAttr(node, 'page', 'Halfcode <Route>');
  const permission = stringAttr(node, 'permission');
  const children = bodyDataElements(node)
    .filter((child) => child.tag === 'Route')
    .map(readRoute);
  return {
    id: requiredNodeId(node, 'Halfcode <Route>'),
    path: requiredStringAttr(node, 'path', 'Halfcode <Route>'),
    page: asHalfcodeRef(page),
    title: stringAttr(node, 'title'),
    menu: readRouteMenu(node),
    permission: permission ? asHalfcodeRef(permission) : undefined,
    ...(children.length ? { children } : {}),
  };
}

function parseRoutes(domain: HalfcodeUnitDomainDocument): RouteSpec[] {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) return [];
  return bodyDataElements(root)
    .filter((node) => node.tag === 'Route')
    .map(readRoute);
}

function parseProduct(domain: HalfcodeUnitDomainDocument): HalfcodeProductSpec {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) throw new Error(`Halfcode product domain document is empty: ${domain.path}`);
  const settings = root.attributes?.settings;
  return {
    id: requiredNodeId(root, 'Halfcode <Product>'),
    version: stringAttr(root, 'version') ?? '',
    name: stringAttr(root, 'name'),
    productLine: stringAttr(root, 'productLine'),
    settings: isPlainObject(settings)
      ? (attrsToPlain(settings as Record<string, XnlNode>) as HalfcodeProductSpec['settings'])
      : undefined,
  };
}

function parseWiring(domain: HalfcodeUnitDomainDocument): WireSpec[] {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) return [];
  return bodyDataElements(root)
    .filter((node) => node.tag === 'Wire')
    .map((node) => ({
      from: asHalfcodeRef(requiredStringAttr(node, 'from', 'Halfcode <Wire>')),
      to: asHalfcodeRef(requiredStringAttr(node, 'to', 'Halfcode <Wire>')),
      message: asHalfcodeRef(requiredStringAttr(node, 'message', 'Halfcode <Wire>')),
    }));
}

function optionalRefAttr(node: DataElementNode, key: string): HalfcodeRef | undefined {
  const value = stringAttr(node, key);
  return value ? asHalfcodeRef(value) : undefined;
}

function parseRuntime(
  domain: HalfcodeUnitDomainDocument,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
): RuntimeSpec {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) throw new Error(`Halfcode runtime domain document is empty: ${domain.path}`);
  validateRuntimeRoot(root, domain.path, diagnostics);
  const instances = bodyDataElements(root)
    .filter((node) => node.tag === 'RuntimeInstance')
    .map((node) => {
      validateRuntimeInstance(node, domain.path, diagnostics);
      const instance: RuntimeInstanceSpec = {
        id: requiredNodeId(node, 'Halfcode <RuntimeInstance>'),
        src: optionalRefAttr(node, 'src'),
        create: optionalRefAttr(node, 'create'),
        prototype: optionalRefAttr(node, 'prototype'),
        derive: optionalRefAttr(node, 'derive'),
        config: optionalRefAttr(node, 'config'),
      };
      for (const issue of validateRuntimeInstanceSpec(instance).issues) {
        pushDiagnostic(
          diagnostics,
          issue.code ?? HALFCODE_RUNTIME_SOURCE_AMBIGUOUS,
          `RuntimeInstance #${instance.id}: ${issue.message}`,
          domain.path,
        );
      }
      return instance;
    });

  return {
    id: nodeId(root) ?? domain.id ?? 'runtime',
    instances,
  };
}

const RUNTIME_INSTANCE_FIELDS = new Set(['src', 'create', 'prototype', 'derive', 'config']);

function validateRuntimeRoot(
  root: DataElementNode,
  path: string,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
): void {
  for (const field of Object.keys({ ...(root.metadata ?? {}), ...(root.attributes ?? {}) })) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      `Runtime domain cannot declare runtime field "${field}"; use a code-owned RuntimeInstance object instead.`,
      path,
    );
  }
  for (const child of bodyDataElements(root)) {
    if (child.tag === 'RuntimeInstance') continue;
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      `Runtime domain only allows direct <RuntimeInstance> entries, got <${child.tag}>.`,
      path,
    );
  }
  for (const child of Object.values(root.extend?.children ?? {})) {
    if (!isDataElement(child)) continue;
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      `Runtime domain cannot declare <${child.tag}> sections; runtime behavior belongs in code.`,
      path,
    );
  }
}

function validateRuntimeInstance(
  node: DataElementNode,
  path: string,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
): void {
  for (const field of Object.keys({ ...(node.metadata ?? {}), ...(node.attributes ?? {}) })) {
    if (RUNTIME_INSTANCE_FIELDS.has(field)) continue;
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      `RuntimeInstance #${nodeId(node) ?? 'unknown'} cannot declare "${field}"; only src/create/prototype/derive/config are assembly fields.`,
      path,
    );
  }
  for (const child of [...bodyDataElements(node), ...Object.values(node.extend?.children ?? {}).filter(isDataElement)]) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_RUNTIME_DSL_UNSUPPORTED,
      `RuntimeInstance #${nodeId(node) ?? 'unknown'} cannot declare nested <${child.tag}> behavior; use code for runtime methods and routing.`,
      path,
    );
  }
}

function parseScopeRuntimeBindings(domain: HalfcodeUnitDomainDocument): RuntimeScopeBindingSpec[] {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) return [];
  return bodyDataElements(root)
    .filter((node) => node.tag === 'Scope')
    .map(readRuntimeScopeBinding)
    .filter((binding) =>
      binding.runtime || binding.config || binding.commands || binding.events ||
      binding.messagePolicy || binding.effects || binding.dataGraphs);
}

function readRuntimeScopeBinding(node: DataElementNode): RuntimeScopeBindingSpec {
  return {
    scopeId: requiredNodeId(node, 'Halfcode <Scope>'),
    runtime: optionalRefAttr(node, 'runtime'),
    config: optionalRefAttr(node, 'config'),
    commands: optionalRefAttr(node, 'commands'),
    events: optionalRefAttr(node, 'events'),
    messagePolicy: readMessagePolicy(extendChild(node, 'MessagePolicy')),
    effects: readCallableEffectBindings(extendChild(node, 'EffectBindings')),
    dataGraphs: readDataGraphBindings(extendChild(node, 'DataGraphBindings')),
  };
}

function readCallableEffectBindings(host: DataElementNode | undefined): CallableEffectBindingsSpec | undefined {
  if (!host) return undefined;
  const impls = optionalRefAttr(host, 'impls');
  const bindings = bodyDataElements(host)
    .filter((node) => node.tag === 'FuncEffect' || node.tag === 'InterfaceEffect')
    .map((node) => ({
      id: requiredNodeId(node, `Halfcode <${node.tag}>`),
      kind: node.tag === 'FuncEffect' ? 'function' as const : 'interface' as const,
      type: optionalRefAttr(node, 'type'),
      impl: asHalfcodeRef(requiredStringAttr(node, 'impl', `Halfcode <${node.tag}>`)),
      config: optionalRefAttr(node, 'config'),
    }));
  return {
    ...(impls ? { impls } : {}),
    bindings,
  };
}

function readDataGraphBindings(host: DataElementNode | undefined): DataGraphBindingsSpec | undefined {
  if (!host) return undefined;
  const objects: DataGraphBindingsSpec['objects'] = [];
  const mounts: DataGraphBindingsSpec['mounts'] = [];
  const extensions: DataGraphBindingsSpec['extensions'] = [];
  for (const node of bodyDataElements(host)) {
    if (node.tag === 'GraphObject') {
      objects.push({
        id: requiredNodeId(node, 'Halfcode <GraphObject>'),
        src: asHalfcodeRef(requiredStringAttr(node, 'src', 'Halfcode <GraphObject>')),
        config: optionalRefAttr(node, 'config'),
      });
      continue;
    }
    if (node.tag === 'GraphExtension') {
      extensions.push({
        id: requiredNodeId(node, 'Halfcode <GraphExtension>'),
        graph: optionalRefAttr(node, 'graph'),
        src: asHalfcodeRef(requiredStringAttr(node, 'src', 'Halfcode <GraphExtension>')),
        config: optionalRefAttr(node, 'config'),
      });
      continue;
    }
    if (node.tag !== 'GraphMount') continue;
    const nodeBindings = bodyDataElements(extendChild(node, 'NodeBindings') ?? node)
      .filter((binding) => /^(Computed|Processor|Async|Consumer)Binding$/.test(binding.tag))
      .map((binding) => ({
        id: requiredNodeId(binding, `Halfcode <${binding.tag}>`),
        kind: binding.tag.replace(/Binding$/, '').toLowerCase() as DataGraphLogicKind,
        impl: asHalfcodeRef(requiredStringAttr(binding, 'impl', `Halfcode <${binding.tag}>`)),
        config: optionalRefAttr(binding, 'config'),
      }));
    mounts.push({
      id: requiredNodeId(node, 'Halfcode <GraphMount>'),
      graph: optionalRefAttr(node, 'graph'),
      module: asHalfcodeRef(requiredStringAttr(node, 'module', 'Halfcode <GraphMount>')),
      scope: stringAttr(node, 'scope'),
      seed: optionalRefAttr(node, 'seed'),
      impls: optionalRefAttr(node, 'impls'),
      nodeBindings,
    });
  }
  return { objects, mounts, extensions };
}

function readMessagePolicy(host: DataElementNode | undefined): MessagePolicySpec | undefined {
  if (!host) return undefined;
  const defaultAction = stringAttr(host, 'default');
  const rules = bodyDataElements(host)
    .filter((node) => node.tag === 'MessageRule')
    .map((node) => ({
      message: asHalfcodeRef(requiredStringAttr(node, 'message', 'Halfcode <MessageRule>')),
      action: requiredStringAttr(node, 'action', 'Halfcode <MessageRule>') as 'consume' | 'bubble' | 'reject',
    }));
  return {
    id: nodeId(host),
    default: defaultAction as MessagePolicySpec['default'],
    rules: rules.length ? rules : undefined,
  };
}

// ---------------------------------------------------------------------------
// Element tree parsing (D4/D11/D12)
// ---------------------------------------------------------------------------

/** Structural element fields, never inline literal props. */
const ELEMENT_STRUCTURAL_KEYS = new Set(['proto', 'props', 'command', 'urlInputs']);

/** Tag form decides the resolution realm (D4): dotted FQN tags hit a registry. */
function isDottedFqnTag(tag: string): boolean {
  return tag.includes('.');
}

/**
 * Named slot content in an element's (...) section (D11). Two forms:
 * a single `<Slot #name [...]>` written directly, or a `<Slots [...]>`
 * container carrying several named slots (xnl-core keys (...) children by
 * tag, so multiple direct `<Slot>` siblings would collapse — the container
 * hosts the multi-slot case).
 */
function readElementSlots(
  node: DataElementNode,
  filePath: string,
  allowScope: boolean,
): SlotSpec[] | undefined {
  const sections = Object.values(node.extend?.children ?? {}).filter(isDataElement);
  if (!sections.length) return undefined;
  const slots: SlotSpec[] = [];
  const readSlot = (slotNode: DataElementNode): void => {
    slots.push({
      id: requiredNodeId(slotNode, 'Halfcode <Slot>'),
      children: bodyDataElements(slotNode).map((child) => readElementNode(child, filePath)),
    });
  };
  for (const section of sections) {
    if (section.tag === 'Scope') {
      if (!allowScope) {
        throw new Error(
          `Halfcode instance <${node.tag}> cannot declare Scope at its use site; put the Scope on its target unit Elements root: ${filePath}`,
        );
      }
      continue;
    }
    if (section.tag === 'Slot') {
      readSlot(section);
      continue;
    }
    if (section.tag === 'Slots') {
      for (const child of bodyDataElements(section)) {
        if (child.tag !== 'Slot') {
          throw new Error(
            `Halfcode <Slots> container only allows <Slot #name> entries, got <${child.tag}>: ${filePath}`,
          );
        }
        readSlot(child);
      }
      continue;
    }
    throw new Error(
      `Halfcode element <${node.tag}> only allows one <Scope>, <Slot #name>, or a <Slots> container in its (...) section, got <${section.tag}>: ${filePath}`,
    );
  }
  return slots.length ? slots : undefined;
}

function normalizeScopeUseRef(value: string): HalfcodeRef {
  return asHalfcodeRef(value.includes('://') ? value : `scope://#${value}`);
}

function readScopeUse(node: DataElementNode, filePath: string): ScopeUseSpec | undefined {
  const scopeNode = extendChild(node, 'Scope');
  if (!scopeNode) return undefined;
  const ref = stringAttr(scopeNode, 'ref');
  if (ref) {
    const inlineKeys = Object.keys({ ...(scopeNode.metadata ?? {}), ...(scopeNode.attributes ?? {}) })
      .filter((key) => key !== 'ref');
    if (nodeId(scopeNode) || inlineKeys.length || bodyDataElements(scopeNode).length || scopeNode.extend) {
      throw new Error(
        `Halfcode <Scope ref="..."> cannot also declare inline scope fields: ${filePath}`,
      );
    }
    return { kind: 'ref', ref: normalizeScopeUseRef(ref) };
  }
  return { kind: 'inline', scope: readRuntimeScopeBinding(scopeNode) };
}

function readInlineProps(node: DataElementNode): Record<string, unknown> | undefined {
  const metadata = Object.fromEntries(
    Object.entries(node.metadata ?? {}).filter(([key]) => key !== 'name'),
  );
  const merged = { ...metadata, ...(node.attributes ?? {}) };
  const entries = Object.entries(merged).filter(([key]) => !ELEMENT_STRUCTURAL_KEYS.has(key));
  if (!entries.length) return undefined;
  return attrsToPlain(Object.fromEntries(entries));
}

function readElementNode(node: DataElementNode, filePath: string): UnitElementNode {
  if (node.tag === 'Slot') {
    throw new Error(
      `Halfcode <Slot> is only allowed inside a (...) section, not in the [...] children array: ${filePath}`,
    );
  }
  const id = requiredNodeId(node, `Halfcode element <${node.tag}>`);
  const children = bodyDataElements(node).map((child) => readElementNode(child, filePath));
  const slots = readElementSlots(node, filePath, node.tag === 'Capsule');

  if (node.tag === 'Capsule') {
    return {
      kind: 'capsule',
      id,
      scope: readScopeUse(node, filePath),
      ...(children.length ? { children } : {}),
      ...(slots ? { slots } : {}),
    };
  }

  const props = stringAttr(node, 'props');
  const command = stringAttr(node, 'command');
  const urlInputs = stringAttr(node, 'urlInputs');
  return {
    kind: 'instance',
    tag: node.tag,
    id,
    inlineProps: readInlineProps(node) as UnitInstanceElement['inlineProps'],
    props: props ? asHalfcodeRef(props) : undefined,
    command: command ? asHalfcodeRef(command) : undefined,
    urlInputs: urlInputs ? asHalfcodeRef(urlInputs) : undefined,
    ...(children.length ? { children } : {}),
    ...(slots ? { slots } : {}),
  };
}

function parseElements(domain: HalfcodeUnitDomainDocument): ElementsSpec | undefined {
  const root = firstDataElement(domain.xnlDocument);
  if (!root) return undefined;
  return {
    id: nodeId(root) ?? '',
    scope: readScopeUse(root, domain.path),
    children: bodyDataElements(root).map((child) => readElementNode(child, domain.path)),
  };
}

// ---------------------------------------------------------------------------
// Contract parsing (D2/D5/D9/D14)
// ---------------------------------------------------------------------------

function readMessageRefs(host: DataElementNode | undefined): MessageRefSpec[] | undefined {
  if (!host) return undefined;
  const refs = bodyDataElements(host)
    .filter((node) => (node.tag === 'Command' || node.tag === 'Event') && stringAttr(node, 'ref') !== undefined)
    .map((node) => ({ ref: asHalfcodeRef(requiredStringAttr(node, 'ref', `Halfcode <${node.tag}>`)) }));
  return refs.length ? refs : undefined;
}

function readStringRecordSection(host: DataElementNode | undefined): Record<string, string> | undefined {
  if (!host) return undefined;
  const plain = attrsToPlain({ ...(host.metadata ?? {}), ...(host.attributes ?? {}) });
  const record: Record<string, string> = {};
  for (const [key, value] of Object.entries(plain)) {
    if (typeof value !== 'string') {
      throw new Error(`Halfcode contract <${host.tag}> entries must be type descriptor strings: ${key}`);
    }
    record[key] = value;
  }
  return Object.keys(record).length ? record : undefined;
}

function readRequires(host: DataElementNode | undefined): RequiresSpec | undefined {
  if (!host) return undefined;
  const plain = attrsToPlain(host.attributes ?? {});
  const asStringArray = (value: unknown, label: string): string[] => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
      throw new Error(`Halfcode <Requires> ${label} must be an array of strings`);
    }
    return value as string[];
  };
  return {
    commands: asStringArray(plain.commands, 'commands').map(asHalfcodeRef),
    effects: asStringArray(plain.effects, 'effects').map(asHalfcodeRef),
    config: asStringArray(plain.config, 'config').map(asHalfcodeRef),
  };
}

function readElementContracts(host: DataElementNode | undefined): UnitElementContractSpec[] | undefined {
  if (!host) return undefined;
  const contracts = bodyDataElements(host)
    .filter((node) => node.tag === 'ElementContract')
    .map((node): UnitElementContractSpec => ({
      id: requiredNodeId(node, 'Halfcode <ElementContract>'),
      accepts: readMessageRefs(extendChild(node, 'Accepts')),
      sends: readMessageRefs(extendChild(node, 'Sends')),
      requires: readRequires(extendChild(node, 'Requires')),
    }));
  return contracts.length ? contracts : undefined;
}

function readUrlInputs(node: DataElementNode): UrlInputsSpec | undefined {
  const raw = node.attributes?.urlInputs;
  if (!isPlainObject(raw)) return undefined;
  const plain = attrsToPlain(raw as Record<string, XnlNode>);
  const urlInputs: UrlInputsSpec = {};
  for (const key of ['path', 'query', 'hash'] as const) {
    const section = plain[key];
    if (section === undefined) continue;
    if (!isPlainObject(section) || Object.values(section).some((type) => typeof type !== 'string')) {
      throw new Error(`Halfcode PageContract urlInputs.${key} must map variables to type descriptor strings`);
    }
    urlInputs[key] = section as Record<string, string>;
  }
  return urlInputs;
}

function parseUnitContract(
  domain: HalfcodeUnitDomainDocument,
  unitFqn: UnitFqn,
  unitKind: UnitKind,
): UnitContractSpec | undefined {
  let root: DataElementNode | undefined;
  walkDataElements(firstDataElement(domain.xnlDocument), (node) => {
    if (!root && (node.tag === 'PageContract' || node.tag === 'ComponentContract' || node.tag === 'Contract')) {
      root = node;
    }
  });
  if (!root) return undefined;

  const kind: UnitKind =
    root.tag === 'PageContract' ? 'page' : root.tag === 'ComponentContract' ? 'component' : unitKind;
  const fqn = nodeId(root) ? asUnitFqn(nodeId(root) as string) : unitFqn;
  if (kind !== unitKind) {
    throw new Error(
      `Halfcode unit "${unitFqn}" is a ${unitKind} but its contract root <${root.tag}> declares a ${kind} contract: ${domain.path}`,
    );
  }

  // Element contracts are the `[...]` list of the Contracts domain root.
  const domainRoot = firstDataElement(domain.xnlDocument);
  const elementContracts = readElementContracts(domainRoot);

  if (kind === 'page') {
    const contract: PageContractSpec = {
      kind: 'page-contract',
      fqn,
      urlInputs: readUrlInputs(root),
      accepts: readMessageRefs(extendChild(root, 'Accepts')),
      sends: readMessageRefs(extendChild(root, 'Sends')),
      elementContracts,
    };
    return contract;
  }

  const slotsHost = extendChild(root, 'Slots');
  const slots: SlotDefSpec[] | undefined = slotsHost
    ? bodyDataElements(slotsHost)
        .filter((node) => node.tag === 'SlotDef')
        .map((node) => ({ id: requiredNodeId(node, 'Halfcode <SlotDef>') }))
    : undefined;
  const contract: ComponentContractSpec = {
    kind: 'component-contract',
    fqn,
    props: readStringRecordSection(extendChild(root, 'Props')),
    slots: slots?.length ? slots : undefined,
    accepts: readMessageRefs(extendChild(root, 'Accepts')),
    sends: readMessageRefs(extendChild(root, 'Sends')),
    exposes: readStringRecordSection(extendChild(root, 'Exposes')),
    elementContracts,
  };
  return contract;
}

// ---------------------------------------------------------------------------
// Unit loading (folder + single-file forms, D10/D15)
// ---------------------------------------------------------------------------

interface UnitLoadContext {
  resolver: HalfcodeUnitBundleResolver;
  workspaceRoot: string;
  diagnostics: HalfcodeUnitBundleDiagnostic[];
  unitKindsByFqn: Readonly<Record<string, UnitKind>>;
  domainFileInventory?: HalfcodeDomainFileInventory;
}

function rootTagForFrontendUnitKind(kind: FrontendUnitKind) {
  switch (kind) {
    case 'page':
      return 'Page' as const;
    case 'component':
      return 'Component' as const;
    case 'document':
      return 'Document' as const;
    default:
      return assertNever(kind, 'frontend Unit root-tag dispatch');
  }
}

type FrontendUnitRootTag = ReturnType<typeof rootTagForFrontendUnitKind>;

const SINGLE_FILE_ROOT_TAGS = Object.fromEntries(
  FRONTEND_UNIT_KINDS.map((kind) => [rootTagForFrontendUnitKind(kind), kind]),
) as Readonly<Record<FrontendUnitRootTag, FrontendUnitKind>>;

function isFrontendUnitRootTag(value: string): value is FrontendUnitRootTag {
  return Object.prototype.hasOwnProperty.call(SINGLE_FILE_ROOT_TAGS, value);
}

const UNIT_MANIFEST_FILE = 'manifest.xnl';

function readUnitManifestBase(
  node: DataElementNode,
  kind: UnitKind,
  domains: UnitDomainRegistration[],
): HalfcodeUnitManifest {
  const fqn = asUnitFqn(requiredNodeId(node, `Halfcode unit manifest <${node.tag}>`));
  const base = {
    fqn,
    version: stringAttr(node, 'version') ?? '',
    description: stringAttr(node, 'description'),
    domains,
  };
  switch (kind) {
    case 'page':
      return { ...base, kind, title: stringAttr(node, 'title') };
    case 'component':
    case 'document':
    case 'instant-ctrl-flow':
    case 'work-ctrl-flow':
    case 'bp-ctrl-flow':
    case 'eager-data-flow':
      return { ...base, kind };
    default:
      return assertNever(kind, 'Unit manifest dispatch');
  }
}

/**
 * Inline `( )` domain sections + `[...]` element tree of a single-file unit,
 * mapped to domain documents. The section table and the synthesized elements
 * domain name and inline sections are mapped through the canonical table.
 */
function readInlineUnitDomains(
  root: DataElementNode,
  actualKind: UnitKind,
  filePath: string,
  sectionTagToDomain: Map<string, string>,
  elementsDomain: string,
): Record<string, HalfcodeUnitDomainDocument> {
  const domains: Record<string, HalfcodeUnitDomainDocument> = {};
  for (const tag of root.extend?.order ?? []) {
    const section = root.extend?.children?.[tag];
    if (!isDataElement(section)) continue;
    const domain = sectionTagToDomain.get(tag);
    if (!domain) {
      throw new Error(`Halfcode single-file unit section <${tag}> has no domain mapping (spec §4): ${filePath}`);
    }
    const layers = domainLayers(domain);
    if (layers.length && !layers.includes(actualKind)) {
      throw new Error(
        `Halfcode domain "${domain}" (section <${tag}>) cannot appear on a ${actualKind} unit: ${filePath}`,
      );
    }
    domains[domain] = domainDocumentFromNode(section, { domain, name: tag, path: filePath }, {
      nodes: [section],
    });
  }
  if (root.body?.length) {
    // The `[...]` array segment is the element tree; synthesize the elements
    // domain so both unit forms expose the same shape.
    const syntheticRoot: DataElementNode = {
      kind: 'DataElement',
      tag: 'Elements',
      id: root.id,
      metadata: {},
      body: root.body,
    };
    domains[elementsDomain] = domainDocumentFromNode(
      syntheticRoot,
      { domain: elementsDomain, name: 'Elements', path: filePath },
      { nodes: [syntheticRoot] },
    );
  }
  return domains;
}

interface CanonicalFlowLoadAttempt {
  unit: LoadedHalfcodeUnit;
  diagnostics: HalfcodeUnitBundleDiagnostic[];
}

type UpstreamFlowDiagnostic = FlowDiagnostic | EagerDataFlowDiagnostic;

const CONTROL_KIND_BY_FORM = {
  InstantCtrlFlow: 'instant-ctrl-flow',
  WorkCtrlFlow: 'work-ctrl-flow',
  BPCtrlFlow: 'bp-ctrl-flow',
} as const satisfies Record<string, FlowUnitKind>;

function collectFlowSources(
  context: UnitLoadContext,
  filePath: string,
): Record<string, string> {
  const unitDir = dirname(filePath);
  const rootName = basename(filePath);
  const discovered = rootName === UNIT_MANIFEST_FILE
    ? domainInventoryEntries(context.domainFileInventory, unitDir)
      ?? context.resolver.readDir?.(unitDir)
      ?? []
    : [];
  const names = [...new Set([rootName, ...discovered])]
    .filter((name) => name.endsWith('.xnl'))
    .filter((name) => !context.resolver.isDir(joinPath(unitDir, name)))
    .sort();
  return Object.fromEntries(
    names.map((name) => [name, readRequiredFile(context.resolver, joinPath(unitDir, name))]),
  );
}

function adaptUpstreamFlowDiagnostics(
  diagnostics: readonly UpstreamFlowDiagnostic[],
  path: string,
): HalfcodeUnitBundleDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    severity: 'error',
    code: HALFCODE_UNIT_KIND_MISMATCH,
    message: `depa-flows [${diagnostic.code}] ${diagnostic.message}`,
    path: 'source' in diagnostic && diagnostic.source ? diagnostic.source : path,
  }));
}

function createFlowManifest(
  kind: FlowUnitKind,
  fqn: UnitFqn,
  version: string,
): HalfcodeUnitManifest {
  return { kind, fqn, version, domains: [] };
}

function loadCanonicalFlowUnit(
  context: UnitLoadContext,
  entry: AppBundleUnitRef,
  filePath: string,
  eagerRegistry: EagerDataFlowRegistry = {},
): CanonicalFlowLoadAttempt {
  if (!isFlowUnitKind(entry.kind)) {
    throw new Error(`Expected a canonical Flow Unit registration, got ${entry.kind}`);
  }
  assertXnlConfigPath(filePath, `unit ${entry.kind}`);
  const sources = collectFlowSources(context, filePath);
  const baseUri = dirname(filePath);

  let actualKind: FlowUnitKind = entry.kind;
  let actualFqn = entry.fqn;
  let version = '';
  let flow: HalfcodeFlowSpec | undefined;
  let upstreamDiagnostics: readonly UpstreamFlowDiagnostic[];

  if (entry.kind === 'eager-data-flow') {
    const result = loadEagerDataFlowSources(sources, { baseUri, registry: eagerRegistry });
    upstreamDiagnostics = result.diagnostics;
    if (result.plan && result.diagnostics.length === 0) {
      flow = result.plan;
      actualFqn = asUnitFqn(result.plan.fqn);
      version = result.plan.version;
    }
  } else {
    const result = loadFlowBundleFromSources(sources, { baseUri });
    upstreamDiagnostics = result.diagnostics;
    if (result.spec && result.diagnostics.length === 0) {
      flow = result.spec;
      actualKind = CONTROL_KIND_BY_FORM[result.spec.form];
      actualFqn = asUnitFqn(result.spec.fqn);
      version = result.spec.version;
    }
  }

  const diagnostics = adaptUpstreamFlowDiagnostics(upstreamDiagnostics, filePath);
  if (actualKind !== entry.kind) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_UNIT_KIND_MISMATCH,
      `Unit registered as kind "${entry.kind}" but upstream source declares ${actualKind}: ${filePath}`,
      filePath,
    );
  }
  if (actualFqn !== entry.fqn) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_UNIT_FQN_CONFLICT,
      `Unit registered as fqn "${entry.fqn}" but upstream source declares "${actualFqn}": ${filePath}`,
      filePath,
    );
  }

  const form: HalfcodeUnitForm = Object.keys(sources).length > 1 ? 'folder' : 'single-file';
  const unit = finalizeUnit({ ...context, diagnostics }, {
    fqn: actualFqn,
    kind: actualKind,
    form,
    path: form === 'folder' ? dirname(filePath) : filePath,
    manifest: createFlowManifest(actualKind, actualFqn, version),
    domains: {},
    ...(flow ? { flow } : {}),
  });
  return { unit, diagnostics };
}

/**
 * AppBundle unit registration target (`<Unit kind fqn src>`): `src` points
 * at the unit manifest file. Frontend root tag (<Page>/<Component>/<Document>) is the source of
 * truth for kind; the root `#id` is the FQN. Both are cross-checked against
 * the registration (HALFCODE_UNIT_KIND_MISMATCH / HALFCODE_UNIT_FQN_CONFLICT).
 * Inline domain sections or an element tree = single-file unit; a bare thin
 * manifest = multi-file unit whose domains are discovered from its directory
 * by content (files.md §3/§4).
 */
function loadAppBundleUnit(
  context: UnitLoadContext,
  entry: AppBundleUnitRef,
  filePath: string,
): LoadedHalfcodeUnit {
  if (isFlowUnitKind(entry.kind)) {
    throw new Error(`Canonical Flow Unit ${entry.fqn} must load through the upstream source adapter`);
  }
  if (!isFrontendUnitKind(entry.kind)) {
    return assertNever(entry.kind, 'AppBundle frontend Unit loader dispatch');
  }
  assertXnlConfigPath(filePath, `unit ${entry.kind}`);
  const sourceText = readRequiredFile(context.resolver, filePath);
  const doc = parseCanonicalLoadedXnl(
    context.resolver,
    sourceText,
    filePath,
    context.workspaceRoot,
  );
  const root = firstDataElement(doc);
  if (!root || !isFrontendUnitRootTag(root.tag)) {
    throw new Error(
      `Halfcode frontend unit manifest must have a <${FRONTEND_UNIT_KINDS.map(rootTagForFrontendUnitKind).join('>/<')}> root: ${filePath}`,
    );
  }
  const actualKind = SINGLE_FILE_ROOT_TAGS[root.tag];
  if (actualKind !== entry.kind) {
    pushDiagnostic(context.diagnostics, HALFCODE_UNIT_KIND_MISMATCH,
      `Unit registered as kind "${entry.kind}" but manifest root <${root.tag}> declares a ${actualKind}: ${filePath}`,
      filePath);
  }
  if (actualKind === 'document') {
    return loadDocumentUnit(context, entry, filePath, sourceText, doc, root);
  }
  const manifest = readUnitManifestBase(root, actualKind, []);
  if (manifest.fqn !== entry.fqn) {
    pushDiagnostic(context.diagnostics, HALFCODE_UNIT_FQN_CONFLICT,
      `Unit registered as fqn "${entry.fqn}" but manifest root declares "#${manifest.fqn}": ${filePath}`,
      filePath);
  }

  const hasInlineContent = (root.extend?.order ?? []).length > 0 || (root.body?.length ?? 0) > 0;
  if (hasInlineContent) {
    const domains = readInlineUnitDomains(
      root,
      actualKind,
      filePath,
      CANONICAL_SECTION_TAG_TO_DOMAIN,
      'elements',
    );
    return finalizeUnit(context, {
      fqn: manifest.fqn,
      kind: actualKind,
      form: 'single-file',
      path: filePath,
      manifest,
      domains,
    });
  }

  const unitDir = dirname(filePath);
  const domains = discoverDomainDocuments(
    context.resolver,
    unitDir,
    context.workspaceRoot,
    actualKind,
    `unit "${manifest.fqn}"`,
    context.diagnostics,
    context.domainFileInventory,
  );
  const registrations: UnitDomainRegistration[] = Object.values(domains).map((docRef) => ({
    domain: docRef.domain,
    path: asHalfcodeRef(`vfs://./${docRef.domain}.xnl`),
    name: docRef.name,
  }));
  return finalizeUnit(context, {
    fqn: manifest.fqn,
    kind: actualKind,
    form: 'folder',
    path: unitDir,
    manifest: { ...manifest, domains: registrations },
    domains,
  });
}

const DOCUMENT_SECTION_TAGS = [
  'DocumentContract',
  'DocumentSource',
  'Scope',
  'DocumentPresentation',
] as const;

type DocumentSectionTag = (typeof DOCUMENT_SECTION_TAGS)[number];

const DOCUMENT_SECTION_TAG_SET = new Set<string>(DOCUMENT_SECTION_TAGS);
const DOCUMENT_SKELETON_STRUCTURAL_KEYS = new Set(['x-id', 'projectionRole']);
const DOCUMENT_X_ID_PATTERN = /^[A-Za-z0-9._~-]+$/;
const DOCUMENT_PROJECTION_ROLE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

interface UniqueDocumentSection {
  node?: DataElementNode;
  duplicate: boolean;
}

function orderedExtendElements(node: DataElementNode): DataElementNode[] {
  return (node.extend?.order ?? [])
    .map((key) => node.extend?.children[key])
    .filter(isDataElement);
}

function hasParserDuplicate(
  source: XnlDocument,
  parentTag: string,
  childTag: string,
): boolean {
  return (source.warnings ?? []).some((warning) =>
    warning.code === 'DUPLICATE_CHILD'
    && warning.parentName === parentTag
    && warning.childName === childTag,
  );
}

function readUniqueDocumentSection(
  host: DataElementNode,
  tag: DocumentSectionTag | 'Scope',
  source: XnlDocument,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  filePath: string,
  required: boolean,
  ownerLabel: string,
): UniqueDocumentSection {
  const matches = orderedExtendElements(host).filter((child) => child.tag === tag);
  const duplicate = matches.length > 1 || hasParserDuplicate(source, host.tag, tag);
  if (duplicate) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `${ownerLabel} ${tag} appears more than once; duplicate sections are invalid and the last value is not selected.`,
      filePath,
    );
    return { duplicate: true };
  }
  if (matches.length === 0) {
    if (required) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `${ownerLabel} is missing its required ${tag} section.`,
        filePath,
      );
    }
    return { duplicate: false };
  }
  return { node: matches[0], duplicate: false };
}

function documentContractFromNode(
  node: DataElementNode | undefined,
  unitFqn: UnitFqn,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  filePath: string,
): DocumentContractSpec | undefined {
  if (!node) return undefined;
  try {
    const declaredFields = Object.fromEntries(
      Object.entries({ ...(node.metadata ?? {}), ...(node.attributes ?? {}) })
        .filter(([key]) => key !== 'name'),
    );
    const candidate: Record<string, unknown> = attrsToPlain(declaredFields);
    candidate.kind ??= 'document-contract';
    candidate.fqn ??= unitFqn;
    const accepts = readMessageRefs(extendChild(node, 'Accepts'));
    const sends = readMessageRefs(extendChild(node, 'Sends'));
    const elementContracts = readElementContracts(node);
    if (accepts) candidate.accepts = accepts;
    if (sends) candidate.sends = sends;
    if (elementContracts) candidate.elementContracts = elementContracts;

    const validation = validateDocumentContract(candidate);
    for (const issue of validation.issues) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `DocumentContract ${issue.path}: ${issue.message}`,
        filePath,
      );
    }
    if (candidate.fqn !== unitFqn) {
      pushDiagnostic(
        diagnostics,
        HALFCODE_UNIT_FQN_CONFLICT,
        `DocumentContract fqn "${String(candidate.fqn)}" does not match Document root "${unitFqn}".`,
        filePath,
      );
      return undefined;
    }
    return validation.ok ? candidate as unknown as DocumentContractSpec : undefined;
  } catch (error) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `Invalid DocumentContract shape: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
    );
    return undefined;
  }
}

function documentSourceRefFromNode(
  node: DataElementNode | undefined,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  filePath: string,
): HalfcodeRef | undefined {
  if (!node) return undefined;
  const fields = { ...(node.metadata ?? {}), ...(node.attributes ?? {}) };
  const extraFields = Object.keys(fields).filter((key) => key !== 'name' && key !== 'ref');
  if (nodeId(node) || node.body !== undefined || node.extend !== undefined || extraFields.length > 0) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'DocumentSource must be a plain { ref = "vfs://..." } section with no #id, body, nested sections, or extra fields.',
      filePath,
    );
  }
  const rawRef = fields.ref;
  if (typeof rawRef !== 'string' || rawRef.length === 0) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'DocumentSource.ref must be a non-empty vfs reference.',
      filePath,
    );
    return undefined;
  }
  try {
    const parsed = parseHalfcodeRef(rawRef);
    if (parsed.scheme !== 'vfs') {
      pushDiagnostic(
        diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `DocumentSource.ref must use vfs://, received "${rawRef}".`,
        filePath,
      );
      return undefined;
    }
    return asHalfcodeRef(rawRef);
  } catch (error) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `Invalid DocumentSource.ref "${rawRef}": ${error instanceof Error ? error.message : String(error)}`,
      filePath,
    );
    return undefined;
  }
}

function documentPresentationFromNode(
  node: DataElementNode | undefined,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  filePath: string,
): DocumentPresentationSpec | undefined {
  if (!node) return undefined;
  const fields = { ...(node.metadata ?? {}), ...(node.attributes ?? {}) };
  const extraFields = Object.keys(fields).filter((key) => key !== 'name' && key !== 'id');
  if (nodeId(node) || node.body !== undefined || node.extend !== undefined || extraFields.length > 0) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'DocumentPresentation must contain only a plain string id field.',
      filePath,
    );
  }
  const id = fields.id;
  if (typeof id !== 'string' || id.length === 0) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'DocumentPresentation.id must be a non-empty string.',
      filePath,
    );
    return undefined;
  }
  return { id };
}

function documentScopeFromNode(
  node: DataElementNode | undefined,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  filePath: string,
  ownerLabel: string,
): RuntimeScopeBindingSpec | undefined {
  if (!node) return undefined;
  try {
    return readRuntimeScopeBinding(node);
  } catch (error) {
    pushDiagnostic(
      diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `${ownerLabel} has an invalid Scope: ${error instanceof Error ? error.message : String(error)}`,
      filePath,
    );
    return undefined;
  }
}

interface DocumentSkeletonContext {
  source: XnlDocument;
  filePath: string;
  unitKindsByFqn: Readonly<Record<string, UnitKind>>;
  diagnostics: HalfcodeUnitBundleDiagnostic[];
  xIds: Map<string, string>;
  nodeIds: Map<string, string>;
}

function classifyDocumentSkeletonNode(
  tag: string,
  unitKindsByFqn: Readonly<Record<string, UnitKind>>,
): HalfcodeDocumentSkeletonNode['kind'] {
  if (tag === 'Capsule') return 'capsule';
  const registeredKind = unitKindsByFqn[tag];
  if (registeredKind === 'component') return 'component-embed';
  if (registeredKind === 'document') return 'document-embed';
  return 'domain-node';
}

function structuralString(
  node: DataElementNode,
  key: 'x-id' | 'projectionRole',
): { declared: boolean; value?: string; valid: boolean } {
  const raw = node.attributes?.[key] ?? node.metadata?.[key];
  if (raw === undefined) return { declared: false, valid: true };
  return {
    declared: true,
    ...(typeof raw === 'string' ? { value: raw } : {}),
    valid: typeof raw === 'string' && raw.length > 0,
  };
}

function componentInlineProps(node: DataElementNode): Readonly<Record<string, unknown>> | undefined {
  const entries = Object.entries(node.attributes ?? {})
    .filter(([key]) => !DOCUMENT_SKELETON_STRUCTURAL_KEYS.has(key));
  return entries.length ? attrsToPlain(Object.fromEntries(entries)) : undefined;
}

function registerDocumentIdentity(
  seen: Map<string, string>,
  value: string,
  label: '#id' | 'x-id',
  nodeLabel: string,
  context: DocumentSkeletonContext,
): void {
  const first = seen.get(value);
  if (first) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `Duplicate Document ${label} "${value}" on ${nodeLabel}; first declared on ${first}.`,
      context.filePath,
    );
    return;
  }
  seen.set(value, nodeLabel);
}

function readDocumentSkeletonNode(
  node: DataElementNode,
  lexicalScopeId: string | undefined,
  context: DocumentSkeletonContext,
): HalfcodeDocumentSkeletonNode {
  const kind = classifyDocumentSkeletonNode(node.tag, context.unitKindsByFqn);
  const id = nodeId(node);
  const nodeLabel = id ? `<${node.tag} #${id}>` : `<${node.tag}>`;
  if (id) registerDocumentIdentity(context.nodeIds, id, '#id', nodeLabel, context);

  const rawXId = structuralString(node, 'x-id');
  const rawRole = structuralString(node, 'projectionRole');
  let xId = rawXId.valid ? rawXId.value : undefined;
  let projectionRole = rawRole.valid ? rawRole.value : undefined;

  if (rawXId.declared && (!rawXId.valid || !DOCUMENT_X_ID_PATTERN.test(rawXId.value ?? ''))) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `${nodeLabel} x-id must be a non-empty URI-safe string.`,
      context.filePath,
    );
    xId = undefined;
  }
  if (rawRole.declared && (
    !rawRole.valid || !DOCUMENT_PROJECTION_ROLE_PATTERN.test(rawRole.value ?? '')
  )) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `${nodeLabel} projectionRole must be canonical lowercase kebab-case.`,
      context.filePath,
    );
    projectionRole = undefined;
  }

  const embedOrCapsule = kind !== 'domain-node';
  const addressable = embedOrCapsule || rawXId.declared || rawRole.declared;
  if (addressable && projectionRole === undefined && !rawRole.declared) projectionRole = 'main';
  if (addressable && !xId) {
    if (projectionRole === 'main' && embedOrCapsule && id && !rawXId.declared) {
      xId = id;
    } else if (projectionRole && projectionRole !== 'main') {
      pushDiagnostic(
        context.diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `${nodeLabel} uses non-main projection role "${projectionRole}" and requires an explicit x-id.`,
        context.filePath,
      );
    } else if (embedOrCapsule) {
      pushDiagnostic(
        context.diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `${nodeLabel} requires an explicit x-id when no #id is available for its main-role default.`,
        context.filePath,
      );
    } else if (rawRole.declared) {
      pushDiagnostic(
        context.diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `${nodeLabel} declares projectionRole and requires an explicit x-id.`,
        context.filePath,
      );
    }
  }
  if (xId) registerDocumentIdentity(context.xIds, xId, 'x-id', nodeLabel, context);

  let scope: RuntimeScopeBindingSpec | undefined;
  if (kind === 'capsule') {
    const scopeSection = readUniqueDocumentSection(
      node,
      'Scope',
      context.source,
      context.diagnostics,
      context.filePath,
      false,
      nodeLabel,
    );
    scope = documentScopeFromNode(
      scopeSection.node,
      context.diagnostics,
      context.filePath,
      nodeLabel,
    );
    for (const section of orderedExtendElements(node)) {
      if (section.tag !== 'Scope') {
        pushDiagnostic(
          context.diagnostics,
          HALFCODE_DOCUMENT_DSL_INVALID,
          `${nodeLabel} only permits one Scope in its (...) section, received <${section.tag}>.`,
          context.filePath,
        );
      }
    }
  }
  const scopeId = scope?.scopeId ?? lexicalScopeId;
  const children = bodyDataElements(node)
    .map((child) => readDocumentSkeletonNode(child, scopeId, context));
  const inlineProps = kind === 'component-embed' ? componentInlineProps(node) : undefined;

  return {
    kind,
    tag: node.tag,
    ...(id ? { id } : {}),
    ...(xId ? { xId } : {}),
    ...(projectionRole ? { projectionRole } : {}),
    ...(scopeId ? { scopeId } : {}),
    ...(scope ? { scope } : {}),
    ...(inlineProps ? { inlineProps } : {}),
    children,
  };
}

function loadExternalDocumentRawSource(
  context: UnitLoadContext,
  ref: HalfcodeRef,
  definitionPath: string,
): HalfcodeDocumentRawSource | undefined {
  try {
    const path = resolveVfs(ref, {
      baseDir: dirname(definitionPath),
      workspaceRoot: context.workspaceRoot,
    });
    assertXnlConfigPath(path, 'DocumentSource.ref');
    const text = readRequiredFile(context.resolver, path);
    const xnlDocument = parseCanonicalLoadedXnl(
      context.resolver,
      text,
      path,
      context.workspaceRoot,
    );
    return { path, text, xnlDocument };
  } catch (error) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      `DocumentSource.ref "${ref}" could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      definitionPath,
    );
    return undefined;
  }
}

/** Dedicated renderer-neutral Document definition/source loader. */
function loadDocumentUnit(
  context: UnitLoadContext,
  entry: AppBundleUnitRef,
  filePath: string,
  sourceText: string,
  sourceDocument: XnlDocument,
  root: DataElementNode,
): LoadedHalfcodeUnit {
  const declaredFqn = nodeId(root);
  let unitFqn = entry.fqn;
  if (!declaredFqn) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'Document root requires a #FQN; the registration FQN is retained only for inspection.',
      filePath,
    );
  } else {
    try {
      unitFqn = asUnitFqn(declaredFqn);
    } catch (error) {
      pushDiagnostic(
        context.diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `Document root #${declaredFqn} is not a valid FQN: ${error instanceof Error ? error.message : String(error)}`,
        filePath,
      );
    }
  }
  if (declaredFqn && unitFqn !== entry.fqn) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_UNIT_FQN_CONFLICT,
      `Unit registered as fqn "${entry.fqn}" but Document root declares "#${unitFqn}": ${filePath}`,
      filePath,
    );
  }

  for (const section of orderedExtendElements(root)) {
    if (!DOCUMENT_SECTION_TAG_SET.has(section.tag)) {
      pushDiagnostic(
        context.diagnostics,
        HALFCODE_DOCUMENT_DSL_INVALID,
        `Document root (...) only permits ${DOCUMENT_SECTION_TAGS.join('/')}; received <${section.tag}>.`,
        filePath,
      );
    }
  }

  const contractSection = readUniqueDocumentSection(
    root,
    'DocumentContract',
    sourceDocument,
    context.diagnostics,
    filePath,
    true,
    'Document root',
  );
  const sourceSection = readUniqueDocumentSection(
    root,
    'DocumentSource',
    sourceDocument,
    context.diagnostics,
    filePath,
    false,
    'Document root',
  );
  const scopeSection = readUniqueDocumentSection(
    root,
    'Scope',
    sourceDocument,
    context.diagnostics,
    filePath,
    true,
    'Document root',
  );
  const presentationSection = readUniqueDocumentSection(
    root,
    'DocumentPresentation',
    sourceDocument,
    context.diagnostics,
    filePath,
    true,
    'Document root',
  );

  const contract = documentContractFromNode(
    contractSection.node,
    unitFqn,
    context.diagnostics,
    filePath,
  );
  const rootScope = documentScopeFromNode(
    scopeSection.node,
    context.diagnostics,
    filePath,
    'Document root',
  );
  const presentation = documentPresentationFromNode(
    presentationSection.node,
    context.diagnostics,
    filePath,
  );
  const externalRef = documentSourceRefFromNode(
    sourceSection.node,
    context.diagnostics,
    filePath,
  );
  const hasInlineBody = root.body !== undefined;
  if (hasInlineBody && sourceSection.node) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'Document inline body and external DocumentSource are mutually exclusive.',
      filePath,
    );
  }
  if (!hasInlineBody && !sourceSection.node && !sourceSection.duplicate) {
    pushDiagnostic(
      context.diagnostics,
      HALFCODE_DOCUMENT_DSL_INVALID,
      'Document must declare either an inline body or one external DocumentSource.',
      filePath,
    );
  }

  const definitionSource: HalfcodeDocumentRawSource = {
    path: filePath,
    text: sourceText,
    xnlDocument: sourceDocument,
  };
  let sourceDescriptor: DocumentSourceDescriptor | undefined;
  let rawSource = definitionSource;
  let skeleton: readonly HalfcodeDocumentSkeletonNode[] = [];
  if (hasInlineBody) {
    sourceDescriptor = {
      kind: 'inline',
      unitSourceRef: toWorkspaceRootVfsRef(filePath, context.workspaceRoot),
      region: 'body',
    };
    const skeletonContext: DocumentSkeletonContext = {
      source: sourceDocument,
      filePath,
      unitKindsByFqn: context.unitKindsByFqn,
      diagnostics: context.diagnostics,
      xIds: new Map(),
      nodeIds: new Map(),
    };
    skeleton = bodyDataElements(root)
      .map((node) => readDocumentSkeletonNode(node, rootScope?.scopeId, skeletonContext));
  } else if (externalRef) {
    sourceDescriptor = { kind: 'external', ref: externalRef };
    rawSource = loadExternalDocumentRawSource(context, externalRef, filePath) ?? definitionSource;
  }

  const manifest: HalfcodeUnitManifest = {
    kind: 'document',
    fqn: unitFqn,
    version: stringAttr(root, 'version') ?? '',
    description: stringAttr(root, 'description'),
    domains: [],
  };
  const document: LoadedHalfcodeDocumentProjection = {
    ...(sourceDescriptor ? { sourceDescriptor } : {}),
    definitionSource,
    rawSource,
    ...(contract ? { contract } : {}),
    rootNodeId: declaredFqn ?? String(unitFqn),
    ...(rootScope ? { rootScope } : {}),
    ...(presentation ? { presentation } : {}),
    skeleton,
  };
  const form: HalfcodeUnitForm = basename(filePath) === UNIT_MANIFEST_FILE
    ? 'folder'
    : 'single-file';
  return {
    fqn: unitFqn,
    kind: 'document',
    form,
    path: form === 'folder' ? dirname(filePath) : filePath,
    manifest,
    domains: {},
    ...(contract ? { contract } : {}),
    document,
    scopeRuntimeBindings: [],
  };
}

function finalizeUnit(
  context: UnitLoadContext,
  unit: Omit<LoadedHalfcodeUnit, 'elements' | 'contract' | 'runtime' | 'scopeRuntimeBindings'>,
): LoadedHalfcodeUnit {
  if (unit.kind === 'document') {
    throw new Error(
      `Halfcode Document Unit must use the dedicated Document loader boundary (T3.1): ${unit.path}`,
    );
  }
  const elementsDomain = domainByCanonical(unit.domains, 'elements');
  const contractsDomain = domainByCanonical(unit.domains, 'contracts');
  const runtimeDomain = domainByCanonical(unit.domains, 'runtime');
  const scopesDomain = domainByCanonical(unit.domains, 'scopes');
  validateMessageGrammar(unit.domains, context.diagnostics);
  return {
    ...unit,
    elements: elementsDomain ? parseElements(elementsDomain) : undefined,
    contract: contractsDomain && (unit.kind === 'page' || unit.kind === 'component')
      ? parseUnitContract(contractsDomain, unit.fqn, unit.kind)
      : undefined,
    runtime: runtimeDomain ? parseRuntime(runtimeDomain, context.diagnostics) : undefined,
    scopeRuntimeBindings: scopesDomain
      ? parseScopeRuntimeBindings(scopesDomain)
      : [],
  };
}

/** Validate the small Command/Event grammar after domain discovery. */
function validateMessageGrammar(
  domains: Record<string, HalfcodeUnitDomainDocument>,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
): void {
  for (const domain of Object.values(domains)) {
    for (const root of domain.xnlDocument.nodes) {
      walkDataElements(root, (node) => {
        const data = attrsToPlain({ ...(node.metadata ?? {}), ...(node.attributes ?? {}) });
        if (node.tag === 'Command' && 'type' in data) {
          pushDiagnostic(
            diagnostics,
            HALFCODE_MESSAGE_DSL_INVALID,
            `Command #${nodeId(node) ?? 'unknown'} must not repeat its #id in a type field.`,
            domain.path,
          );
        }
        if (node.tag === 'Event' && stringAttr(node, 'ref') === undefined) {
          const result = validateEventSpec({ id: nodeId(node), ...data });
          for (const issue of result.issues) {
            pushDiagnostic(
              diagnostics,
              issue.code ?? HALFCODE_MESSAGE_DSL_INVALID,
              `Event #${nodeId(node) ?? 'unknown'}: ${issue.message}`,
              domain.path,
            );
          }
        }
        if (node.tag === 'MessagePolicy') {
          const defaultAction = stringAttr(node, 'default');
          if (defaultAction !== undefined && defaultAction !== 'bubble' && defaultAction !== 'reject') {
            pushDiagnostic(
              diagnostics,
              HALFCODE_MESSAGE_DSL_INVALID,
              `MessagePolicy #${nodeId(node) ?? 'unknown'} default must be bubble or reject.`,
              domain.path,
            );
          }
          for (const rule of bodyDataElements(node).filter((child) => child.tag === 'MessageRule')) {
            const action = stringAttr(rule, 'action');
            if (action !== 'consume' && action !== 'bubble' && action !== 'reject') {
              pushDiagnostic(
                diagnostics,
                HALFCODE_MESSAGE_DSL_INVALID,
                `MessageRule in #${nodeId(node) ?? 'unknown'} must use consume, bubble, or reject.`,
                domain.path,
              );
            }
          }
        }
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function pushDiagnostic(
  diagnostics: HalfcodeUnitBundleDiagnostic[],
  code: HalfcodeUnitDiagnosticCode,
  message: string,
  path?: string,
): void {
  const severity = HALFCODE_UNIT_DIAGNOSTIC_SEVERITY[code];
  if (diagnostics.some((existing) => existing.code === code && existing.message === message)) return;
  diagnostics.push({ severity, code, message, path });
}

// ---------------------------------------------------------------------------
// Ref index + privacy resolution (D7)
// ---------------------------------------------------------------------------

/** All `#id`s declared anywhere in a domain document (root included). */
function collectDomainIds(domain: HalfcodeUnitDomainDocument): Set<string> {
  const ids = new Set<string>();
  for (const node of domain.xnlDocument.nodes) {
    walkDataElements(node, (element) => {
      const id = nodeId(element);
      if (id) ids.add(id);
    });
  }
  return ids;
}

interface RefResolutionContext {
  /** 'app' or the unit FQN — used in diagnostics. */
  label: string;
  /** domain → declared ids, for this unit (or the app). */
  domainIds: Map<string, Set<string>>;
}

function buildDomainIdIndex(domains: Record<string, HalfcodeUnitDomainDocument>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const [domain, doc] of Object.entries(domains)) {
    if (PROJECTION_DOMAINS.has(domain)) continue;
    const ids = collectDomainIds(doc);
    index.set(domain, ids);
    const canonicalDomain = canonicalDomainForDomain(domain);
    if (canonicalDomain !== domain) {
      index.set(canonicalDomain, ids);
    }
  }
  return index;
}

function collectContextRefs(
  domains: Record<string, HalfcodeUnitDomainDocument>,
  manifestNodeRefs: string[],
): { ref: string; path: string }[] {
  const out: { ref: string; path: string }[] = [];
  for (const [domain, doc] of Object.entries(domains)) {
    if (PROJECTION_DOMAINS.has(domain)) continue;
    const refs: string[] = [];
    for (const node of doc.xnlDocument.nodes) collectRefStrings(node, refs);
    for (const ref of refs) out.push({ ref, path: doc.path });
  }
  for (const ref of manifestNodeRefs) out.push({ ref, path: 'manifest' });
  return out;
}

function collectDocumentDefinitionRefs(
  document: LoadedHalfcodeDocumentProjection | undefined,
): { ref: string; path: string }[] {
  if (!document) return [];
  const refs: string[] = [];
  for (const node of document.definitionSource.xnlDocument.nodes) collectRefStrings(node, refs);
  return refs.map((ref) => ({ ref, path: document.definitionSource.path }));
}

interface RefCheckerDeps {
  registry: HalfcodeUnitRegistry;
  routeIds: Set<string>;
  routePaths: Set<string>;
  appContext: RefResolutionContext;
  unitContexts: RefResolutionContext[];
  diagnostics: HalfcodeUnitBundleDiagnostic[];
}

function checkContextRefs(
  context: RefResolutionContext,
  refs: { ref: string; path: string }[],
  deps: RefCheckerDeps,
): void {
  for (const { ref, path } of refs) {
    checkRef(ref, path, context, deps);
  }
}

function checkRef(
  ref: string,
  path: string,
  context: RefResolutionContext,
  deps: RefCheckerDeps,
): void {
  let parsed;
  try {
    parsed = parseHalfcodeRef(ref);
  } catch {
    pushDiagnostic(deps.diagnostics, HALFCODE_REF_UNRESOLVED,
      `Malformed halfcode ref "${ref}" in ${context.label}`, path);
    return;
  }

  // Physical addressing: vfs refs pass through untouched (D7).
  if (parsed.scheme === 'vfs') return;

  const entry = schemeTableEntry(parsed.scheme);
  // Strings whose scheme is not in the domain/scheme registry are not halfcode
  // refs (scheme registry = domain registry, D7) — e.g. https:// URLs in data.
  if (!entry) return;

  if (SCOPE_DERIVED_SCHEMES.has(parsed.scheme)) return;

  // Built-in unit registry schemes: existence + kind against the FQN registry.
  if (entry.registryKind) {
    const fqn = parsed.id ?? parsed.path ?? '';
    const registryEntry = deps.registry[fqn];
    if (!registryEntry) {
      pushDiagnostic(deps.diagnostics, HALFCODE_UNIT_NOT_FOUND,
        `Ref "${ref}" in ${context.label} addresses an unregistered unit FQN "${fqn}"`, path);
      return;
    }
    if (registryEntry.kind !== entry.registryKind) {
      pushDiagnostic(deps.diagnostics, HALFCODE_UNIT_KIND_MISMATCH,
        `Ref "${ref}" in ${context.label} expects a ${entry.registryKind} but "${fqn}" is a ${registryEntry.kind}`, path);
    }
    return;
  }

  // Built-in route scheme: resolve against the app route instance table (D13).
  if (parsed.scheme === 'route') {
    if (parsed.id !== undefined) {
      if (!deps.routeIds.has(parsed.id)) {
        pushDiagnostic(deps.diagnostics, HALFCODE_REF_UNRESOLVED,
          `Route ref "${ref}" in ${context.label} does not match any <Route #id>`, path);
      }
      return;
    }
    const routePath = parsed.path ?? '';
    if (!deps.routePaths.has(routePath) && !deps.routePaths.has(`/${routePath}`)) {
      pushDiagnostic(deps.diagnostics, HALFCODE_REF_UNRESOLVED,
        `Route ref "${ref}" in ${context.label} does not match any route path`, path);
    }
    return;
  }

  // Category schemes: app-exclusive domains resolve against the app; everything
  // else resolves in the owning unit only (unit privacy, D7).
  const appOnly = entry.layers.length === 1 && entry.layers[0] === 'app';
  const resolutionContext = appOnly ? deps.appContext : context;

  const ids = resolutionContext.domainIds.get(entry.domain);
  if (parsed.id === undefined) {
    // Hierarchical path form inside a category domain: the loader only checks
    // that the domain is registered in-context; structural walking is G4.
    if (!ids) {
      reportCategoryMiss(ref, path, entry.domain, undefined, context, deps, appOnly);
    }
    return;
  }
  if (ids?.has(parsed.id)) return;
  reportCategoryMiss(ref, path, entry.domain, parsed.id, context, deps, appOnly);
}

function reportCategoryMiss(
  ref: string,
  path: string,
  domain: string,
  id: string | undefined,
  context: RefResolutionContext,
  deps: RefCheckerDeps,
  appOnly: boolean,
): void {
  if (!appOnly && id !== undefined) {
    for (const other of deps.unitContexts) {
      if (other === context) continue;
      if (other.domainIds.get(domain)?.has(id)) {
        pushDiagnostic(deps.diagnostics, HALFCODE_REF_PRIVACY_VIOLATION,
          `Ref "${ref}" in ${context.label} resolves only in unit "${other.label}" (${domain}); category schemes are unit-private (D7)`,
          path);
        return;
      }
    }
  }
  pushDiagnostic(deps.diagnostics, HALFCODE_REF_UNRESOLVED,
    `Ref "${ref}" in ${context.label} does not resolve in its ${domain} domain`, path);
}

// ---------------------------------------------------------------------------
// Element tag registry checks (D4)
// ---------------------------------------------------------------------------

function checkElementTags(
  unit: LoadedHalfcodeUnit,
  registry: HalfcodeUnitRegistry,
  uiLibraries: Set<string>,
  diagnostics: HalfcodeUnitBundleDiagnostic[],
): void {
  const visit = (node: UnitElementNode): void => {
    if (node.kind === 'instance' && isDottedFqnTag(node.tag)) {
      const namespaceRoot = node.tag.split('.')[0];
      if (!uiLibraries.has(namespaceRoot) && !registry[node.tag]) {
        pushDiagnostic(diagnostics, HALFCODE_UNIT_NOT_FOUND,
          `Element tag "${node.tag}" (#${node.id}) in unit "${unit.fqn}" has no unit registry entry and no declared UI library namespace`,
          unit.path);
      }
    }
    for (const child of node.children ?? []) visit(child);
    for (const slot of node.slots ?? []) {
      for (const child of slot.children ?? []) visit(child);
    }
  };
  for (const child of unit.elements?.children ?? []) visit(child);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function resolveManifestPath(
  resolver: HalfcodeUnitBundleResolver,
  bundleSrc: string,
  options: { baseDir: string; workspaceRoot: string; manifestFile?: string },
): string {
  const resolved = resolveVfs(bundleSrc, options);
  if (resolver.isDir(resolved)) {
    if (options.manifestFile) return joinPath(resolved, options.manifestFile);
    const path = joinPath(resolved, UNIT_MANIFEST_FILE);
    if (resolver.readFile(path) != null) return path;
    throw new Error(`Halfcode AppBundle directory has no ${UNIT_MANIFEST_FILE}: ${resolved}`);
  }
  assertXnlConfigPath(resolved, 'manifest');
  return resolved;
}

/**
 * Load a canonical AppBundle. Parse-only: builds the FQN registry, structured
 * routes/wiring/product, per-unit domains/elements/contracts and the unified
 * ref index. No adapter or dynamic-code execution occurs here.
 */
export function loadHalfcodeUnitBundle(
  resolver: HalfcodeUnitBundleResolver,
  bundleSrc: string,
  options: LoadHalfcodeUnitBundleOptions = {},
): LoadedHalfcodeUnitBundle {
  const baseDir = options.baseDir ?? '/';
  const workspaceRoot = options.workspaceRoot ?? '/';
  const uiLibraries = new Set(options.uiLibraries ?? []);
  const diagnostics: HalfcodeUnitBundleDiagnostic[] = [];

  // 1. Canonical AppBundle manifest.
  const manifestPath = resolveManifestPath(resolver, bundleSrc, {
    baseDir,
    workspaceRoot,
    manifestFile: options.manifestFile,
  });
  const manifestDoc = parseCanonicalXnl(readRequiredFile(resolver, manifestPath), manifestPath);
  const manifestRoot = firstDataElement(manifestDoc);
  const manifestDir = dirname(manifestPath);

  // 2. App composition domains. Legacy root vocabularies are not supported.
  if (!manifestRoot || manifestRoot.tag !== 'AppBundle') {
    throw new Error(`Halfcode bundle manifest must contain <AppBundle>: ${manifestPath}`);
  }
  const appBundle = readAppBundleBundle(
    resolver,
    manifestRoot,
    manifestPath,
    workspaceRoot,
    diagnostics,
    options.domainFileInventory,
  );
  const { manifest, appDomains } = appBundle;
  const routesDomain = domainByCanonical(appDomains, 'routes');
  const wiringDomain = domainByCanonical(appDomains, 'wiring');
  const productDomain = domainByCanonical(appDomains, 'product');
  const routes = routesDomain ? parseRoutes(routesDomain) : [];
  const wiring = wiringDomain ? parseWiring(wiringDomain) : [];
  const product = productDomain ? parseProduct(productDomain) : appBundle.product;

  // 3. Unit registration classification is fixed before any source loads, so
  // Document skeleton classification cannot depend on manifest load order.
  const mutableUnitKindsByFqn: Record<string, UnitKind> = {};
  for (const entry of appBundle.units) {
    mutableUnitKindsByFqn[entry.fqn] ??= entry.kind;
  }
  const unitKindsByFqn: Readonly<Record<string, UnitKind>> = Object.freeze(
    mutableUnitKindsByFqn,
  );

  // 4. Units + FQN registry. AppBundle registrations point `src` at unit manifests.
  const unitContext: UnitLoadContext = {
    resolver,
    workspaceRoot,
    diagnostics,
    unitKindsByFqn,
    domainFileInventory: options.domainFileInventory,
  };
  const units: Record<string, LoadedHalfcodeUnit> = {};
  const registry: HalfcodeUnitRegistry = {};
  const loadedUnits: LoadedHalfcodeUnit[] = [];
  const eagerEntries: Array<{ entry: AppBundleUnitRef; filePath: string }> = [];
  for (const entry of appBundle.units) {
    const filePath = resolveVfs(entry.src, { baseDir: manifestDir, workspaceRoot });
    if (entry.kind === 'eager-data-flow') {
      eagerEntries.push({ entry, filePath });
    } else if (isFlowUnitKind(entry.kind)) {
      const attempt = loadCanonicalFlowUnit(unitContext, entry, filePath);
      diagnostics.push(...attempt.diagnostics);
      loadedUnits.push(attempt.unit);
    } else {
      loadedUnits.push(loadAppBundleUnit(unitContext, entry, filePath));
    }
  }

  // Upstream owns eager subflow linking. Build its registry bottom-up, then
  // reload every eager unit once against the complete canonical registry.
  const eagerRegistry: Record<string, EagerDataFlowRegistry[string]> = {};
  let pending = [...eagerEntries];
  while (pending.length > 0) {
    const unresolved: typeof pending = [];
    let progressed = false;
    for (const candidate of pending) {
      const attempt = loadCanonicalFlowUnit(
        unitContext,
        candidate.entry,
        candidate.filePath,
        eagerRegistry,
      );
      const plan = attempt.unit.flow;
      if (plan?.form !== 'EagerDataFlow') {
        unresolved.push(candidate);
        continue;
      }
      eagerRegistry[plan.fqn] = {
        form: plan.form,
        contract: plan.contract,
        subflowEdges: plan.subflowEdges,
      };
      progressed = true;
    }
    pending = unresolved;
    if (!progressed) break;
  }
  for (const candidate of eagerEntries) {
    const attempt = loadCanonicalFlowUnit(
      unitContext,
      candidate.entry,
      candidate.filePath,
      eagerRegistry,
    );
    diagnostics.push(...attempt.diagnostics);
    loadedUnits.push(attempt.unit);
  }

  for (const unit of loadedUnits) {
    const existing = registry[unit.fqn];
    if (existing) {
      pushDiagnostic(diagnostics, HALFCODE_UNIT_FQN_CONFLICT,
        `Unit FQN "${unit.fqn}" is declared by both "${existing.path}" and "${unit.path}"`,
        unit.path);
      continue;
    }
    registry[unit.fqn] = { fqn: unit.fqn, kind: unit.kind, path: unit.path };
    units[unit.fqn] = unit;
  }

  // 5. Route instance tables (D13).
  const routeIds = new Set<string>();
  const routePaths = new Set<string>();
  const indexRoute = (route: RouteSpec): void => {
    routeIds.add(route.id);
    routePaths.add(route.path);
    for (const child of route.children ?? []) indexRoute(child);
  };
  for (const route of routes) indexRoute(route);

  // 6. Element FQN tag existence against the registry (D4).
  for (const unit of Object.values(units)) {
    checkElementTags(unit, registry, uiLibraries, diagnostics);
  }

  // 7. Unified ref index + unit privacy (D7).
  const appContext: RefResolutionContext = {
    label: 'app',
    domainIds: buildDomainIdIndex(appDomains),
  };
  const unitContexts = new Map<string, RefResolutionContext>();
  for (const unit of Object.values(units)) {
    unitContexts.set(unit.fqn, {
      label: unit.fqn,
      domainIds: buildDomainIdIndex(unit.domains),
    });
  }
  const deps: RefCheckerDeps = {
    registry,
    routeIds,
    routePaths,
    appContext,
    unitContexts: [...unitContexts.values()],
    diagnostics,
  };
  checkContextRefs(appContext, collectContextRefs(appDomains, []), deps);
  for (const unit of Object.values(units)) {
    const context = unitContexts.get(unit.fqn) as RefResolutionContext;
    checkContextRefs(context, [
      ...collectContextRefs(unit.domains, []),
      ...collectDocumentDefinitionRefs(unit.document),
    ], deps);
  }

  return {
    manifest,
    manifestPath,
    app: { product, routes, wiring, domains: appDomains },
    units,
    registry,
    diagnostics,
  };
}
